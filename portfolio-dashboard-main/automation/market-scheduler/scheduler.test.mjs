import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMarketSession } from '../../scripts/market-session.mjs';
import { dispatchMarketUpdate } from './worker.mjs';

test('summer/winter open, premarket, close, and weekend boundaries', () => {
  const cases = [
    ['2026-07-07T13:29:00Z', false],
    ['2026-07-07T13:32:00Z', true],
    ['2026-07-07T20:02:00Z', true],
    ['2026-07-07T20:06:00Z', false],
    ['2026-11-11T13:32:00Z', false],
    ['2026-11-11T14:29:00Z', false],
    ['2026-11-11T14:32:00Z', true],
    ['2026-11-11T21:02:00Z', true],
    ['2026-11-11T21:06:00Z', false],
    ['2026-11-14T15:32:00Z', false]
  ];
  for (const [iso, expected] of cases) {
    assert.equal(getMarketSession(new Date(iso)).open, expected, iso);
  }
});

test('configured UTC cron covers 13 half-hour updates plus closing snapshot in either season', () => {
  const config = JSON.parse(readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.triggers.crons, ['2,32 13-21 * * 1-5']);
  for (const date of ['2026-07-07', '2026-11-11']) {
    const accepted = [];
    for (let hour = 13; hour <= 21; hour += 1) {
      for (const minute of [2, 32]) {
        const time = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
        const session = getMarketSession(new Date(time));
        if (session.open) accepted.push(session.newYorkTime);
      }
    }
    assert.equal(accepted.length, 14, date);
    assert.match(accepted[0], /09:32$/);
    assert.match(accepted.at(-1), /16:02$/);
  }
});

test('scheduler dispatches only the configured repository, branch, and scheduled input', async () => {
  let calls = 0;
  const result = await dispatchMarketUpdate(
    { scheduledTime: Date.parse('2026-11-11T15:02:00Z') },
    { GITHUB_ACTIONS_TOKEN: 'test-secret' },
    async (url, options) => {
      calls += 1;
      assert.equal(url, 'https://api.github.com/repos/wenqidi0207/portfolio-dashboard/actions/workflows/market-data.yml/dispatches');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, 'Bearer test-secret');
      assert.deepEqual(JSON.parse(options.body), { ref: 'main', inputs: { update_source: 'external_schedule' } });
      return new Response(null, { status: 204 });
    }
  );
  assert.equal(calls, 1);
  assert.equal(result.dispatched, true);
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('closed session skips without requiring a secret or calling GitHub', async () => {
  const result = await dispatchMarketUpdate(
    { scheduledTime: Date.parse('2026-11-14T15:32:00Z') }, {},
    () => { throw new Error('unexpected request'); }
  );
  assert.equal(result.dispatched, false);
});

test('missing token, auth/rate-limit/server failures, and network failures are surfaced', async () => {
  const event = { scheduledTime: Date.parse('2026-11-11T15:02:00Z') };
  await assert.rejects(dispatchMarketUpdate(event, {}), /secret is not configured/);
  for (const status of [401, 403, 404, 422, 429, 500]) {
    await assert.rejects(
      dispatchMarketUpdate(event, { GITHUB_ACTIONS_TOKEN: 'test-secret' }, async () => new Response(null, { status })),
      new RegExp(`HTTP ${status}`)
    );
  }
  await assert.rejects(
    dispatchMarketUpdate(event, { GITHUB_ACTIONS_TOKEN: 'test-secret' }, async () => { throw new Error('timeout'); }),
    /timeout/
  );
});

// Exercise the exact JavaScript embedded in the workflow with a fixed clock
// and in-memory files: test the GITHUB_OUTPUT value, not just date conversion.
function workflowGate({ iso, event = 'schedule', source = '', snapshot = null }) {
  const yaml = readFileSync(new URL('../../.github/workflows/market-data.yml', import.meta.url), 'utf8');
  const match = yaml.match(/node --input-type=module <<'NODE'\r?\n([\s\S]*?)\r?\n          NODE/);
  assert.ok(match, 'workflow session check must be present');
  const script = match[1].replace(/^          /gm, '').replace(/^import .*;\r?\n/gm, '');
  const writes = {};
  const fakeFs = {
    readFileSync(path) {
      if (path === 'portfolio.json') return JSON.stringify({ holdings: [{ code: 'VTI' }, { code: 'KO' }] });
      if (!snapshot) throw new Error('missing snapshot');
      return JSON.stringify(snapshot);
    },
    appendFileSync(path, value) { writes[path] = (writes[path] || '') + value; }
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [iso])); } }
  new Function('fs', 'getMarketSession', 'process', 'Date', 'console', script)(
    fakeFs, getMarketSession,
    { env: { UPDATE_EVENT: event, UPDATE_SOURCE: source, GITHUB_OUTPUT: 'output', GITHUB_STEP_SUMMARY: 'summary' } },
    Clock, { log() {} }
  );
  return writes;
}

test('workflow writes real output newline, runs external dispatch, and explains closed-session skip', () => {
  const automatic = workflowGate({ iso: '2026-11-11T15:02:00Z', event: 'workflow_dispatch', source: 'external_schedule' });
  assert.equal(automatic.output, 'update=true\n');
  assert.match(automatic.summary, /UPDATE/);
  const closed = workflowGate({ iso: '2026-11-11T23:02:00Z' });
  assert.equal(closed.output, 'update=false\n');
  assert.match(closed.summary, /SKIP.*outside weekday session/);
  assert.equal(workflowGate({ iso: '2026-11-14T23:02:00Z', event: 'workflow_dispatch', source: 'manual' }).output, 'update=true\n');
});

test('workflow deduplicates only complete recent snapshots; stale or missing quotes still update', () => {
  const iso = '2026-11-11T15:02:00Z';
  const recent = '2026-11-11T14:55:00Z';
  const old = '2026-11-11T14:32:00Z';
  const snapshot = { updatedAt: recent, quotes: {
    VTI: { price: 370, fetchedAt: recent }, KO: { price: 92, fetchedAt: recent }
  } };
  const skipped = workflowGate({ iso, snapshot });
  assert.equal(skipped.output, 'update=false\n');
  assert.match(skipped.summary, /already fetched/);
  assert.equal(workflowGate({ iso, snapshot: { ...snapshot, quotes: { VTI: snapshot.quotes.VTI } } }).output, 'update=true\n');
  assert.equal(workflowGate({ iso, snapshot: { ...snapshot, updatedAt: old } }).output, 'update=true\n');
  assert.equal(workflowGate({ iso, snapshot: { ...snapshot, quotes: { ...snapshot.quotes, KO: { price: 92, fetchedAt: old } } } }).output, 'update=true\n');
  assert.equal(workflowGate({ iso, event: 'workflow_dispatch', source: 'manual', snapshot }).output, 'update=true\n');
  const closing = '2026-11-11T21:02:00Z';
  const beforeClose = '2026-11-11T20:55:00Z';
  const closingSnapshot = { updatedAt: beforeClose, quotes: {
    VTI: { price: 370, fetchedAt: beforeClose }, KO: { price: 92, fetchedAt: beforeClose }
  } };
  assert.equal(workflowGate({ iso: closing, snapshot: closingSnapshot }).output, 'update=true\n');
});
