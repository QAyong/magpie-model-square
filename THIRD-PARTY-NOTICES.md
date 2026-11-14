# 第三方数据与服务声明

本插件打包了第三方数据，并调用公开汇率数据。代码本身按 MIT 许可发布（见 `LICENSE`）。

## models.dev

- 用途：`page/catalog.js` 的模型事实、`page/prices.js` 的厂商标价。
- 来源：<https://models.dev/models.json> 与 <https://models.dev/api.json>，经 `scripts/sync.mjs` 整理成页面用的快照。
- 许可：MIT。

```
MIT License

Copyright (c) 2025 models.dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 人民币汇率中间价

- 用途：`page/currency.js` 的 `rate` 与 `asOf`，仅用于把美元标价换算成人民币的展示。
- 来源：中国外汇交易中心受权公布、中国货币网发布的人民币汇率中间价（<https://www.chinamoney.com.cn/chinese/bkccpr/>），由 `scripts/sync.mjs` 读取。
- 汇率是当日中间价，不是任何厂商的结算价；换算结果只是估算。

## Artificial Analysis 综合智能指数

- 用途：`page/rankings.js` 综合能力榜的原始成绩与排序。数据归属 Artificial Analysis：<https://artificialanalysis.ai/>。
- 官方来源：<https://artificialanalysis.ai/api/v2/language/models/free>，需要同步环境配置 `AA_API_KEY`；文档 <https://artificialanalysis.ai/data-api/docs>。使用须遵守其 Terms of Use 与 Data Platform Terms，AA 数据不随插件代码改为 MIT 许可。
- 无 Key 时读取 OpenRouter 公开转发：<https://openrouter.ai/api/v1/models>，页面注明转发渠道。转发源未提供指数版本和评测日期，不能据抓取日期声称成绩是当天评测。
- 原始分数不重新归一化；同型号取已收录配置最高成绩，只保存能明确匹配目录的条目。旧 Coding Index 已停止发布，不再作为当前主榜。

## Design Arena 网页榜

- 用途：前端 / 网页榜的原始 Elo。来源：<https://www.designarena.ai/leaderboard/code>，经 <https://openrouter.ai/api/v1/models> 转发的 `benchmarks.design_arena` 获取，只取 `arena=models`、`category=website`（Website / HTML / Non-Agentic）。
- 数据属于原评测来源，不随本插件代码改为 MIT 许可；页面只打包明确匹配目录的成绩。抓取日期不等于评测日期，转发源未给出评测时间时记为空。
- 性价比榜是本插件依据 AA 原始分与本地价格快照进行的预算筛选，不是 AA 或 Design Arena 发布的官方性价比排名。

## Arena 代码榜

- 历史来源：旧版编程榜曾使用 Arena Elo；当前同步脚本不再读取。
- 来源：<https://arena.ai/leaderboard/code>。同步脚本读取公开快照仓库 <https://github.com/oolong-tea-2026/arena-ai-leaderboards> 里最新一份 `code.json`（该仓库按 MIT 许可发布，只转存 Arena 公开榜单）。
- 这份快照是榜单摘录，不是 Arena 全量模型。SWE-bench 与 Aider 的官方榜如果更旧，就不拿来决定名次。

## SWE-bench

- 历史来源：旧版编程榜曾使用 SWE-bench Verified 解决率；当前同步脚本不再读取。
- 来源：<https://www.swebench.com/> 页面公布的榜单 JSON，经 `scripts/sync-rankings.mjs` 只保留 Verified 榜上 mini-SWE-agent（Bash Only）的 `% Resolved`。
- 这是对方公布的评测结果，不是本插件复现的跑分。推荐分只在同一次快照的上榜模型之间比较。

## Aider

- 历史来源：旧版编程榜曾使用 Aider polyglot 第二次通过率（`pass_rate_2`）；当前同步脚本不再读取。
- 来源：<https://aider.chat/docs/leaderboards/>，数据文件为 Aider 仓库中的 `aider/website/_data/polyglot_leaderboard.yml`。
- 同样只保存对得上目录模型的分数，不打包整份榜单原文。
