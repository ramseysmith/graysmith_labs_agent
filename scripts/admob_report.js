#!/usr/bin/env node
'use strict';

// AdMob earnings, per app, for the same 28 day window RevenueCat reports.
//
// AdMob does not support service accounts, so this runs on a stored refresh
// token obtained once via admob_setup.js. Prints a markdown section to stdout.
//
// Never throws. Google having a bad day must not cost the rest of the report.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://admob.googleapis.com/v1';
const TIMEOUT_MS = 25000;
const WINDOW_DAYS = 28;

function ymd(d) {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

async function accessToken(id, secret, refresh) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant is the signature of the 7 day testing-mode expiry, and of a
    // revoked token. Worth naming, because the raw error tells you nothing.
    const hint =
      body.error === 'invalid_grant'
        ? ' — the refresh token is dead. If your OAuth consent screen is on "Testing", ' +
          'Google expires it after 7 days. Set it to "In production", then rerun admob_setup.js.'
        : '';
    throw new Error(`${body.error || res.status}: ${body.error_description || ''}${hint}`);
  }
  return body.access_token;
}

async function api(path, token, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  return body;
}

async function main() {
  console.log('### ad networks and acquisition');
  console.log('');

  const id = process.env.ADMOB_CLIENT_ID || '';
  const secret = process.env.ADMOB_CLIENT_SECRET || '';
  const refresh = process.env.ADMOB_REFRESH_TOKEN || '';

  if (!id || !secret || !refresh) {
    console.log('**AdMob** not configured. Unlike RevenueCat there is no API key to paste:');
    console.log('AdMob supports OAuth only, with no service accounts, so it needs a one time');
    console.log('browser consent. See the README, then run `bash scripts/admob_setup.sh`.');
    console.log('');
    console.log('AppLovin MAX and Apple Search Ads are still unwired.');
    console.log('');
    return;
  }

  let token;
  try {
    token = await accessToken(id, secret, refresh);
  } catch (e) {
    console.log(`**AdMob** auth failed: ${e.message}`);
    console.log('');
    return;
  }

  let publisher = process.env.ADMOB_PUBLISHER_ID || '';
  try {
    if (!publisher) {
      const accts = await api('/accounts', token);
      const list = accts.account || [];
      if (!list.length) {
        console.log('**AdMob** returned no accounts for this login.');
        console.log('');
        return;
      }
      publisher = list[0].publisherId;
      console.log(`Discovered publisher id \`${publisher}\`. Add this to your secrets file`);
      console.log('to skip the lookup each night:');
      console.log('');
      console.log('```');
      console.log(`ADMOB_PUBLISHER_ID="${publisher}"`);
      console.log('```');
      console.log('');
    }

    const end = new Date();
    const start = new Date(end.getTime() - (WINDOW_DAYS - 1) * 86400000);

    const report = await api(`/accounts/${publisher}/networkReport:generate`, token, {
      method: 'POST',
      body: JSON.stringify({
        reportSpec: {
          dateRange: { startDate: ymd(start), endDate: ymd(end) },
          dimensions: ['APP'],
          metrics: ['ESTIMATED_EARNINGS', 'IMPRESSIONS', 'AD_REQUESTS'],
        },
      }),
    });

    // The response is a stream: a header object, then row objects, then a footer.
    const rows = (Array.isArray(report) ? report : []).filter((x) => x && x.row).map((x) => x.row);

    if (!rows.length) {
      console.log(`**AdMob**: no rows for the last ${WINDOW_DAYS} days. Either no impressions`);
      console.log('were served, or these apps are not reporting to this publisher account.');
      console.log('');
      return;
    }

    let totalEarn = 0;
    let totalImp = 0;
    let totalReq = 0;
    const out = [];

    for (const r of rows) {
      const app =
        r.dimensionValues?.APP?.displayLabel || r.dimensionValues?.APP?.value || 'unknown';
      // Earnings come back in micros. Dividing by a million is the whole trick.
      const earn = Number(r.metricValues?.ESTIMATED_EARNINGS?.microsValue || 0) / 1e6;
      const imp = Number(r.metricValues?.IMPRESSIONS?.integerValue || 0);
      const req = Number(r.metricValues?.AD_REQUESTS?.integerValue || 0);
      totalEarn += earn;
      totalImp += imp;
      totalReq += req;
      out.push({ app, earn, imp, req });
    }

    out.sort((a, b) => b.earn - a.earn);

    console.log(`**AdMob**, last ${WINDOW_DAYS} days:`);
    console.log('');
    console.log('| app | earnings | impressions | requests | fill |');
    console.log('| --- | --- | --- | --- | --- |');
    for (const r of out) {
      const fill = r.req ? ((r.imp / r.req) * 100).toFixed(1) + '%' : '-';
      console.log(
        `| ${r.app} | $${r.earn.toFixed(2)} | ${r.imp.toLocaleString()} | ${r.req.toLocaleString()} | ${fill} |`
      );
    }
    const fillT = totalReq ? ((totalImp / totalReq) * 100).toFixed(1) + '%' : '-';
    console.log(
      `| **total** | **$${totalEarn.toFixed(2)}** | ${totalImp.toLocaleString()} | ${totalReq.toLocaleString()} | ${fillT} |`
    );
    console.log('');
    console.log('Fill is impressions divided by requests. A low fill means demand is not');
    console.log('showing up for your inventory, which is a different problem from low traffic.');
    console.log('');
  } catch (e) {
    console.log(`**AdMob** report failed: ${e.message}`);
    console.log('');
  }

  console.log('AppLovin MAX and Apple Search Ads are still unwired.');
  console.log('');
}

// Exported so revenue_report.js can await it and keep the sections in order.
// A bare require() would not wait for an async main and would interleave output.
async function safeMain() {
  try {
    await main();
  } catch (e) {
    console.log('### ad networks and acquisition');
    console.log('');
    console.log(`AdMob section failed: ${e && e.message ? e.message : e}`);
    console.log('');
  }
}

module.exports = safeMain;

if (require.main === module) safeMain();
