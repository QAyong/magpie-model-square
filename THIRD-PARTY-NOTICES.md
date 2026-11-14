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

## Artificial Analysis 编程指数

- 用途：`page/rankings.js` 编程榜的当前排序。
- 来源：Artificial Analysis 的 Coding Index，经 OpenRouter 公开接口转发：<https://openrouter.ai/api/v1/models>。这个接口不需要密钥，响应缓存大约两分钟。分数说明见 <https://artificialanalysis.ai/>。
- 这是编程能力指数，不是 OpenRouter 用量榜，也不是 Arena 的人类投票 Elo。页面打包的是同步当时的分数。

## Arena 代码榜

- 用途：Artificial Analysis 编程指数拿不到时，`page/rankings.js` 编程榜的备选排序。用的是 Arena 代码榜 Elo，不是绝对能力分。
- 来源：<https://arena.ai/leaderboard/code>。同步脚本读取公开快照仓库 <https://github.com/oolong-tea-2026/arena-ai-leaderboards> 里最新一份 `code.json`（该仓库按 MIT 许可发布，只转存 Arena 公开榜单）。
- 这份快照是榜单摘录，不是 Arena 全量模型。SWE-bench 与 Aider 的官方榜如果更旧，就不拿来决定名次。

## SWE-bench

- 用途：`page/rankings.js` 里编程榜的 SWE-bench Verified 解决率。
- 来源：<https://www.swebench.com/> 页面公布的榜单 JSON，经 `scripts/sync-rankings.mjs` 只保留 Verified 榜上 mini-SWE-agent（Bash Only）的 `% Resolved`。
- 这是对方公布的评测结果，不是本插件复现的跑分。推荐分只在同一次快照的上榜模型之间比较。

## Aider

- 用途：`page/rankings.js` 里编程榜的 Aider polyglot 第二次通过率（`pass_rate_2`）。
- 来源：<https://aider.chat/docs/leaderboards/>，数据文件为 Aider 仓库中的 `aider/website/_data/polyglot_leaderboard.yml`。
- 同样只保存对得上目录模型的分数，不打包整份榜单原文。
