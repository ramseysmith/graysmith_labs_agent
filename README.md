# Graysmith Labs Autonomous Portfolio Agent

A starter kit that turns Claude Code on your home laptop into a semi autonomous
maintainer and builder for the app portfolio (CelebriDay, BlitzTap, SignSnap,
Drift), steerable from your phone, with a hard gate on anything irreversible.

## The two layer design

1. **Steering layer.** Claude Code with Remote Control runs on the laptop. You
   check in, unblock, review diffs, and approve deploys from the Claude mobile
   app while you are away from the desk.
2. **Unattended layer.** A nightly scheduled job runs bounded, safe maintenance
   and leaves a report plus proposed changes waiting for you. This is what keeps
   working when the laptop is idle and the network blips, since a live Remote
   Control session is meant for active managed workflows rather than fully
   unattended runs.

## What is in this kit

```
graysmith_labs_agent/
  README.md                         this file
  CLAUDE.md                         the agent charter and guardrails
  SPEC_template.md                  the per app spec that drives new builds
  revenue_playbook.md               paywall experiments, cross promotion, dashboard
  scripts/
    nightly_maintenance.sh          the 3am job. calls the two below, then
                                    checks each repo. writes the report.
    appstore_watch.js               ratings, versions, and new reviews. public
                                    Apple endpoints, no credentials needed.
    revenue_report.sh               RevenueCat snapshot. prints what is missing
                                    and exits clean until the key is set.
    deploy_ota.sh                   gated over the air update wrapper
  launchd/
    com.graysmithlabs.nightly.plist macOS scheduler for the nightly job
  .github/
    workflows/ci.yml                the npm CI workflow. copy it into an app
                                    repo to use it. Drift needs the bun variant.
  reports/                          generated, gitignored
  state/                            what the watch saw last time, gitignored
```

The report is ordered the way you read it: what users see, what they pay, then
code health. The first two are the ones you act on.

Each script prints one markdown section to stdout and can be run on its own:

```
node scripts/appstore_watch.js
bash scripts/revenue_report.sh
```

## Paths this machine depends on

Two things bite any scheduled job on this Mac and are worth knowing before you
edit anything here.

**launchd has almost no PATH.** It runs with `/usr/bin:/bin:/usr/sbin:/sbin`, so
node, npm, and bun are all invisible to it. The script and the plist both put
them back. If you move a toolchain, fix both.

**`~/Documents` is protected by macOS.** A scheduled job cannot read your repos
there without Full Disk Access granted to `/bin/bash` in System Settings, under
Privacy and Security. Without it every repo read fails with Operation not
permitted.

Because of both, **never verify this job by running the script in your terminal.**
Your shell has a PATH and permissions launchd does not. The only honest test is:

```
launchctl start com.graysmithlabs.nightly
```

then read the report and check `launchctl list | grep graysmith` for the exit
code. The preflight section at the top of every report exists to catch exactly
this class of lie.

## Part 1: the steps only you can do

These touch your credentials and your hardware, so they have to run on your
machine. Everything else in this kit is ready to use.

### 1. Install Claude Code

```
npm install -g @anthropic-ai/claude-code
```

### 2. Authenticate and start Remote Control

Run Claude Code in a repo once to accept the trust prompt, sign in, then enable
Remote Control:

```
claude
/login
/rc
```

Remote Control keeps execution on your machine and opens no inbound ports, so
your filesystem, EAS credentials, and RevenueCat keys never leave the laptop.

### 3. Connect your phone

Install the Claude mobile app, open the Code tab, and pick your session from the
list (it shows a computer icon with a green dot when online). If you do not have
the app yet, run `/mobile` inside Claude Code for a download link.

### 4. Set your secrets in your shell profile

Add these to `~/.zshrc` (never commit them):

```
export REVENUECAT_API_KEY="your_v2_secret_key"
export REVENUECAT_PROJECT_ID="your_project_id"
```

### 5. Point the scripts at your repos

Open `scripts/nightly_maintenance.sh` and set the local path for each app in the
`APPS` map.

### 6. Install the nightly job (macOS)

```
cp launchd/com.graysmithlabs.nightly.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.graysmithlabs.nightly.plist
```

Edit the plist first to replace `YOUR_USERNAME` with your account name. On Linux,
use the one line cron alternative noted at the top of the plist file instead.

### 7. Keep the laptop awake

Either set the power option so the machine never sleeps on power, or wrap your
session:

```
caffeinate -s claude
```

## Part 2: the approval gates

The agent proposes, you tap yes. The charter in CLAUDE.md tells it to never do
any of the following without your explicit approval from the phone:

* App Store submission of any build
* Subscription price or product changes in RevenueCat
* Ad spend or campaign budget changes in Apple Search Ads or any network
* Any purchase, transfer, or account setting change

Everything reversible (branches, pull requests, over the air experiments it can
roll back, preview builds) runs freely.

## Part 3: how the day feels

Overnight the scheduled job updates each repo, runs the checks, and writes a
report to `~/graysmith_labs_reports`. In the morning you open the Claude app,
read the report, and tell the agent which proposed changes to ship. It opens a
pull request, CI runs the tests, you merge from your phone, and it pushes an over
the air update. Store submissions and money touching changes wait for your tap.

## Good to know

Remote Control is a research preview. Each Claude Code instance supports one
remote session at a time, the terminal must stay open, and if the machine loses
network for roughly ten minutes the session times out and needs a restart. That
is exactly why the unattended work lives in the scheduled job rather than in a
live session.
