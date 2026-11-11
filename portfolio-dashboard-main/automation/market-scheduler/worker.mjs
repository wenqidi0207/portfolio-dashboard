import { getMarketSession } from '../../scripts/market-session.mjs';

const DISPATCH_URL = 'https://api.github.com/repos/wenqidi0207/portfolio-dashboard/actions/workflows/market-data.yml/dispatches';

export async function dispatchMarketUpdate(event, env, request = fetch) {
  const session = getMarketSession(new Date(event.scheduledTime));
  if (!session.open) return { dispatched: false, ...session };
  if (!env.GITHUB_ACTIONS_TOKEN) throw new Error('GITHUB_ACTIONS_TOKEN secret is not configured');

  const response = await request(DISPATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'portfolio-market-scheduler',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ ref: 'main', inputs: { update_source: 'external_schedule' } }),
    signal: AbortSignal.timeout(20000)
  });
  if (response.status !== 204) {
    // Do not log response bodies or credentials. Surface failure to Cron logs.
    throw new Error(`GitHub workflow dispatch failed: HTTP ${response.status}`);
  }
  return { dispatched: true, ...session };
}

export default {
  async scheduled(event, env) {
    const result = await dispatchMarketUpdate(event, env);
    console.log(JSON.stringify({ scheduledTime: event.scheduledTime, ...result }));
  }
};
