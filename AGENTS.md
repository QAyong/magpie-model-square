# 模型广场

Magpie 沙盒页面插件。概览、数量和进度见 `README.md`。

## Key Files & Routing

- `README.md` — 人类可读的状态和文件索引
- `page/view.js` — 改筛选、排序、价格或上下文字符串时先读
- `page/app.js` — 改卡片、复制按钮、图标、种类标签、布局、主题或下拉时先读
- `page/catalog.js` — 模型事实和 `category`；单行大对象，用脚本查询，不要整文件通读
- `page/prices.js` — 标价；没有条目时页面显示「未标价」
- `page/currency.js` — 人民币汇率中间价；由同步脚本写入，没网时可以手改
- `scripts/sync.mjs` — 拉取 models.dev 模型与价格、中国货币网中间价，重写上面三个数据文件
- `package.json` — 清单：`magpie.page`、`magpie.icon/name/summary`，`permissions` 为空
- `LICENSE`、`THIRD-PARTY-NOTICES.md` — MIT 正文，以及 models.dev 与中间价的来源声明

## Commands

| Command | Description |
| --- | --- |
| `node --test page/view.test.mjs` | 筛选、排序、上下文和价格格式 |
| `node --check page/app.js` | 检查页面脚本语法 |
| `node scripts/sync.mjs` | 刷新模型、价格和汇率（页面仍离线） |
| `node scripts/sync.mjs --rate` | 只刷人民币汇率中间价 |
| `node scripts/sync.mjs --dry-run` | 只打印会变什么，不写文件 |

## Gotchas & Red Lines

- `permissions` 为空，页面运行时不能联网。改模型或价格只能重写 `page/catalog.js` 和 `page/prices.js`，正常路径是跑 `node scripts/sync.mjs`。
- 人民币价是 `page/currency.js` 里的中间价乘出来的估算值，不是厂商报价；改汇率要同时改 `rate` 和 `asOf`，文案里的日期是手写的（同步脚本会写对）。
- `category` 只按 models.dev 的 `type`：`image`、`video`、`speech` 与 `realtime`→`speech`、`transcription`、`embedding`、`reranking`→`rerank`，其余→`chat`。能看图的对话模型仍是 `chat`。
- 「多模态」只加在 `chat` 上，且输入或输出含 `text` 以外的模态。
- 价格是每百万 token 的美元 `input` / `output`。优先厂商自己的非零价；0 或缺失不要写入。不要给图像、视频编按张或按秒的价。
- 厂商别名：`zhipuai`/`zai`，`moonshotai`/`moonshot`，`google`/`google-vertex`，`alibaba`/`alibaba-cn`。
- 厂商和排序用自绘下拉，文案是「厂商」。不要改回原生 `select`，也不要写回「实验室」。
- `openai`、`xai`、`ai21`、`moonshotai` 的图标走 CSS mask，会随文字色变化。`brand-kimi-color.svg` 主体是白色，不能直接铺在白底上。
- 价格规则在 `scripts/sync.mjs` 里：厂商价取厂商组（含别名）里最便宜的一条并标 `official`；厂商没有价时取其他接口出现次数最多的价，并列取更便宜的。models.dev 的条目可能挂在 `canonical_model_id` 上，两种都要查。
- `family` 和 `knowledge` 缺失时旧快照写的是 `null`，不要改成省略字段，否则整行 diff 会全变。
- 布局、主题、币种在正式环境存 `magpie.options`：`get()` 读、`set(单个对象)` 写，每秒最多一次；沙盒里 `localStorage` 抛 `SecurityError`，只能当浏览器预览的兜底。
- 不要往 `<html>` 写 `data-theme`，那是 bridge 的属性；页面用自己的 `data-ms-theme`，`system` 时跟随 `magpie.theme.dark` 或系统配色。
- 沙盒里 `navigator.clipboard` 会以 `NotAllowedError` 拒绝，复制必须保留 `document.execCommand('copy')` 回退。
- 页面是 ES module，沙盒里需要宿主发 CORS 头；真机首次安装先确认卡片能渲染，否则把五个模块打成一个经典脚本。
- `magpie.icon` 只接 https 地址或 data URI，现在是内联的 base64 SVG；换图标要重新生成。
- 未获明确要求时，不要执行 `magpie plugin add`，不要推送或发布。
