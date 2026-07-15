#!/usr/bin/env bash
# One time AdMob authorisation. Loads your secrets file so ADMOB_CLIENT_ID and
# ADMOB_CLIENT_SECRET are available, then runs the loopback OAuth flow.
#
# Run this yourself. It opens a browser, you consent, and it prints the refresh
# token line to paste back into the secrets file.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="${HOME}/.local/node/bin:${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"

SECRETS_FILE="${GRAYSMITH_SECRETS_FILE:-${HOME}/.graysmith_labs_secrets}"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$SECRETS_FILE"
  set +a
fi

exec node "${SCRIPT_DIR}/admob_setup.js"
