// Drive the Claude Usage Monitor extension in headless Chromium and check its badge.
// claude.ai is stubbed at the network layer (context.route), so no login is needed and
// the run is deterministic. The extension's own fetch path is what gets exercised.
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }

const here = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(process.argv[2] || join(here, '../../../claude-usage-extension'));
const CHAT_ORG = '11111111-chat-org';
const API_ORG = '22222222-api-only-org';

// One scenario per run of the service worker: each gets a fresh profile.
const scenarios = [
  {
    name: 'badge shows 5-hour % from the chat org',
    // API-only org listed first: the extension must pick the chat-capable one.
    bootstrap: { status: 200, body: { account: { memberships: [
      { organization: { uuid: API_ORG, capabilities: ['api'] } },
      { organization: { uuid: CHAT_ORG, capabilities: ['chat', 'claude_pro'] } },
    ] } } },
    usage: { status: 200, body: {
      five_hour: { utilization: 42.4, resets_at: new Date(Date.now() + 2 * 3600e3).toISOString() },
      // half the week elapsed, 20% used: under pace -> green badge
      seven_day: { utilization: 20, resets_at: new Date(Date.now() + 3.5 * 86400e3).toISOString() },
    } },
    expect: { badge: '42%', titleHas: ['5-hour: 42%', 'Weekly: 20%'], bg: [16, 185, 129, 255] },
  },
  {
    name: 'weekly over pace turns the badge red',
    bootstrap: { status: 200, body: { account: { memberships: [
      { organization: { uuid: CHAT_ORG, capabilities: ['chat'] } } ] } } },
    usage: { status: 200, body: {
      five_hour: { utilization: 7, resets_at: new Date(Date.now() + 3600e3).toISOString() },
      // 1 day of 7 elapsed (~14% expected), 60% used -> danger
      seven_day: { utilization: 60, resets_at: new Date(Date.now() + 6 * 86400e3).toISOString() },
    } },
    expect: { badge: '7%', titleHas: ['5-hour: 7%', 'Weekly: 60%', 'over pace'], bg: [239, 68, 68, 255] },
  },
  {
    name: 'session expiry (401) clears the badge and the cached org',
    bootstrap: { status: 200, body: { account: { memberships: [
      { organization: { uuid: CHAT_ORG, capabilities: ['chat'] } } ] } } },
    usage: { status: 200, body: {
      five_hour: { utilization: 55, resets_at: new Date(Date.now() + 3600e3).toISOString() } } },
    // second poll, after the badge showed 55%: the cookie has expired
    then: { bootstrap: { status: 401, body: {} }, usage: { status: 401, body: {} } },
    expect: { badge: '', titleHas: ['Make sure you are logged in', 'HTTP 401'], orgCleared: true },
  },
];

async function runScenario(s) {
  let cur = s; // the stub the route serves; `then` swaps it between polls
  const profile = mkdtempSync(join(tmpdir(), 'cum-verify-'));
  const hits = { bootstrap: 0, usage: [], other: [] };
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chromium', // full Chromium's new headless mode; the headless shell cannot load extensions
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox',
      // Nothing reaches the real claude.ai: routed requests never resolve DNS, unrouted ones fail fast.
      '--host-resolver-rules=MAP claude.ai ~NOTFOUND'],
  });
  try {
    await ctx.route('https://claude.ai/**', async (route) => {
      const url = new URL(route.request().url());
      const json = (r) => route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
      if (url.pathname === '/api/bootstrap') { hits.bootstrap++; return json(cur.bootstrap); }
      const m = url.pathname.match(/^\/api\/organizations\/([^/]+)\/usage$/);
      if (m) {
        hits.usage.push(m[1]);
        // /usage only answers for the chat org, like the real API (an API-only org 403s)
        if (cur.usage.status === 200 && m[1] !== CHAT_ORG) return json({ status: 403, body: { error: 'forbidden' } });
        return json(cur.usage);
      }
      hits.other.push(url.pathname);
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Claude</title><h1>stub claude.ai</h1>' });
    });

    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });

    // Open claude.ai like a user would (stubbed page; the extension has no content script).
    const page = await ctx.newPage();
    await page.goto('https://claude.ai/');

    // The service worker ran onInstalled before the route existed, so that first poll is
    // not under test (claude.ai resolves nowhere, so if unrouted it fails fast). Wait for it
    // to finish (any outcome sets the title), then run the poll under test against the stub
    // with an empty cache. The next alarm is 5 minutes out, so nothing else races it.
    const read = () => sw.evaluate(async () => ({
      badge: await chrome.action.getBadgeText({}),
      title: await chrome.action.getTitle({}),
      bg: await chrome.action.getBadgeBackgroundColor({}),
      orgId: (await chrome.storage.local.get('orgId')).orgId ?? null,
    }));
    const deadline = Date.now() + 10000;
    while ((await read()).title === 'Claude Usage Monitor') {
      if (Date.now() > deadline) throw new Error('startup poll never set the title');
      await new Promise((r) => setTimeout(r, 25));
    }
    // fetchAndUpdateUsage is top-level in the classic service worker
    await sw.evaluate(async () => { await chrome.storage.local.clear(); await fetchAndUpdateUsage(); });
    let state = await read();
    if (s.then) {
      if (state.badge === '') throw new Error(`first poll left no badge: ${JSON.stringify(state)}`);
      cur = s.then;
      await sw.evaluate(() => fetchAndUpdateUsage());
      state = await read();
    }

    const fails = [];
    if (state.badge !== s.expect.badge) fails.push(`badge ${JSON.stringify(state.badge)} != ${JSON.stringify(s.expect.badge)}`);
    for (const t of s.expect.titleHas) if (!state.title.includes(t)) fails.push(`title lacks ${JSON.stringify(t)}: ${JSON.stringify(state.title)}`);
    if (s.expect.bg && JSON.stringify(state.bg) !== JSON.stringify(s.expect.bg)) fails.push(`badge bg ${JSON.stringify(state.bg)} != ${JSON.stringify(s.expect.bg)}`);
    if (hits.bootstrap === 0) fails.push('extension never called /api/bootstrap (route not hit: stub is not exercising the extension)');
    if (s.expect.orgCleared && state.orgId !== null) fails.push(`cached orgId survived a 401: ${state.orgId}`);
    if (s.usage.status === 200 && !hits.usage.includes(CHAT_ORG)) fails.push(`usage never requested for chat org (asked for ${JSON.stringify(hits.usage)})`);
    return { fails, state };
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

const t0 = Date.now();
let failed = 0;
for (const s of scenarios) {
  const t = Date.now();
  let r;
  try { r = await runScenario(s); } catch (e) { r = { fails: [`threw: ${e.message.split('\n')[0]}`] }; }
  const ok = r.fails.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${s.name} (${Date.now() - t} ms)`);
  for (const f of r.fails) console.log(`     ${f}`);
}
console.log(`${failed ? 'FAILED' : 'OK'}: ${scenarios.length - failed}/${scenarios.length} in ${Date.now() - t0} ms`);
process.exit(failed ? 1 : 0);
