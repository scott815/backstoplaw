const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 3060;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "backstop_data");

const KNOWN_PAIRS = ["local-vs-dev", "dev-vs-test", "test-vs-live"];
const VALID_ENVS = new Set(["local", "dev", "test", "staging", "live", "prod"]);
const CANONICAL = { staging: "test", prod: "live" };

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

// runs: Map<pairName, { logs, listeners, done, exitCode }>
const runs = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const mime = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function getLatestTimestamp(pairDir) {
  const testDir = path.join(pairDir, "bitmaps_test");
  try {
    const entries = fs
      .readdirSync(testDir)
      .filter((e) => /^\d{8}-\d{6}$/.test(e))
      .sort()
      .reverse();
    return entries[0] || null;
  } catch {
    return null;
  }
}

function getPairStatus(pair) {
  const [ref, test] = pair.split("-vs-");
  const pairDir = path.join(DATA_DIR, pair);
  const result = {
    pair,
    ref,
    test,
    lastRun: null,
    passed: 0,
    failed: 0,
    hasReport: false,
    running: runs.has(pair) && !runs.get(pair).done,
  };

  const latest = getLatestTimestamp(pairDir);
  if (!latest) return result;

  // Parse YYYYMMDD-HHMMSS into an ISO timestamp
  const y = latest.slice(0, 4);
  const mo = latest.slice(4, 6);
  const d = latest.slice(6, 8);
  const h = latest.slice(9, 11);
  const mi = latest.slice(11, 13);
  const s = latest.slice(13, 15);
  result.lastRun = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).toISOString();

  const reportPath = path.join(pairDir, "bitmaps_test", latest, "report.json");
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    for (const t of report.tests || []) {
      if (t.status === "pass") result.passed++;
      else result.failed++;
    }
  } catch {
    // report.json missing or malformed — leave counts at 0
  }

  result.hasReport = fs.existsSync(
    path.join(pairDir, "html_report", "index.html")
  );

  return result;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function apiStatus(res) {
  const discovered = new Set();
  try {
    fs.readdirSync(DATA_DIR).forEach((e) => {
      const stat = fs.statSync(path.join(DATA_DIR, e));
      if (stat.isDirectory() && /^.+-vs-.+$/.test(e)) discovered.add(e);
    });
  } catch {
    // DATA_DIR doesn't exist yet — no results
  }

  const allPairs = [...new Set([...KNOWN_PAIRS, ...discovered])];
  json(res, 200, allPairs.map(getPairStatus));
}

function apiRun(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let ref, test;
    try {
      ({ ref, test } = JSON.parse(body));
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }

    if (!VALID_ENVS.has(ref) || !VALID_ENVS.has(test)) {
      return json(res, 400, { error: "Invalid environment name" });
    }

    const refCanon = CANONICAL[ref] || ref;
    const testCanon = CANONICAL[test] || test;
    const pairName = `${refCanon}-vs-${testCanon}`;

    if (runs.has(pairName) && !runs.get(pairName).done) {
      return json(res, 409, { error: "Run already in progress", runId: pairName });
    }

    const run = { logs: [], listeners: [], done: false, exitCode: null };

    const proc = spawn("./compare.sh", [ref, test], {
      cwd: ROOT,
      env: { ...process.env },
    });

    function emit(line) {
      run.logs.push(line);
      for (const fn of run.listeners) fn(line, null);
    }

    proc.stdout.on("data", (d) =>
      d
        .toString()
        .split("\n")
        .forEach((l) => l && emit(l))
    );
    proc.stderr.on("data", (d) =>
      d
        .toString()
        .split("\n")
        .forEach((l) => l && emit(l))
    );

    proc.on("close", (code) => {
      run.done = true;
      run.exitCode = code;
      for (const fn of run.listeners) fn(null, code);
    });

    run.process = proc;
    runs.set(pairName, run);

    json(res, 200, { runId: pairName });
  });
}

function apiLogs(req, runId, res) {
  const run = runs.get(runId);
  if (!run) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Run not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Flush buffered output first
  for (const line of run.logs) {
    res.write(`data: ${JSON.stringify(line)}\n\n`);
  }

  if (run.done) {
    res.write(`event: done\ndata: ${run.exitCode}\n\n`);
    res.end();
    return;
  }

  const listener = (line, exitCode) => {
    if (line === null) {
      res.write(`event: done\ndata: ${exitCode}\n\n`);
      res.end();
      remove();
    } else {
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
  };

  function remove() {
    const idx = run.listeners.indexOf(listener);
    if (idx !== -1) run.listeners.splice(idx, 1);
  }

  run.listeners.push(listener);
  req.on("close", remove);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const { method } = req;
  const pathname = new URL(req.url, "http://localhost").pathname;

  // Serve dashboard
  if (method === "GET" && pathname === "/") {
    return serveFile(res, path.join(ROOT, "dashboard.html"));
  }

  // Serve backstop_data files (reports, screenshots, fonts)
  if (method === "GET" && pathname.startsWith("/backstop_data/")) {
    const filePath = path.resolve(ROOT, pathname.slice(1));
    // Security: must stay within DATA_DIR
    if (!filePath.startsWith(DATA_DIR + path.sep) && filePath !== DATA_DIR) {
      res.writeHead(403);
      res.end();
      return;
    }
    return serveFile(res, filePath);
  }

  // API routes
  if (method === "GET" && pathname === "/api/status") return apiStatus(res);
  if (method === "POST" && pathname === "/api/run") return apiRun(req, res);

  const logsMatch = pathname.match(/^\/api\/logs\/(.+)$/);
  if (method === "GET" && logsMatch) return apiLogs(req, logsMatch[1], res);

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error(`Kill the existing process or set a different port:`);
    console.error(`  PORT=3001 npm start`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`BackstopJS Dashboard → http://localhost:${PORT}`);
});
