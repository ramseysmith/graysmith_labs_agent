#!/usr/bin/env node
'use strict';

// Graysmith Labs App Store watch.
//
// Reads public Apple endpoints. No credentials, no keys, nothing to expire.
// Prints a markdown section to stdout and remembers what it saw so the next run
// can report only what actually changed.
//
// Never fails the nightly. Apple is a third party and a flaky lookup is not a
// reason to lose the rest of the report, so every failure degrades to a note.

const fs = require('fs');
const path = require('path');

const APPS = [
  { name: 'CelebriDay', id: '6760971240' },
  { name: 'BlitzTap', id: '6759490849' },
  { name: 'SignSnap', id: '6759199184' },
  { name: 'Drift', id: '6758258891' },
];

const COUNTRY = 'us';
const KIT_DIR = path.resolve(__dirname, '..');
const STATE_FILE = path.join(KIT_DIR, 'state', 'appstore.json');
const TIMEOUT_MS = 20000;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'graysmith-labs-nightly' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Apple's lookup endpoint takes every id at once.
async function fetchMeta() {
  const ids = APPS.map((a) => a.id).join(',');
  const data = await getJson(
    `https://itunes.apple.com/lookup?id=${ids}&country=${COUNTRY}`
  );
  const byId = {};
  for (const r of data.results || []) byId[String(r.trackId)] = r;
  return byId;
}

// The reviews feed is inconsistent: entry may be absent, a single object, or an
// array. Normalise all three.
async function fetchReviews(id) {
  const data = await getJson(
    `https://itunes.apple.com/${COUNTRY}/rss/customerreviews/id=${id}/sortBy=mostRecent/json`
  );
  const raw = data?.feed?.entry;
  const list = !raw ? [] : Array.isArray(raw) ? raw : [raw];
  return list
    .filter((e) => e && e['im:rating'])
    .map((e) => ({
      id: e.id?.label,
      author: e.author?.name?.label ?? 'unknown',
      title: e.title?.label ?? '',
      body: e.content?.label ?? '',
      rating: Number(e['im:rating']?.label ?? 0),
      version: e['im:version']?.label ?? '?',
    }));
}

function fmtDelta(now, before, digits = 0) {
  if (before === undefined || before === null) return '';
  const d = now - before;
  if (!d) return '';
  return ` (${d > 0 ? '+' : ''}${d.toFixed(digits)})`;
}

async function main() {
  const prev = loadState();
  const first = !prev;
  const state = { updated: new Date().toISOString(), apps: {} };

  let meta = {};
  try {
    meta = await fetchMeta();
  } catch (err) {
    console.log('## app store');
    console.log('');
    console.log(`Lookup failed: ${err.message}. Nothing else here is current.`);
    console.log('');
    return;
  }

  const rows = [];
  const freshReviews = [];
  const notes = [];

  for (const app of APPS) {
    const m = meta[app.id];
    if (!m) {
      rows.push(`| ${app.name} | not found in the ${COUNTRY} store | | | |`);
      continue;
    }

    const before = prev?.apps?.[app.id];
    const rating = Number(m.averageUserRating || 0);
    const count = Number(m.userRatingCount || 0);
    const version = m.version || '?';

    let change = 'no change';
    if (first) {
      change = 'baseline';
    } else if (before) {
      const bits = [];
      if (version !== before.version) bits.push(`shipped ${before.version} to ${version}`);
      if (count !== before.count) bits.push(`ratings ${fmtDelta(count, before.count).trim() || count}`);
      if (Math.abs(rating - before.rating) > 0.005)
        bits.push(`rating ${before.rating.toFixed(2)} to ${rating.toFixed(2)}`);
      if (bits.length) change = bits.join(', ');
    }

    rows.push(
      `| ${app.name} | ${version} | ${rating.toFixed(2)} | ${count} | ${change} |`
    );

    // Reviews are per app and can fail independently of the lookup.
    let reviews = [];
    try {
      reviews = await fetchReviews(app.id);
    } catch (err) {
      notes.push(`${app.name}: review feed unavailable (${err.message})`);
    }

    const seen = new Set(before?.seenReviews || []);
    const unseen = reviews.filter((r) => r.id && !seen.has(r.id));
    if (!first) {
      for (const r of unseen) freshReviews.push({ app: app.name, ...r });
    }

    state.apps[app.id] = {
      name: app.name,
      version,
      rating,
      count,
      // Cap the memory so the file cannot grow without bound.
      seenReviews: reviews.map((r) => r.id).filter(Boolean).slice(0, 200),
    };
  }

  console.log('## app store');
  console.log('');
  console.log('| app | version | rating | ratings | since last run |');
  console.log('| --- | --- | --- | --- | --- |');
  rows.forEach((r) => console.log(r));
  console.log('');

  if (first) {
    console.log('First run, so this is the baseline. Later runs report only what moved.');
    console.log('');
  }

  console.log('### new reviews');
  console.log('');
  if (first) {
    console.log('Baseline run, existing reviews recorded without listing them.');
    console.log('');
  } else if (!freshReviews.length) {
    console.log('None since the last run.');
    console.log('');
  } else {
    // Worst first. A one star review is the thing you want to read today.
    freshReviews.sort((a, b) => a.rating - b.rating);
    for (const r of freshReviews) {
      const stars = '*'.repeat(r.rating) + '.'.repeat(5 - r.rating);
      console.log(`**${r.app}** ${stars} (${r.rating}/5) on v${r.version}, by ${r.author}`);
      console.log('');
      console.log(`> ${r.title}`);
      console.log('>');
      console.log(`> ${r.body.replace(/\n+/g, '\n> ')}`);
      console.log('');
    }
    const bad = freshReviews.filter((r) => r.rating <= 2).length;
    if (bad) console.log(`${bad} of these are two stars or worse. Read them first.`);
    console.log('');
  }

  if (notes.length) {
    console.log('### notes');
    console.log('');
    notes.forEach((n) => console.log(`* ${n}`));
    console.log('');
  }

  saveState(state);
}

main().catch((err) => {
  // Degrade, never take the nightly down with us.
  console.log('## app store');
  console.log('');
  console.log(`Watch failed: ${err && err.message ? err.message : err}`);
  console.log('');
});
