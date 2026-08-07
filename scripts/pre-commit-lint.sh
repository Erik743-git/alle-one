#!/usr/bin/env sh
set -e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

STAGED="$(git diff --cached --name-only --diff-filter=ACM)"

BACKEND_FILES="$(printf '%s\n' "$STAGED" | grep -E '^backend/(src|apps|libs|test)/.*\.(ts|tsx|js)$' || true)"
FRONTEND_FILES="$(printf '%s\n' "$STAGED" | grep -E '^frontend/.*\.(ts|tsx|js|jsx)$' || true)"

if [ -z "$BACKEND_FILES" ] && [ -z "$FRONTEND_FILES" ]; then
  exit 0
fi

echo "==> pre-commit: ESLint (mesmas regras do CI)"

if [ -n "$BACKEND_FILES" ]; then
  echo "-- backend (lint --fix + re-stage)"
  REL="$(printf '%s\n' "$BACKEND_FILES" | sed 's|^backend/||')"
  # shellcheck disable=SC2086
  (cd backend && npx eslint --fix $REL)
  printf '%s\n' "$BACKEND_FILES" | while IFS= read -r f; do
    [ -n "$f" ] && git add -- "$f"
  done
  echo "-- backend (lint:ci nos staged)"
  # shellcheck disable=SC2086
  (cd backend && npx eslint $REL)
fi

if [ -n "$FRONTEND_FILES" ]; then
  echo "-- frontend (eslint --fix + re-stage)"
  REL="$(printf '%s\n' "$FRONTEND_FILES" | sed 's|^frontend/||')"
  # shellcheck disable=SC2086
  (cd frontend && npx eslint --fix $REL)
  printf '%s\n' "$FRONTEND_FILES" | while IFS= read -r f; do
    [ -n "$f" ] && git add -- "$f"
  done
  echo "-- frontend (eslint CI nos staged)"
  # shellcheck disable=SC2086
  (cd frontend && npx eslint $REL)
fi

echo "==> pre-commit lint OK"
