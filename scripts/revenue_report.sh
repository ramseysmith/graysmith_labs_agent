#!/usr/bin/env bash
# Graysmith Labs revenue snapshot.
#
# Loads the secrets file and hands off to revenue_report.js, which does the work.
# Kept as the entry point because the README and the nightly both reference it.
#
# RevenueCat secret keys are project scoped, so each app needs its own key. See
# revenue_report.js for the variable names.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# launchd runs /bin/bash and never reads ~/.zshrc, so exports there are invisible
# to the 3am run even though they work when you test by hand. They cannot go in
# the plist either, because this kit is a public repo. So they live outside the
# working tree, where both launchd and your shell can reach them.
SECRETS_FILE="${GRAYSMITH_SECRETS_FILE:-${HOME}/.graysmith_labs_secrets}"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$SECRETS_FILE"
  set +a

  # A secrets file anyone can read is a secrets file worth warning about.
  perms="$(stat -f '%Lp' "$SECRETS_FILE" 2>/dev/null || echo '')"
  case "$perms" in
    600|400|'') ;;
    *)
      echo "> Warning: ${SECRETS_FILE} is mode ${perms}. Run: chmod 600 ${SECRETS_FILE}"
      echo ""
      ;;
  esac
fi

exec node "${SCRIPT_DIR}/revenue_report.js"
