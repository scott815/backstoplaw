const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 3060;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "backstop_data");

const KNOWN_PAIRS = ["local-vs-dev", "dev-vs-test", "test-vs-liveV2", "liveV2-vs-ESIprod"];
const VALID_ENVS = new Set(["local", "dev", "test", "staging", "liveV2", "prod", "ESIprod"]);
const CANONICAL = { staging: "test", prod: "liveV2" };

const ENVIRONMENTS = {
  local:   "https://authorities.lndo.site",
  dev:     "https://dev-esirestructure.pantheonsite.io",
  test:    "https://test-esirestructure.pantheonsite.io",
  liveV2:  "https://live-esirestructure.pantheonsite.io",
  ESIprod: "https://esicorporatewebsite.prod.acquia-sites.com",
};

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

function readScenarios() {
  const p = path.join(ROOT, "scenarios.js");
  delete require.cache[require.resolve(p)];
  return require(p);
}

function writeScenarios(scenarios) {
  const lines = scenarios.map((s) => "  " + JSON.stringify(s) + ",");
  const content =
    `/**\n * Page definitions — single source of truth for all scenarios.\n` +
    ` *\n * Each entry becomes a BackstopJS scenario. To add a page, just append\n` +
    ` * another object. Per-page overrides (delay, selectors, etc.) are merged\n` +
    ` * into the scenario defaults defined in backstop.config.js.\n */\n` +
    `module.exports = [\n${lines.join("\n")}\n];\n`;
  fs.writeFileSync(path.join(ROOT, "scenarios.js"), content);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    let ref, test, tag, viewports;
    try {
      ({ ref, test, tag, viewports } = JSON.parse(body));
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

    const args = [ref, test];
    if (tag) {
      const scenarios = readScenarios();
      const matching = scenarios.filter((s) => (s.tags || []).includes(tag));
      if (!matching.length) {
        return json(res, 400, { error: `No pages are tagged "${tag}"` });
      }
      const regex = matching.map((s) => escapeRegex(s.label)).join("|");
      args.push(`--filter=(${regex})`);
    }
    const vpList = Array.isArray(viewports) && viewports.length ? viewports : null;
    if (vpList && vpList.length < 3) {
      args.push(`--viewports=${vpList.join(",")}`);
    }

    const proc = spawn("./compare.sh", args, {
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

      // Auto-archive summary
      try {
        const archiveDir = path.join(DATA_DIR, pairName, "archive");
        fs.mkdirSync(archiveDir, { recursive: true });
        const ts = getLatestTimestamp(path.join(DATA_DIR, pairName));
        if (ts) {
          const reportPath = path.join(DATA_DIR, pairName, "bitmaps_test", ts, "report.json");
          const raw = JSON.parse(fs.readFileSync(reportPath, "utf8"));
          const summary = {
            timestamp: ts,
            pair: pairName,
            ref: refCanon,
            test: testCanon,
            tag: tag || null,
            viewports: vpList || ["desktop", "tablet", "mobile"],
            ran: new Date().toISOString(),
            passed: 0, failed: 0, total: 0,
            tests: (raw.tests || []).map((t) => ({
              label: t.pair.label,
              viewport: t.pair.viewportLabel,
              status: t.status,
              misMatchPercentage: t.pair.diff ? t.pair.diff.misMatchPercentage : null,
            })),
          };
          for (const t of summary.tests) {
            summary.total++;
            if (t.status === "pass") summary.passed++; else summary.failed++;
          }
          fs.writeFileSync(
            path.join(archiveDir, `${ts}.json`),
            JSON.stringify(summary, null, 2)
          );
        }
      } catch { /* non-fatal */ }
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

function apiGetScenarios(res) {
  try {
    json(res, 200, { scenarios: readScenarios(), environments: ENVIRONMENTS });
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

function apiAddScenario(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let label, pagePath, tags;
    try {
      ({ label, path: pagePath, tags } = JSON.parse(body));
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }

    if (!label || !label.trim()) {
      return json(res, 400, { error: "Label is required" });
    }
    if (!pagePath || !pagePath.startsWith("/")) {
      return json(res, 400, { error: "Path must start with /" });
    }

    const scenarios = readScenarios();
    if (scenarios.some((s) => s.path === pagePath)) {
      return json(res, 409, { error: `Path "${pagePath}" already exists` });
    }

    const entry = { label: label.trim(), path: pagePath };
    const cleanedTags = (Array.isArray(tags) ? tags : [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (cleanedTags.length) entry.tags = cleanedTags;

    scenarios.push(entry);
    writeScenarios(scenarios);
    json(res, 200, { scenarios });
  });
}

function apiDeleteScenario(index, res) {
  const scenarios = readScenarios();
  if (index < 0 || index >= scenarios.length) {
    return json(res, 400, { error: "Index out of range" });
  }
  scenarios.splice(index, 1);
  writeScenarios(scenarios);
  json(res, 200, { scenarios });
}

function apiUpdateScenarioTags(req, index, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let tags;
    try {
      ({ tags } = JSON.parse(body));
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }

    const scenarios = readScenarios();
    if (index < 0 || index >= scenarios.length) {
      return json(res, 400, { error: "Index out of range" });
    }

    const cleaned = (Array.isArray(tags) ? tags : [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (cleaned.length) {
      scenarios[index].tags = cleaned;
    } else {
      delete scenarios[index].tags;
    }

    writeScenarios(scenarios);
    json(res, 200, { scenarios });
  });
}

function apiQuickRun(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let label, pagePath, ref, test, viewports;
    try {
      ({ label, path: pagePath, ref, test, viewports } = JSON.parse(body));
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }

    if (!pagePath || !pagePath.startsWith("/")) {
      return json(res, 400, { error: "Path must start with /" });
    }
    if (!VALID_ENVS.has(ref) || !VALID_ENVS.has(test)) {
      return json(res, 400, { error: "Invalid environment" });
    }

    const refCanon  = CANONICAL[ref]  || ref;
    const testCanon = CANONICAL[test] || test;
    const refBase   = ENVIRONMENTS[refCanon];
    const testBase  = ENVIRONMENTS[testCanon];

    const runId    = `quick-${Date.now()}`;
    const quickDir = path.join(DATA_DIR, "quick-runs");
    const cfgPath  = path.join(quickDir, `config-${runId}.json`);

    fs.mkdirSync(quickDir, { recursive: true });

    const scenarioLabel = (label && label.trim()) || pagePath;
    const config = {
      id: runId,
      engine: "puppeteer",
      viewports: (() => {
        const all = [
          { label: "desktop", width: 1920, height: 1080 },
          { label: "tablet",  width: 1024, height: 768  },
          { label: "mobile",  width: 375,  height: 812  },
        ];
        return Array.isArray(viewports) && viewports.length ? all.filter((v) => viewports.includes(v.label)) : all;
      })(),
      scenarios: [{
        label: scenarioLabel,
        url: testBase + pagePath,
        referenceUrl: refBase + pagePath,
        delay: 1500,
        misMatchThreshold: 0.1,
        requireSameDimensions: false,
        selectors: ["document"],
        removeSelectors: [
          "#onetrust-consent-sdk", "#onetrust-banner-sdk",
          ".cookie-banner", "[id*='cookie']", "[class*='cookie-consent']",
          "iframe[src*='doubleclick']", "iframe[src*='googlesyndication']",
          "iframe[src*='adservice']",
        ],
      }],
      onBeforeScript: "puppet/onBefore.js",
      onReadyScript: "puppet/onReady.js",
      paths: {
        bitmaps_reference: `backstop_data/quick-runs/${runId}/bitmaps_reference`,
        bitmaps_test:      `backstop_data/quick-runs/${runId}/bitmaps_test`,
        engine_scripts:    "backstop_data/engine_scripts",
        html_report:       `backstop_data/quick-runs/${runId}/html_report`,
        ci_report:         `backstop_data/quick-runs/${runId}/ci_report`,
      },
      engineOptions: { ignoreHTTPSErrors: true, args: ["--no-sandbox"], protocolTimeout: 120000 },
      asyncCaptureLimit: 3,
      asyncCompareLimit: 10,
    };

    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

    const relCfg = path.relative(ROOT, cfgPath);
    const run = { logs: [], listeners: [], done: false, exitCode: null };

    const proc = spawn(
      "sh",
      ["-c", `npx backstop reference --config="${relCfg}" && npx backstop test --config="${relCfg}"`],
      { cwd: ROOT, env: { ...process.env } }
    );

    function emit(line) {
      run.logs.push(line);
      for (const fn of run.listeners) fn(line, null);
    }

    proc.stdout.on("data", (d) => d.toString().split("\n").forEach((l) => l && emit(l)));
    proc.stderr.on("data", (d) => d.toString().split("\n").forEach((l) => l && emit(l)));
    proc.on("close", (code) => {
      run.done = true;
      run.exitCode = code;
      for (const fn of run.listeners) fn(null, code);
    });

    run.process = proc;
    runs.set(runId, run);

    json(res, 200, {
      runId,
      reportUrl: `/backstop_data/quick-runs/${runId}/html_report/index.html`,
    });
  });
}

function apiGetReport(pair, res) {
  const pairDir = path.join(DATA_DIR, pair);
  const ts = getLatestTimestamp(pairDir);
  if (!ts) return json(res, 404, { error: "No runs yet" });

  const reportPath = path.join(pairDir, "bitmaps_test", ts, "report.json");
  try {
    const raw = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const [ref, test] = pair.split("-vs-");
    const y=ts.slice(0,4),mo=ts.slice(4,6),d=ts.slice(6,8),
          h=ts.slice(9,11),mi=ts.slice(11,13),s=ts.slice(13,15);
    const summary = {
      timestamp: ts,
      pair, ref, test,
      tag: null,
      ran: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).toISOString(),
      passed: 0, failed: 0, total: 0,
      tests: (raw.tests || []).map((t) => ({
        label: t.pair.label,
        viewport: t.pair.viewportLabel,
        status: t.status,
        misMatchPercentage: t.pair.diff ? t.pair.diff.misMatchPercentage : null,
      })),
    };
    for (const t of summary.tests) {
      summary.total++;
      if (t.status === "pass") summary.passed++; else summary.failed++;
    }
    try {
      const arch = JSON.parse(fs.readFileSync(
        path.join(pairDir, "archive", `${ts}.json`), "utf8"));
      summary.tag = arch.tag || null;
    } catch { /* no archive yet */ }
    json(res, 200, summary);
  } catch (err) {
    json(res, 500, { error: err.message });
  }
}

function apiGetArchive(pair, res) {
  const archiveDir = path.join(DATA_DIR, pair, "archive");
  try {
    const files = fs.readdirSync(archiveDir)
      .filter((f) => f.endsWith(".json"))
      .sort().reverse()
      .slice(0, 30);
    const entries = files.map((f) => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(archiveDir, f), "utf8"));
        return { timestamp: d.timestamp, ran: d.ran, tag: d.tag || null,
                 viewports: d.viewports || null,
                 passed: d.passed, failed: d.failed, total: d.total };
      } catch { return null; }
    }).filter(Boolean);
    json(res, 200, { pair, entries });
  } catch {
    json(res, 200, { pair, entries: [] });
  }
}

