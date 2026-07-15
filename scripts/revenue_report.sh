#!/usr/bin/env bash
# Graysmith Labs revenue snapshot.
#
# Prints a markdown section to stdout. Safe to run with no credentials at all:
# without a key it explains what is missing and exits clean, so the nightly can
# call it unconditionally and light up the moment the key exists.
#
# Secrets come from the environment, never from this file.
#
# Note: no `set -e`. A third party API having a bad day must not take down the
# rest of the nightly report.
set -uo pipefail

# Read the secrets file if the caller has not already loaded it, so this script
# works both standalone and from the nightly. See the note in
# nightly_maintenance.sh: launchd never reads ~/.zshrc, and the plist is public.
SECRETS_FILE="${GRAYSMITH_SECRETS_FILE:-${HOME}/.graysmith_labs_secrets}"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  . "$SECRETS_FILE"
  set +a
fi

RC_KEY="${REVENUECAT_API_KEY:-}"
RC_PROJECT="${REVENUECAT_PROJECT_ID:-}"
API="https://api.revenuecat.com/v2"

# A secrets file anyone can read is a secrets file worth warning about.
if [ -f "$SECRETS_FILE" ]; then
  perms="$(stat -f '%Lp' "$SECRETS_FILE" 2>/dev/null || echo '')"
  case "$perms" in
    600|400) ;;
    '') ;;
    *) echo "> Warning: ${SECRETS_FILE} is mode ${perms}. Run: chmod 600 ${SECRETS_FILE}" ; echo "" ;;
  esac
fi

echo "## revenue"
echo ""

if [ -z "$RC_KEY" ]; then
  cat <<EOF
Not configured, so this is the one number nobody has.

Create \`${SECRETS_FILE}\` containing:

    REVENUECAT_API_KEY="sk_your_v2_secret_key"
    REVENUECAT_PROJECT_ID="your_project_id"

then \`chmod 600\` it.

Do **not** put these in ~/.zshrc. launchd runs /bin/bash and never reads it, so
the key would work when you test by hand and be invisible at 3am. Do not put
them in the plist either; this kit is a public repo.

Get the key from the RevenueCat dashboard: Project settings, then API keys, then
"+ New". Name it, choose **V2**, and grant it \`charts_metrics:overview:read\`,
which is the permission this endpoint needs. Secret keys start with \`sk_\` and
are shown once. If you set the key but not the project id, this script asks
RevenueCat for the id and prints the line to paste.

Until then every revenue decision in the playbook is a guess.
EOF
  echo ""
  exit 0
fi

# A key with no project id is recoverable: ask RevenueCat what projects exist.
if [ -z "$RC_PROJECT" ]; then
  echo "REVENUECAT_PROJECT_ID is not set. Asking RevenueCat what it should be."
  echo ""
  projects=$(curl -sS --max-time 20 -H "Authorization: Bearer ${RC_KEY}" "${API}/projects" 2>&1)
  echo "$projects" | node -e '
    let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
      try {
        const j=JSON.parse(d);
        if (j.type === "authentication_error") {
          console.log("The key was rejected: " + j.message);
          return;
        }
        const items = j.items || [];
        if (!items.length) { console.log("No projects returned."); return; }
        console.log("Add this to ~/.zshrc:");
        console.log("");
        items.forEach(p => console.log(`    export REVENUECAT_PROJECT_ID="${p.id}"   # ${p.name}`));
      } catch (e) { console.log("Could not read the project list: " + d.slice(0,200)); }
    });
  '
  echo ""
  exit 0
fi

overview=$(curl -sS --max-time 20 \
  -H "Authorization: Bearer ${RC_KEY}" \
  "${API}/projects/${RC_PROJECT}/metrics/overview" 2>&1)

echo "$overview" | node -e '
  let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
    let j;
    try { j = JSON.parse(d); }
    catch (e) { console.log("RevenueCat returned something unreadable:"); console.log(""); console.log("    " + String(d).slice(0,300)); return; }

    if (j.type === "authentication_error") {
      console.log("Key rejected: " + j.message);
      console.log("Check that it is a v2 secret key, not a v1 or a public SDK key.");
      return;
    }
    if (j.type || j.message) {
      console.log("RevenueCat error: " + (j.message || j.type));
      return;
    }

    // The overview returns a list of metrics with id/name/value/unit. Render it
    // generically so a shape change degrades into a dump rather than a crash.
    const metrics = j.metrics || j.items;
    if (Array.isArray(metrics) && metrics.length) {
      console.log("| metric | value | period |");
      console.log("| --- | --- | --- |");
      for (const m of metrics) {
        const name = m.name ?? m.id ?? "?";
        let v = m.value;
        if (typeof v === "number") {
          const u = (m.unit || "").toLowerCase();
          v = u.includes("dollar") || u === "usd" || /revenue|mrr/i.test(String(m.id))
            ? "$" + v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})
            : v.toLocaleString();
        }
        console.log(`| ${name} | ${v ?? "?"} | ${m.period ?? m.last_updated_at ?? ""} |`);
      }
    } else {
      console.log("Unrecognised response shape. Raw payload:");
      console.log("");
      console.log("    " + JSON.stringify(j).slice(0,600));
    }
  });
'
echo ""
echo "### ad networks and acquisition"
echo ""
echo "Not wired up. AdMob, AppLovin MAX, and Apple Search Ads each need their own"
echo "credential before they can report here. Subscription revenue above is the"
echo "only source currently connected."
echo ""
