# Graysmith Labs Growth Plan

Written 2026-07-15 against measured data, not guesses. Every step below has a
verifiable outcome and a named baseline, so in four weeks you can say whether it
worked instead of arguing about it.

## The baseline, as of today

| | value | source |
| --- | --- | --- |
| MRR | **$0.00** | RevenueCat, all four projects |
| Active subscriptions | **0** | RevenueCat |
| Active trials | **0** | RevenueCat |
| Ad revenue, 28 days | **$0.08** | AdMob |
| Ad impressions, 28 days | **54** on 125 requests | AdMob |
| Active users, 28 days | **32** | RevenueCat |
| New customers, 28 days | **21** | RevenueCat |
| App Store ratings, all four | **15**, all 5.00 | iTunes lookup |
| Last ship | **2026-06-09** | iTunes lookup |

The nightly report regenerates every one of these, so it is the measuring
instrument for everything below. No new tooling is needed.

## What the numbers actually say

**32 active users produced 54 ad impressions in 28 days.** About 1.7 each.

Drift is a white noise sleep app. A real user opens it nightly and generates
dozens of impressions a month on their own. Instead Drift shows 38 impressions
across 9 active users in four weeks.

Nobody comes back. That is the whole finding. Zero trials and zero subscriptions
are downstream of it: you cannot convert a user who is not there. Any paywall
experiment run today would be measuring noise.

---

## Plan 1: Retention. The reminder that never gets switched on

**Status: shipped in code for Drift and BlitzTap. Both need a build.**

This started as a Drift only plan, which was a mistake. Drift was simply where I
looked first. Checking all four found the same bug in a second app and, more
usefully, found that it does not apply to the other two.

### Per app, measured rather than assumed

| app | retention mechanism | default | onboarding asked? | verdict |
| --- | --- | --- | --- | --- |
| **Drift** | daily wind down reminder | **off** | no | had the bug, **fixed** |
| **BlitzTap** | 24h inactivity streak nudge | **off** | no | had the bug, **fixed** |
| **CelebriDay** | daily holiday notification | — | **yes, already asks** | already correct |
| **SignSnap** | none. `expo-notifications` is not even a dependency | n/a | n/a | **not the mechanic** |

### The bug, in the two that had it

Both apps already had a well built retention mechanism that nothing ever reached.

**Drift**: a daily notification reading "Time to wind down. Open Drift and prepare
for restful sleep." `sleep-store.ts` defaulted `reminderEnabled: false`,
onboarding never mentioned notifications, and `setReminder` was called from
exactly one place: a Settings screen. A sleep app shipped with its nightly habit
switched off.

**BlitzTap**: an inactivity reminder that reschedules 24 hours out on every open,
so it fires only after a full day away, telling the player their coins are
waiting. `notificationsEnabled: false` in both SettingsContext and storage, never
mentioned in onboarding. A streak game that never asks you to keep your streak.

### The changes

**Drift**: the final onboarding slide now asks for permission and schedules the
existing 8:00 PM reminder. "Not now" completes onboarding untouched.

**BlitzTap**: onboarding completion now calls `setNotificationsEnabled(true)`,
which already requested permission, scheduled the reminder, persisted the
setting, and left it off when denied. Nothing new was written. The existing path
was simply never called from anywhere but a Settings switch.

### Why the other two are excluded

**CelebriDay already does this.** Its onboarding has a "Turn On Notifications"
step calling `NotificationService.requestPermissions()`. Nothing to fix. If
CelebriDay still fails to retain, the cause is elsewhere and this plan does not
address it.

**SignSnap should not do this.** It is an episodic utility, genre Business, "Sign
for FREE!". People open it when they have a document to sign. A daily "sign
something!" nudge would be spam, and `expo-notifications` is correctly not even
installed. Its zero revenue is a real problem, but retention is the wrong frame
for it: the question there is conversion at the moment of need, not habit.

### Verify

1. Ship a build of **both** apps. These are native permission prompts, so they
   need real builds, not over the air updates.
2. On a clean install, finish onboarding and confirm the system permission prompt
   appears. Drift: tap Enable Bedtime Reminder. BlitzTap: the prompt fires as
   onboarding closes.
3. Drift: confirm a notification arrives at 8:00 PM. BlitzTap: leave the app for
   24 hours and confirm the coins reminder fires.
4. **The real check, four weeks out, from the nightly report:** ad impressions per
   active user, per app.

| app | baseline, 28 days | expectation if this works |
| --- | --- | --- |
| Drift | 38 impressions / 9 users = **4.2** | rises |
| BlitzTap | 5 impressions / 9 users = **0.6** | rises |
| CelebriDay | 3 / 5 = **0.6** | unchanged, nothing was fixed |
| SignSnap | 8 / 9 = **0.9** | unchanged, and that is fine |

CelebriDay and SignSnap are the control group. If all four move together,
something else caused it and the reminders get no credit.

### Honest risk

Drift's 8:00 PM default is a guess. It matches the existing store default, so it
is at least consistent, but it may be early for some people.

BlitzTap now fires a bare OS permission prompt with no explanation in front of
it, which is a weaker ask than Drift's explicit slide and will be denied more
often. It is still strictly better than never asking, and the fix if opt in looks
poor is to add a slide explaining the streak before the prompt.

