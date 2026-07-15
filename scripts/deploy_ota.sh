#!/usr/bin/env bash
set -euo pipefail

# Over the air update via EAS. Reversible, but still gated on explicit confirmation.
# Usage: CONFIRM=yes ./deploy_ota.sh <app_path> <branch> "<message>"

APP_PATH="${1:?app path required}"
BRANCH="${2:?branch required}"
MESSAGE="${3:?message required}"

cd "$APP_PATH"

echo "About to publish an over the air update:"
echo "  app:     $APP_PATH"
echo "  branch:  $BRANCH"
echo "  message: $MESSAGE"

if [ "${CONFIRM:-no}" != "yes" ]; then
  echo "Dry run only. Re run with CONFIRM=yes to publish."
  exit 0
fi

eas update --branch "$BRANCH" --message "$MESSAGE"
