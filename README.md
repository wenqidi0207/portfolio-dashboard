# Portfolio Dashboard

A minimalist stock & forex monitor in the Nothing design style.

## Files

- `index.html` — single-file dashboard (HTML + CSS + JS)
- `portfolio.json` — holdings / watchlist / FX pairs config

## Data Sources

- **US stocks** & **HK stocks** — Yahoo Finance v8 chart API
- **A-shares** — Sina Finance (`hq.sinajs.cn`) with Yahoo fallback
- **FX rates** — Yahoo Finance quote API

## Data note

The MCP `get_a_share_prices_snapshot` tool you provided is a Codex AI tool-call interface, **not** an HTTP endpoint browsers can reach. To get real-time A-share prices, the dashboard calls Sina's public quote endpoint directly (same upstream data as Tonghuashun). If you later want a private API key wired in, the easiest path is a Cloudflare Worker proxy.

## Deploy to GitHub Pages

```bash
cd portfolio-dashboard
git init
git add .
git commit -m "init dashboard"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
# GitHub → Settings → Pages → Source: main, root
```

## Deploy to Cloudflare (later)

1. Push to GitHub
2. Cloudflare Pages → Connect to Git → select repo
3. Build command: *(none)*, Output: `portfolio-dashboard`
4. Custom domain: your CF domain

## Edit config

Update `portfolio.json`:
- `holdings` — `code`, `name`, `market` (US/CN/HK), `quantity`, `cost`
- `watchlist` — `code`, `name`, `market`
- `fx_pairs` — `from` (USD/EUR/HKD...), `to`

Refresh interval: 45s.