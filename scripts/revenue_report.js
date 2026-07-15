#!/usr/bin/env node
'use strict';

// Graysmith Labs revenue snapshot.
//
// RevenueCat secret keys are project scoped: "Secret API keys are project-wide".
// There is no account wide secret key, so a four app portfolio needs four keys,
// one per project. This walks all four and prints a single portfolio table.
//
// Reads its config from the environment. revenue_report.sh sources the secrets
// file and execs this, so run that rather than this directly.
//
// Never throws. A third party API having a bad day must not cost you the rest of
// the nightly report.

const API = 'https://api.revenuecat.com/v2';
const TIMEOUT_MS = 20000;

// env is the suffix: REVENUECAT_<env>_KEY and REVENUECAT_<env>_PROJECT
const APPS = [
  { name: 'CelebriDay', env: 'CELEBRIDAY' },
  { name: 'BlitzTap', env: 'BLITZTAP' },
  { name: 'SignSnap', env: 'SIGNSNAP' },
  { name: 'Drift', env: 'DRIFT' },
];

const SECRETS_FILE =
  process.env.GRAYSMITH_SECRETS_FILE || `${process.env.HOME}/.graysmith_labs_secrets`;

async function rc(path, key) {
  const res = await fetch(`${API}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// A project scoped key can only see its own project, so this returns exactly one
// entry and is a convenience for people who have the key but not the id.
async function discoverProject(key) {
  const { ok, body } = await rc('/projects', key);
  if (!ok) return null;
  const items = body.items || [];
  return items.length === 1 ? items[0].id : null;
}

function metricsFrom(body) {
  const list = body.metrics || body.items;
  if (!Array.isArray(list)) return null;
  const out = {};
  for (const m of list) {
    const id = m.id ?? m.name;
    if (!id) continue;
    out[id] = {
      name: m.name ?? id,
      value: m.value,
      unit: m.unit ?? '',
      // Without the window, "Revenue 0" and "New Customers 21" are unreadable.
      period: m.period ?? m.period_type ?? '',
    };
  }
  return out;
}

function isMoney(id, unit) {
  return /revenue|mrr|arr|proceeds/i.test(id) || /usd|dollar/i.test(unit || '');
}

function fmt(v, id, unit) {
  if (v === null || v === undefined) return '?';
  if (typeof v !== 'number') return String(v);
  return isMoney(id, unit)
    ? '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toLocaleString();
}

async function main() {
  console.log('## revenue');
  console.log('');

  const configured = APPS.map((a) => ({
    ...a,
    key: process.env[`REVENUECAT_${a.env}_KEY`] || '',
    project: process.env[`REVENUECAT_${a.env}_PROJECT`] || '',
  }));

  const withKeys = configured.filter((a) => a.key);

  if (!withKeys.length) {
    console.log('Not configured, so this is the one number nobody has.');
    console.log('');
    console.log('RevenueCat secret keys are **project scoped**. There is no account wide');
    console.log('key, so each app needs its own. Create `' + SECRETS_FILE + '`:');
    console.log('');
    console.log('```');
    for (const a of APPS) {
      // Pad the assembled assignment, never the variable name itself.
      const k = `REVENUECAT_${a.env}_KEY="sk_..."`;
      const p = `REVENUECAT_${a.env}_PROJECT="proj..."`;
      console.log(`${k.padEnd(42)} # ${a.name}`);
      console.log(`${p.padEnd(42)} # optional, discovered if omitted`);
    }
    console.log('```');
    console.log('');
    console.log('Then `chmod 600` it. Do not use ~/.zshrc: launchd never reads it, so the');
    console.log('key would work by hand and be invisible at 3am. Do not use the plist: this');
    console.log('repo is public.');
    console.log('');
    console.log('For each key, in that project: Project settings, API keys, "+ New",');
    console.log('version **V2**, permission `charts_metrics:overview:read`, then Generate.');
    console.log('Keys start with `sk_` and are shown once.');
    console.log('');
    // AdMob is an independent source. Not having RevenueCat configured is no
    // reason to withhold ad revenue, which for an ad supported app may be all of it.
    const admobOnly = require('./admob_report.js');
    await admobOnly();
    return;
  }

  const results = [];
  for (const app of configured) {
    if (!app.key) {
      results.push({ app, error: 'no key set' });
      continue;
    }
    try {
      let project = app.project;
      if (!project) {
        project = await discoverProject(app.key);
        if (!project) {
          results.push({ app, error: 'no project id, and could not discover it from the key' });
          continue;
        }
        results.push({ app, discovered: project });
      }
      const { ok, status, body } = await rc(`/projects/${project}/metrics/overview`, app.key);
      if (!ok) {
        const msg = body.message || `HTTP ${status}`;
        results.push({ app, error: msg });
        continue;
      }
      const metrics = metricsFrom(body);
      if (!metrics) {
        results.push({ app, error: 'unrecognised response shape', raw: JSON.stringify(body).slice(0, 200) });
        continue;
      }
      const prev = results.find((r) => r.app === app && r.discovered);
      if (prev) prev.metrics = metrics;
      else results.push({ app, metrics });
    } catch (err) {
      results.push({ app, error: err.message || String(err) });
    }
  }

  const good = results.filter((r) => r.metrics);
  if (good.length) {
    // Union of metric ids across apps, so a shape change degrades gracefully.
    const ids = [];
    for (const r of good) for (const id of Object.keys(r.metrics)) if (!ids.includes(id)) ids.push(id);

    const cols = good.map((r) => r.app.name);
    console.log(`| metric | window | ${cols.join(' | ')} | portfolio |`);
    console.log(`| --- | --- | ${cols.map(() => '---').join(' | ')} | --- |`);

    // Periods come back as ISO 8601 durations. Say them in English, because
    // "Revenue 0 / P28D" is not a thing anyone should have to decode at 7am.
    // PT1H and friends mark point in time metrics that refresh hourly, so MRR
    // and active subscriptions are "right now" rather than a window.
    const humanPeriod = (p) => {
      if (!p) return 'current';
      if (/^PT\d+[HMS]$/.test(p)) return 'right now';
      let m;
      // RevenueCat sends P0D for point in time balances like active
      // subscriptions. A zero length window is not "last 0 days", it is now.
      if (/^P0D$/.test(p)) return 'right now';
      if ((m = /^P(\d+)D$/.exec(p))) return m[1] === '1' ? 'last 24 hours' : `last ${m[1]} days`;
      if ((m = /^P(\d+)W$/.exec(p))) return m[1] === '1' ? 'last week' : `last ${m[1]} weeks`;
      if ((m = /^P(\d+)M$/.exec(p))) return m[1] === '1' ? 'last month' : `last ${m[1]} months`;
      if ((m = /^P(\d+)Y$/.exec(p))) return m[1] === '1' ? 'last year' : `last ${m[1]} years`;
      return p;
    };

    for (const id of ids) {
      const sample = good.find((r) => r.metrics[id])?.metrics[id];
      const label = sample?.name || id;
      const unit = sample?.unit || '';
      const window = humanPeriod(sample?.period);
      const cells = [];
      let sum = 0;
      let summable = true;
      for (const r of good) {
        const m = r.metrics[id];
        const v = m ? m.value : undefined;
        if (typeof v === 'number') sum += v;
        else if (v !== undefined) summable = false;
        cells.push(m ? fmt(v, id, unit) : '-');
      }
      // Averages and rates must not be added together.
      const isRate = /rate|percent|conversion|average|arpu/i.test(id);
      const total = summable && !isRate ? fmt(sum, id, unit) : '-';
      console.log(`| ${label} | ${window} | ${cells.join(' | ')} | ${total} |`);
    }
    console.log('');
    console.log('Rates and averages show no portfolio total on purpose, because adding them');
    console.log('together would be meaningless.');
    console.log('');
  }

  const problems = results.filter((r) => r.error);
  if (problems.length) {
    console.log('### revenue problems');
    console.log('');
    for (const p of problems) {
      console.log(`* **${p.app.name}**: ${p.error}${p.raw ? ' — ' + p.raw : ''}`);
    }
    console.log('');
  }

  const discovered = results.filter((r) => r.discovered);
  if (discovered.length) {
    console.log('### project ids discovered');
    console.log('');
    console.log('Paste these into your secrets file to skip a lookup each night:');
    console.log('');
    console.log('```');
    for (const d of discovered) console.log(`REVENUECAT_${d.app.env}_PROJECT="${d.discovered}"`);
    console.log('```');
    console.log('');
  }

  // AdMob owns the ad section. Subscription revenue alone is not the whole
  // picture for ad supported apps, and reporting it as if it were is how you end
  // up believing you earn nothing.
  const admob = require('./admob_report.js');
  await admob();
}

main().catch((err) => {
  console.log('## revenue');
  console.log('');
  console.log(`Revenue report failed: ${err && err.message ? err.message : err}`);
  console.log('');
});
