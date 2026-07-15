#!/usr/bin/env bash
set -euo pipefail

# Graysmith Labs nightly maintenance.
# Safe and non destructive. It never submits to the store or changes pricing.
# It refreshes each repo, runs the checks, and writes a report you review.

# launchd runs with a bare PATH of /usr/bin:/bin:/usr/sbin:/sbin, so node and npm
# are invisible to the 3am run unless we put them back on the PATH here.
export PATH="${HOME}/.local/node/bin:${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:${PATH}"

# Resolve everything from the script location so the kit can be moved as a unit.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(dirname "$SCRIPT_DIR")"

# Secrets.
#
# launchd runs /bin/bash and never reads ~/.zshrc, so exports you put there are
# invisible to the 3am run even though they work perfectly when you test by hand.
# They cannot go in the plist either, because this kit is a public repo.
#
# So they live in a file outside the working tree, which both launchd and your
# terminal can read and which cannot be committed by accident.
SECRETS_FILE="${GRAYSMITH_SECRETS_FILE:-${HOME}/.graysmith_labs_secrets}"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  . "$SECRETS_FILE"
  set +a
fi

REPORT_DIR="${KIT_DIR}/reports"
mkdir -p "$REPORT_DIR"
STAMP="$(date +%Y_%m_%d)"
REPORT="${REPORT_DIR}/nightly_${STAMP}.md"

# Set the local path for each app repo.
# Entries are name:path so this runs on macOS system bash 3.2, which has no
# associative arrays. Paths may not contain a colon.
APPS=(
  "celebriday:$HOME/Documents/Github/CelebriDay"
  "blitztap:$HOME/Documents/Github/blitztap"
  "signsnap:$HOME/Documents/Github/sign-snap"
  "drift:$HOME/Documents/Github/drift-app"
)

echo "# Nightly maintenance ${STAMP}" > "$REPORT"
echo "" >> "$REPORT"

# Preflight. A scheduled run once wrote a complete looking report while every
# check underneath it was failing, so prove the environment works before trusting
# anything below.
preflight_ok=1
{
  echo "## preflight"
  if command -v npm >/dev/null 2>&1; then
    echo "npm ok at $(command -v npm), version $(npm --version 2>/dev/null)"
  else
    echo "FAIL: npm is not on PATH. Nothing below this line can be believed."
    preflight_ok=0
  fi
  # macOS protects ~/Documents. A launchd job can only read it with Full Disk
  # Access granted to the interpreter that runs this script.
  probe="${APPS[0]#*:}"
  if ( cd "$probe" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1 ); then
    echo "repo access ok"
  else
    echo "FAIL: cannot read ${probe}"
    echo "Grant Full Disk Access to /bin/bash in System Settings, Privacy and"
    echo "Security, Full Disk Access. Until then the scheduled run sees nothing."
    preflight_ok=0
  fi
  echo ""
} >> "$REPORT" 2>&1

if [ "$preflight_ok" -ne 1 ]; then
  echo "Preflight failed. See ${REPORT}" >&2
  exit 1
fi

# Outward facing signal first. What users see and what they pay is what you act
# on in the morning; code health is the boring part and can wait below.
# Both of these are designed to exit clean on their own, and are guarded anyway
# so a third party outage cannot take down the rest of the report.
node "${SCRIPT_DIR}/appstore_watch.js" >> "$REPORT" 2>&1 || true
bash "${SCRIPT_DIR}/revenue_report.sh" >> "$REPORT" 2>&1 || true

echo "## repos" >> "$REPORT"
echo "" >> "$REPORT"

for entry in "${APPS[@]}"; do
  name="${entry%%:*}"
  path="${entry#*:}"
  {
    echo "## ${name}"
    if [ ! -d "$path" ]; then
      echo "Path not found: ${path}"
      echo ""
      continue
    fi
    cd "$path"

    # Respect each repo's package manager. drift is a bun project and npm cannot
    # install it at all, so assuming npm everywhere produced a false failure.
    if [ -f "bun.lock" ] && command -v bun >/dev/null 2>&1; then
      pm="bun"
    else
      pm="npm"
    fi

    echo "### git"
    # Fenced because `git status --branch` prints "## master...origin/master",
    # which markdown would otherwise render as a header and wreck the outline.
    echo '```'
    git fetch --quiet || echo "git fetch FAILED (private repo needs a stored credential?)"
    git status --short --branch || true
    echo '```'
    echo ""

    echo "### install (${pm})"
    if [ "$pm" = "bun" ]; then
      if bun install --frozen-lockfile >/dev/null 2>&1; then echo "bun install ok"; else echo "bun install FAILED"; fi
    else
      if npm ci >/dev/null 2>&1; then echo "npm ci ok"; else echo "npm ci FAILED"; fi
    fi
    echo ""

    echo "### checks"
    # Separate "no script defined" from "script ran and failed". Collapsing the
    # two into one message hid real breakage before.
    for check in typecheck lint test; do
      if ! node -e "var s=require('./package.json').scripts||{};process.exit(s['${check}']?0:1)" 2>/dev/null; then
        echo "${check}: no script defined"
      elif "$pm" run "$check" >/dev/null 2>&1; then
        echo "${check}: pass"
      else
        echo "${check}: FAILING"
      fi
    done
    echo ""

    echo "### outdated dependencies"
    echo '```'
    if [ "$pm" = "bun" ]; then bun outdated || true; else npm outdated || true; fi
    echo '```'
    echo ""
  } >> "$REPORT" 2>&1
done

echo "Report written to ${REPORT}"
