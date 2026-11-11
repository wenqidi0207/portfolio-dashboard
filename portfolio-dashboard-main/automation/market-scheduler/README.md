# 独立行情定时器

GitHub 自带 `schedule` 可能延迟或丢失运行。此定时器在 Cloudflare Workers
执行，通过 GitHub 官方 API 触发原有 `Update market data` 工作流；行情抓取、
提交和 Pages 部署仍在 GitHub 完成。它尚未部署，单独上传仓库不会启用它。

## 先上传 GitHub 文件

保持目录结构，将下面两个文件一起提交到 `main`：

- `.github/workflows/market-data.yml`
- `scripts/market-session.mjs`

提交会触发一次行情更新。工作流摘要会写明 UPDATE 或 SKIP 及其原因。
GitHub cron 保留为备用；两个定时器同时触发时，20 分钟内已完整抓取的快照不会重复生成。

## 部署 Cloudflare 定时器（只需一次）

需要你自己的 Cloudflare 账户和一个仅限此仓库的 GitHub fine-grained token：

1. 在 GitHub Settings → Developer settings → Personal access tokens →
   Fine-grained tokens 中创建 token。Repository access 仅选择
   `wenqidi0207/portfolio-dashboard`，Repository permissions 只需
   **Actions: Read and write**（Metadata 会自动获得读取权限）。设置合适的有效期，
   到期后需要替换。不要把 token 写入文件、提交仓库或发送到聊天中。
2. 在此目录执行下面的命令，登录你自己的 Cloudflare 账户并发布 Worker：

   ```powershell
   cd E:\portfolio-dashboard-main\automation\market-scheduler
   npx wrangler@4 login
   npx wrangler@4 deploy
   npx wrangler@4 secret put GITHUB_ACTIONS_TOKEN
   ```

   最后一个命令会提示输入 token；该值存为 Cloudflare 加密 secret。
   不要直接把实际 token 拼在命令后面。
3. 在 Cloudflare Workers → `portfolio-market-scheduler` → Settings → Triggers
   确认 Cron 为 `2,32 13-21 * * 1-5`（UTC）。触发器配置传播可能需要几分钟。

## 更新时间与验收

- 夏令时：北京时间约 21:32 开始，之后每半小时，次日 04:02 抓收盘快照。
- 冬令时：北京时间约 22:32 开始，之后每半小时，次日 05:02 抓收盘快照。
- 按纽约时间过滤工作日 09:30–16:05；周末跳过。
  此处未接入交易所假日/提前收盘日历，节假日可能仍抓取一次最新可用报价。
- 调度请求成功时 Cloudflare 日志包含 `dispatched: true`；缺少 secret、授权失败
  或请求超时会报错，不会记录为触发成功。GitHub 中事件显示为手动触发类型，
  来源输入为 `external_schedule`，摘要应显示 UPDATE；随后快照提交与 Pages 部署成功。
- 第一次验收需要在开盘后观察相邻两个半小时触发、对应两次快照提交和网站时间。
  仅观察 workflow 的绿色标记不够，需要检查其摘要和行情生成步骤。
- Cloudflare 解决独立定时触发，GitHub runner 仍可能排队，无法承诺网站精确到秒更新。

本地验证（不访问网络、不触发远程任务）：

```powershell
node --test automation/market-scheduler/scheduler.test.mjs
```
