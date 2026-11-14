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