If opt in rates look fine and retention still does not move, the reminder was not
the problem and this plan is wrong. That would point at the harder question:
whether these apps are worth returning to at all.

---

## Plan 2: Free trials

**Status: blocked on you. This is not a code change.**

### The finding

Every subscription product in all four apps reports `trial_duration: NONE`.
Confirmed via the RevenueCat API across all four projects.

**"Active Trials: 0" is therefore not a bug. It is arithmetic.** No trial is
offered, so no trial can start. Nothing in the code can change this.

### Why code cannot fix it

A free trial is an **introductory offer on the subscription product in App Store
Connect**. RevenueCat reads it; it does not create it. The paywall displays
whatever the store says. So this is App Store Connect work, on your account, and
it is yours to do.

### Steps

For each subscription product, in App Store Connect:

1. My Apps, then the app, then Subscriptions, then the subscription group.
2. Pick the product, for example `drift_premium_monthly`.
3. Introductory Offers, then Create, then **Free Trial**.
4. Duration: **7 days** is the standard starting point. Territories: all.
5. Save, then wait for RevenueCat to sync, usually minutes.

Products to cover, from the live catalogue:

* **Drift**: `drift_premium_monthly`
* **CelebriDay**: `celebriday_premium_monthly`, `celebriday_premium_yearly`
* **SignSnap**: `signsnap_premium_weekly`, `signsnap_premium_monthly`,
  `signsnap_premium_yearly`
* **BlitzTap**: none. It sells a one time unlock, and trials do not apply.

### Verify

Objectively, with one command:

```
bash scripts/revenue_report.sh
```

Then re-run the trial probe. `trial=NONE` must become a duration. That is a
binary, checkable outcome, not an opinion.

Then, four weeks out: **Active Trials** in the nightly report should stop being
zero. Baseline **0**. Any number above zero proves the funnel is alive for the
first time.

### Sequencing note

Do this **after** Plan 1 has been shipping for a couple of weeks. Trials given to
users who never return convert at zero, and you will have burned the experiment
and learned nothing. Retention first, monetisation second.

---

## Plan 3: Traffic and ASO

**Status: investigated, needs your judgement. Least certain of the three.**

### The finding

21 new customers in 28 days across four live listings is close to organic zero.
The apps are not being found.

What is verifiable from public data:

* All four are **Free**, so price is not the barrier.
* All four are rated **5.00**, so quality is not the barrier either. 15 ratings
  is too few to matter, but nothing is repelling people.
* Nothing has shipped since **2026-06-09**. App Store ranking rewards recency,
  and five weeks of silence does not help.
* First description lines are decent hooks: "Fall asleep faster tonight!",
  "How fast can you react?"
* Drift's subtitle is "Sleep Soundly Every Night".

### What I could not verify

The iTunes lookup API returned **zero screenshots** for all four apps across
iPhone, iPad, and Apple TV fields. Apple does not approve apps without
screenshots, so this is far more likely an API quirk than the truth, and I am not
going to build a recommendation on it.

**Check this yourself**, since it takes ten seconds and matters enormously: open
each listing on a phone and confirm real screenshots are there and that they sell
the app. If any listing genuinely has none or has placeholders, that alone
explains the traffic and jumps to the top of this list.

### Steps, in order of leverage

1. **Keywords.** The 100 character keyword field is invisible in the API and is
   the highest leverage ASO surface. Confirm each app targets terms people
   search, not brand words. "white noise", "sleep sounds", "rain sounds" for
   Drift, not "Drift".
2. **Subtitle.** Thirty characters, indexed for search. "Sleep Soundly Every
   Night" is pleasant and searchable by nobody. "White Noise & Sleep Sounds"
   carries actual search terms.
3. **Ship something.** Five weeks of silence is a ranking signal. Plan 1 gives
   you a legitimate reason to ship.
4. **Screenshots.** Confirm they exist, then confirm the first two carry the
   value proposition, since that is all anyone sees in results.

### Verify

Honestly: **weakly, and not from this kit.** App Store impressions and product
page views live in App Store Connect analytics, which is not wired up and needs
its own credential.

The proxy available today is **new customers per 28 days** in the nightly report,
baseline **21**. It is a lagging, noisy signal. If ASO work matters, wire up App
Store Connect analytics before trusting conclusions here.

---

## The order, and why

1. **Plan 1**, retention, is shipped and free. Nothing works without it.
2. **Plan 2**, trials, is a 20 minute App Store Connect task, blocked only on
   you, with a binary verification.
3. **Plan 3**, ASO, is the highest ceiling and the weakest measurement. Do it
   once the first two have run.

## What this plan deliberately refuses

The `revenue_playbook.md` in this repo recommends paywall A/B tests, cross
promotion, ad mediation tuning, and Search Ads keyword harvesting.

**All of it is premature and should not be attempted yet.** Every one of those
levers assumes traffic and a working funnel. With 32 active users and zero
returning, an A/B test cannot reach significance this decade, cross promotion has
no audience to recycle, and tuning mediation on 54 impressions optimises noise.
Fixing fill from 43% to 90% moves you from $0.08 to $0.17.

Come back to the playbook when retention is real. Not before.
