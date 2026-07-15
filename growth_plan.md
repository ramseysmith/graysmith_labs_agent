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

## Plan 1: Retention. Drift's bedtime reminder

**Status: shipped in code, needs a build.**

### The bug

Drift already had the perfect retention mechanism: a daily notification reading
"Time to wind down. Open Drift and prepare for restful sleep." It was
unreachable in practice.

* `sleep-store.ts` defaults `reminderEnabled: false`
* Onboarding never mentioned notifications
* `setReminder` was called from exactly one place: a Settings screen

So a sleep app whose entire value is a nightly habit shipped with its nightly
habit switched off.

### The change

The final onboarding slide now asks for notification permission and schedules
the existing 8:00 PM reminder. "Not now" completes onboarding untouched. Settings
still owns the time and the off switch.

### Verify

1. Ship a build. This is a native permission prompt, so it needs a real build,
   not an over the air update.
2. On a clean install, finish onboarding, tap Enable, and confirm the system
   permission prompt appears.
3. Confirm a notification arrives at 8:00 PM.
4. **The real check, four weeks out, from the nightly report:** Drift's ad
   impressions per active user. Baseline is **38 impressions across 9 users**,
   about 4.2 each over 28 days. If the reminder works, impressions per user rises
   because people return more than once. If it does not move, the reminder is not
   the problem and this plan is wrong.

### Honest risk

An 8:00 PM default is a guess. It matches the existing store default, so it is
consistent, but it may be early for some people. If opt in rates look fine and
retention still does not move, the next question is whether the app is worth
returning to at all, which is a harder problem than a notification.

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
