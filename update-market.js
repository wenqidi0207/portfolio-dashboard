const fs = require('fs');
const http = require('http');
const https = require('https');

function readPortfolio() {
  const raw = fs.readFileSync('portfolio.json', 'utf8').replace(/^\uFEFF/, '');
  let clean = '';
  let inString = false;
  let escaped = false;
  for (const char of raw) {
    if (escaped) {
      clean += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      clean += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      clean += char;
      inString = !inString;
      continue;
    }
    clean += inString && char.charCodeAt(0) < 32 ? ' ' : char;
  }
  return JSON.parse(clean);
}

const portfolio = readPortfolio();
const items = (portfolio.holdings || []).concat(portfolio.watchlist || []);

function get(url, headers, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const request = (url.startsWith('https') ? https : http).get(url, { headers: headers || {} }, response => {
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location || redirectsLeft <= 0) return reject(new Error(`redirect ${response.statusCode}`));
        return resolve(get(new URL(response.headers.location, url).href, headers, redirectsLeft - 1));
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`HTTP ${response.statusCode}`));
        resolve(body);
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error('timeout')));
    request.on('error', reject);
  });
}

function yahooSymbol(item) {
  if (item.market === 'HK') return `${item.code}.HK`;
  if (item.market === 'CN') return `${item.code}${item.code.startsWith('6') ? '.SS' : '.SZ'}`;
  return item.code;
}

async function yahooQuote(symbol) {
  const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
  const encoded = encodeURIComponent(symbol);
  let body;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      body = await get(`https://${host}/v8/finance/chart/${encoded}?interval=1d&range=5d`, headers);
      break;
    } catch (error) {
      if (host === 'query2.finance.yahoo.com') throw error;
    }
  }
  const result = JSON.parse(body).chart?.result?.[0];
  if (!result?.meta?.regularMarketPrice) throw new Error(`empty quote ${symbol}`);
  const price = Number(result.meta.regularMarketPrice);
  const closes = result.indicators?.quote?.[0]?.close || [];
  const previous = Number(
    result.meta.chartPreviousClose ||
    result.meta.previousClose ||
    result.meta.regularMarketPreviousClose ||
    closes.filter(value => value != null).slice(-2, -1)[0]
  );
  if (!Number.isFinite(price)) throw new Error(`invalid quote ${symbol}`);
  const changeAvailable = Number.isFinite(previous) && previous !== 0;
  return {
    price,
    previousClose: changeAvailable ? previous : null,
    change: changeAvailable ? price - previous : null,
    changePct: changeAvailable ? ((price - previous) / previous) * 100 : null,
    changeAvailable,
    source: 'Yahoo Finance'
  };
}

async function sinaQuotes(cnItems) {
  const codes = cnItems.map(item => `${item.code.startsWith('6') ? 'sh' : 'sz'}${item.code}`).join(',');
  const body = await get(`https://hq.sinajs.cn/list=${codes}`, { 'User-Agent': 'Mozilla/5.0' });
  const quotes = {};
  for (const line of body.split('\n')) {
    const match = line.match(/hq_str_(\w+)="([^"]*)"/);
    if (!match) continue;
    const fields = match[2].split(',');
    const price = Number(fields[3]);
    const previous = Number(fields[2]);
    if (!price || !previous) continue;
    quotes[match[1].replace(/^sh|^sz/, '')] = { price, previousClose: previous, change: price - previous, changePct: ((price - previous) / previous) * 100, changeAvailable: true, source: 'A-share quote' };
  }
  return quotes;
}

async function main() {
  const quotes = {};
  const cnItems = items.filter(item => item.market === 'CN');
  if (cnItems.length) {
    try { Object.assign(quotes, await sinaQuotes(cnItems)); } catch (error) { console.warn(`A-share source: ${error.message}`); }
  }
  const yahooResults = await Promise.all(items.filter(item => !quotes[item.code]).map(async item => {
    try { return [item.code, await yahooQuote(yahooSymbol(item))]; }
    catch (error) { console.warn(`${item.code}: ${error.message}`); return [item.code, null]; }
  }));
  yahooResults.forEach(([code, quote]) => { if (quote) quotes[code] = quote; });
  const fx = {};
  for (const pair of portfolio.fx_pairs || []) {
    const key = `${pair.from}${pair.to}`;
    try {
      const body = await get(`https://api.frankfurter.app/latest?from=${pair.from}&to=${pair.to}`);
      const rate = Number(JSON.parse(body).rates?.[pair.to]);
      if (rate) fx[key] = { rate, changePct: 0, source: 'ECB reference rates' };
    } catch (error) { console.warn(`${key}: ${error.message}`); }
  }
  if (!Object.keys(quotes).length && !Object.keys(fx).length) throw new Error('No market data returned');
  if (!Object.keys(quotes).length && items.length) throw new Error('No stock quotes returned; refusing to overwrite snapshot');
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/market.json', `${JSON.stringify({ updatedAt: new Date().toISOString(), quotes, fx }, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
