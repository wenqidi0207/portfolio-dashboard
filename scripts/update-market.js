const fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.resolve(__dirname, '..');
const portfolio = JSON.parse(fs.reaconst fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.resolve(__dirname, '..');
const portfolioText = fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8').replace(/^\uFEFF/, '');
const portfolio = JSON.parse(portfolioText);
const items = (portfolio.holdings || []).concat(portfolio.watchlist || []);

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: headers || {} }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`upstream ${response.statusCode}`));
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
  const json = JSON.parse(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json'
  }));
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result || !result.meta || result.meta.regularMarketPrice == null) throw new Error(`empty quote for ${symbol}`);
  const price = Number(result.meta.regularMarketPrice);
  const previous = Number(result.meta.previousClose || price);
  return { price, change: price - previous, changePct: previous ? ((price - previous) / previous) * 100 : 0, source: 'Yahoo Finance' };
}

async function sinaQuotes(cnItems) {
  const codes = cnItems.map(item => `${item.code.startsWith('6') ? 'sh' : 'sz'}${item.code}`).join(',');
  const body = await get(`https://hq.sinajs.cn/list=${codes}`, {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://finance.sina.com.cn/'
  });
  const quotes = {};
  for (const line of body.split('\n')) {
    const match = line.match(/hq_str_(\w+)="([^"]*)"/);
    if (!match) continue;
    const fields = match[2].split(',');
    const price = Number(fields[3]);
    const previous = Number(fields[2]);
    if (!price || !previous) continue;
    quotes[match[1].replace(/^sh|^sz/, '')] = { price, change: price - previous, changePct: ((price - previous) / previous) * 100, source: 'A-share quote' };
  }
  return quotes;
}

async function main() {
  const quotes = {};
  const cnItems = items.filter(item => item.market === 'CN');
  if (cnItems.length) {
    try { Object.assign(quotes, await sinaQuotes(cnItems)); } catch (error) { console.warn(`A-share source failed: ${error.message}`); }
  }
  for (const item of items) {
    if (quotes[item.code]) continue;
    try { quotes[item.code] = await yahooQuote(yahooSymbol(item)); } catch (error) { console.warn(`${item.code}: ${error.message}`); }
  }
  const fx = {};
  for (const pair of portfolio.fx_pairs || []) {
    const key = `${pair.from}${pair.to}`;
    try {
      const fxJson = JSON.parse(await get(`https://api.frankfurter.app/latest?from=${encodeURIComponent(pair.from)}&to=${encodeURIComponent(pair.to)}`, { 'User-Agent': 'PortfolioDashboard/1.0' }));
      const rate = fxJson.rates && Number(fxJson.rates[pair.to]);
      if (rate) fx[key] = { rate, changePct: 0, source: 'ECB reference rates' };
    } catch (error) { console.warn(`${key}: ${error.message}`); }
  }
  const output = { updatedAt: new Date().toISOString(), quotes, fx };
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'market.json'), `${JSON.stringify(output, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
dFileSync(path.join(root, 'portfolio.json'), 'utf8'));
const items = (portfolio.holdings || []).concat(portfolio.watchlist || []);

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: headers || {} }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`upstream ${response.statusCode}`));
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
  const json = JSON.parse(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`, {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json'
  }));
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result || !result.meta || result.meta.regularMarketPrice == null) throw new Error(`empty quote for ${symbol}`);
  const price = Number(result.meta.regularMarketPrice);
  const previous = Number(result.meta.previousClose || price);
  return { price, change: price - previous, changePct: previous ? ((price - previous) / previous) * 100 : 0, source: 'Yahoo Finance' };
}

async function sinaQuotes(cnItems) {
  const codes = cnItems.map(item => `${item.code.startsWith('6') ? 'sh' : 'sz'}${item.code}`).join(',');
  const body = await get(`https://hq.sinajs.cn/list=${codes}`, {
    'User-Agent': 'Mozilla/5.0',
    Referer: 'https://finance.sina.com.cn/'
  });
  const quotes = {};
  for (const line of body.split('\n')) {
    const match = line.match(/hq_str_(\w+)="([^"]*)"/);
    if (!match) continue;
    const fields = match[2].split(',');
    const price = Number(fields[3]);
    const previous = Number(fields[2]);
    if (!price || !previous) continue;
    quotes[match[1].replace(/^sh|^sz/, '')] = { price, change: price - previous, changePct: ((price - previous) / previous) * 100, source: 'A-share quote' };
  }
  return quotes;
}

async function main() {
  const quotes = {};
  const cnItems = items.filter(item => item.market === 'CN');
  if (cnItems.length) {
    try { Object.assign(quotes, await sinaQuotes(cnItems)); } catch (error) { console.warn(`A-share source failed: ${error.message}`); }
  }
  for (const item of items) {
    if (quotes[item.code]) continue;
    try { quotes[item.code] = await yahooQuote(yahooSymbol(item)); } catch (error) { console.warn(`${item.code}: ${error.message}`); }
  }
  const fx = {};
  for (const pair of portfolio.fx_pairs || []) {
    const key = `${pair.from}${pair.to}`;
    try {
      const fxJson = JSON.parse(await get(`https://api.frankfurter.app/latest?from=${encodeURIComponent(pair.from)}&to=${encodeURIComponent(pair.to)}`, { 'User-Agent': 'PortfolioDashboard/1.0' }));
      const rate = fxJson.rates && Number(fxJson.rates[pair.to]);
      if (rate) fx[key] = { rate, changePct: 0, source: 'ECB reference rates' };
    } catch (error) { console.warn(`${key}: ${error.message}`); }
  }
  const output = { updatedAt: new Date().toISOString(), quotes, fx };
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'market.json'), `${JSON.stringify(output, null, 2)}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
