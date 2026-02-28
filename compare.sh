#!/usr/bin/env bash
set -euo pipefail

# Usage: ./compare.sh <ref_env> <test_env> [extra backstop flags]
# Example: ./compare.sh local dev
#          ./compare.sh test live --filter="Homepage"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <ref_env> <test_env> [extra backstop flags]"
  echo ""
  echo "Environments: local, dev, test, live (aliases: staging, prod)"
  echo ""
  echo "Examples:"
  echo "  $0 local dev"
  echo "  $0 test live"
  echo "  $0 dev test --filter=\"Homepage\""
  exit 1
fi

REF="$1"
TEST="$2"
shift 2

echo "==> Capturing reference screenshots from: $REF"
npx backstop reference --config=backstop.config.js --ref="$REF" --test="$TEST" "$@"

echo ""
echo "==> Capturing test screenshots from: $TEST"
npx backstop test --config=backstop.config.js --ref="$REF" --test="$TEST" "$@"