function apiRestart(res) {
  json(res, 200, { message: "Restarting…" });
  setTimeout(() => {
    const child = spawn(process.execPath, [__filename], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();
    process.exit(0);
  }, 150);
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
  if (method === "GET"  && pathname === "/api/status")    return apiStatus(res);
  if (method === "POST" && pathname === "/api/run")        return apiRun(req, res);
  if (method === "GET"  && pathname === "/api/scenarios")  return apiGetScenarios(res);
  if (method === "POST" && pathname === "/api/scenarios")  return apiAddScenario(req, res);

  const delMatch = pathname.match(/^\/api\/scenarios\/(\d+)$/);
  if (method === "DELETE" && delMatch) return apiDeleteScenario(Number(delMatch[1]), res);

  const tagsMatch = pathname.match(/^\/api\/scenarios\/(\d+)\/tags$/);
  if (method === "PATCH" && tagsMatch) return apiUpdateScenarioTags(req, Number(tagsMatch[1]), res);

  if (method === "POST" && pathname === "/api/quick-run") return apiQuickRun(req, res);
  if (method === "POST" && pathname === "/api/restart")   return apiRestart(res);

  const logsMatch = pathname.match(/^\/api\/logs\/(.+)$/);
  if (method === "GET" && logsMatch) return apiLogs(req, logsMatch[1], res);

  const reportMatch = pathname.match(/^\/api\/report\/(.+)$/);
  if (method === "GET" && reportMatch) return apiGetReport(reportMatch[1], res);

  const archiveMatch = pathname.match(/^\/api\/archive\/(.+)$/);
  if (method === "GET" && archiveMatch) return apiGetArchive(archiveMatch[1], res);

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
