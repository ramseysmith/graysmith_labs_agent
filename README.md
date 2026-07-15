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
  revenue_playbook.md               paywall experiments, cross promotion, dashboard.
                                    premature as of 2026-07-15, see growth_plan.md
  growth_plan.md                    what to actually do, measured against real
                                    numbers, with verifiable outcomes
  scripts/
    nightly_maintenance.sh          the 3am job. calls the two below, then
                                    checks each repo. writes the report.
    appstore_watch.js               ratings, versions, and new reviews. public
                                    Apple endpoints, no credentials needed.
    revenue_report.sh               entry point: loads secrets, runs the two below
    revenue_report.js               RevenueCat, one key per project, portfolio table
    admob_report.js                 AdMob earnings per app. OAuth, no service accounts.
    admob_setup.sh                  one time AdMob browser consent, prints the
                                    refresh token to paste
    deploy_ota.sh                   gated over the air update wrapper
  launchd/
    com.graysmithlabs.nightly.plist macOS scheduler for the nightly job
  templates/
    ci-npm.yml                      CI for the npm apps: CelebriDay, BlitzTap,
                                    SignSnap
    ci-bun.yml                      CI for Drift, which npm cannot install
  reports/                          generated, gitignored
  state/                            what the watch saw last time, gitignored
```

The CI files live in `templates/` on purpose. Anything under `.github/workflows/`
is a **live** workflow, and GitHub would run it against this repo, which has no
`package.json` to install. They are meant to be copied into an app repo:

```
cp templates/ci-npm.yml ../CelebriDay/.github/workflows/ci.yml
cp templates/ci-bun.yml ../drift-app/.github/workflows/ci.yml
```

Pick by lockfile, not by habit. Drift has a `bun.lock` and a stale
`package-lock.json`, and `npm ci` fails on it outright.

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

### 4. Set your secrets, and not in your shell profile

**RevenueCat secret keys are project scoped.** Per the docs, "Secret API keys are
project-wide", so there is no account wide key. Four apps in four projects means
**four keys**, one created inside each project. OAuth tokens are the only cross
project option and are far more machinery than a nightly job needs.

Create `~/.graysmith_labs_secrets`:

```
REVENUECAT_CELEBRIDAY_KEY="sk_..."
REVENUECAT_CELEBRIDAY_PROJECT="proj..."
REVENUECAT_BLITZTAP_KEY="sk_..."
REVENUECAT_BLITZTAP_PROJECT="proj..."
REVENUECAT_SIGNSNAP_KEY="sk_..."
REVENUECAT_SIGNSNAP_PROJECT="proj..."
REVENUECAT_DRIFT_KEY="sk_..."
REVENUECAT_DRIFT_PROJECT="proj..."
```

then lock it down:

```
chmod 600 ~/.graysmith_labs_secrets
```

The `_PROJECT` lines are optional. A project scoped key can only see its own
project, so if you leave one out the script asks RevenueCat which project the key
belongs to and prints the line to paste. Fill them in once and it stops looking.

Partial configuration is fine. Apps with a key report; apps without are listed as
not set. Start with one and add the rest.

**Not `~/.zshrc`.** launchd runs `/bin/bash`, which never reads that file, so a
key exported there works perfectly when you test by hand and is invisible at 3am.
The revenue section would say "not configured" every morning while you assumed it
was working.

**Not the plist either.** This kit is a public repo and the plist is in it.

The file above sits outside the working tree, so it cannot be committed by
accident, and both launchd and your shell can read it. Override the location with
`GRAYSMITH_SECRETS_FILE` if you prefer somewhere else.

#### Getting the four RevenueCat keys

Repeat this **once per project**, switching projects in the dashboard each time.
The key belongs to whichever project you were in when you made it.

In the RevenueCat dashboard: **Project settings**, then **API keys**, then
**+ New**. Give it a name, select **V2** as the version, and grant it
**`charts_metrics:overview:read`**, which is the permission the metrics overview
endpoint requires. Select **Generate**.

Secret keys are prefixed `sk_` and are shown **once**, so paste each one straight
into the file above. A v1 key or a public SDK key (`appl_...`, `goog_...`) will be
rejected, and the report names which app was rejected rather than failing as a
whole.

Run `bash scripts/revenue_report.sh` to check your work. It reports each app
separately, so a typo in one key does not hide the other three. The Charts and
Metrics endpoints are rate limited to 25 requests per minute, and the nightly
makes at most eight calls, so the limit is not a concern.

#### AdMob, which is a different and worse story

RevenueCat only knows about subscriptions. For ad supported apps that is not the
whole picture, and treating it as the whole picture is how you conclude you earn
nothing when you do.

AdMob has **no API key**. It supports OAuth only and **does not support service
accounts**, so a background job needs a refresh token captured once through a
browser.

**Set the publishing status to "In production" first.** Google issues a refresh
token that **expires in 7 days** to any project whose consent screen is external
and still in "Testing". Your ad revenue would report for a week and then silently
go to zero.

That rule is about **publishing status, not scope sensitivity**. The AdMob scopes
are classified **non-sensitive**, which is genuinely useful (no Google
verification, no unverified app warning, no 100 user cap) but does **not** exempt
you. The only exemption is for apps requesting nothing but `userinfo.email`,
`userinfo.profile`, and `openid`, and we need `admob.report`. Testing still means
seven days.

The console no longer has an "OAuth consent screen" wizard. It is now **Google
Auth Platform**, with Branding, Audience, Clients, and Data Access as separate
pages.

1. In the Google Cloud console, create or pick a project and **enable the AdMob
   API**. A dedicated project is worth it: billing attaches per project, and
   keeping this one to AdMob alone means there is no billable surface. The AdMob
   API itself is free.
2. Menu, then **Google Auth Platform**, then **Branding**. Name the app, add your
   email, and set the audience to **External**. Internal needs a Workspace
   organisation, which a personal account does not have.
3. **Audience**, then **PUBLISH APP**, so publishing status reads **In
   production**. This is the step that matters. Do not submit for verification;
   non-sensitive scopes never need it.
4. **Data Access**, then **Add or remove scopes**. The AdMob scopes are not in the
   common list, so use **Manually add scopes** and paste both:

```
https://www.googleapis.com/auth/admob.readonly
https://www.googleapis.com/auth/admob.report
```

   Add to table, Update, Save. They land under **non-sensitive**, which is
   correct.

5. **Clients**, then **Create client**. Application type **Desktop app**. Desktop
   clients accept any loopback port, which is what the setup script needs. A Web
   application client would force you to pre register an exact port, and the
   script picks a free one at random.
6. Put the client id and secret in your secrets file:

```
ADMOB_CLIENT_ID="....apps.googleusercontent.com"
ADMOB_CLIENT_SECRET="..."
```

7. Run the one time consent:

```
bash scripts/admob_setup.sh
```

It opens your browser. Pick the Google account **that owns your AdMob**, which
matters if you are signed into more than one. Approve. It prints an
`ADMOB_REFRESH_TOKEN` line to paste into the secrets file. The publisher id is
discovered on the first report and printed for you to paste too.

If the token ever dies, the report says so in plain words rather than leaving you
with a bare `invalid_grant`, and the fix is to rerun the setup script.

AppLovin MAX and Apple Search Ads are still unwired. Both also need their own
credentials.

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
