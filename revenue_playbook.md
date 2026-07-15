# Graysmith Labs Revenue Playbook

Concrete levers for the agent to run, in priority order.

## 1. Paywall experiments (highest leverage)

Run a continuous experiment loop through RevenueCat so paywall changes ship over
the air with no App Store review.

First experiment to run:

* Hypothesis: leading with the annual plan and a clear per week price lifts trial
  starts without hurting conversion.
* Control: current paywall.
* Variant: annual plan shown first, monthly below, with the annual price broken
  down to a per week figure.
* Metric that decides it: trial start rate, then trial to paid conversion.
* Duration: run until each arm has enough trials to separate the two, then
  promote the winner and retire the loser.
* Rule: never run more than one paywall variable at a time per app, so the result
  is readable.

Roll the same template across all four apps once it proves out on the highest
traffic one.

## 2. Cross promotion between the four apps

You already pay to acquire users. Recycle them across the portfolio for free.

* Add a house ad slot in each app that promotes the other three, weighted toward
  the app with the best trial conversion that week.
* Trigger it at a natural pause, for example after a completed action, not on
  cold start.
* Track install source so you can see how much free installs the loop generates.

This is close to zero cost and compounds as the portfolio grows.

## 3. Portfolio bundle

Introduce a single Graysmith Labs entitlement that unlocks premium across all
four apps. It raises average revenue per user and gives every app a built in
reason to mention the others. RevenueCat handles the shared entitlement, so this
is mostly a paywall and config change. This one touches pricing, so it ships only
after your approval.

## 4. Apple Search Ads keyword harvesting

* Pull the search term report on a schedule.
* Move budget toward terms that convert to trials.
* Flag terms with spend and no conversions for you to cut.
* Any budget change waits for your tap.

## 5. Ad mediation tuning

Watch effective revenue per thousand impressions by placement across AppLovin MAX
and AdMob, and adjust waterfalls or price floors where one network is clearly
underpaying. Ship changes over the air and measure.

## 6. Portfolio revenue dashboard

A single view you can read from your phone.

* Sources: RevenueCat for subscription revenue and trials, AdMob and AppLovin for
  ad revenue, Apple Search Ads for spend.
* Headline numbers: monthly recurring revenue, net of ad spend, trial starts, and
  trial to paid by app.
* Delivery: the nightly job writes the numbers into the morning report, and later
  a small always on page if you want it.
* Optional next step: feed Valentine Tide store and Printful numbers in so the
  whole operation reports to one place.

## First 30 days, in order

1. Stand up the dashboard so every later change is measurable.
2. Ship the first paywall experiment on the highest traffic app.
3. Turn on cross promotion across all four apps.
4. Start Apple Search Ads keyword harvesting with approval gates.
5. Prototype the portfolio bundle and bring it to you for a pricing decision.
