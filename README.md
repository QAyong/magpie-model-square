# 模型广场

在 Magpie 里浏览 AI 模型的标价、上下文和模态。一个页面插件，完全离线。

## 功能

- **共 614 个模型**，快照日期 2026-11-14，来自 [models.dev](https://models.dev/models.json)。
- **标价**：每百万 token 的输入 / 输出。优先取厂商自己接口的非零价；厂商没有价时取其他接口里出现次数最多的价；都没有就显示「未标价」。
- **人民币**：默认按中国外汇交易中心中间价换算显示，右上角可切回美元原价。换算汇率和日期写在页脚，人民币是估算值，不是厂商报价。
- **筛选与排序**：搜索名称、ID、描述或厂商；按种类和厂商筛选；按最新发布、上下文或名称排序。
- **布局与主题**：卡片 / 列表，浅色 / 深色 / 跟随系统。
- **复制**：悬停卡片右上角复制模型名称，详情里可复制模型 ID。
- **离线**：页面没有网络权限，不联网、不读取账号或对话。数据随版本打包。

## 安装

在 Magpie 的「设置 → 插件 → 发现」里搜索安装，或在终端：

```sh
magpie plugin add <仓库地址或包名>
```

装好后侧边栏出现「模型广场」。

## 数据说明

- 模型事实和厂商价格来自 models.dev（MIT 许可），页脚显示快照日期。
- 人民币价 = 美元价 × 中间价，汇率日期与数值写在页脚；切到美元可以看到 models.dev 的原价。
- 图像、视频模型不编按张或按秒的价格，标价仍是每百万 token 的数值。
- 数据只在发版时更新。价格变动频繁，安装新版本即可拿到新快照。

## 开发

```sh
node scripts/sync.mjs            # 刷新模型、价格和人民币汇率
node scripts/sync.mjs --rate     # 只刷汇率
node scripts/sync.mjs --dry-run  # 只打印变化，不写文件
node --test page/view.test.mjs   # 筛选、排序、价格格式
```

| 路径 | 内容 |
| --- | --- |
| `page/index.html` | 页面结构 |
| `page/app.js` | 卡片、复制按钮、筛选交互、布局和主题 |
| `page/view.js` | 筛选、排序、价格和上下文字符串 |
| `page/catalog.js` | 模型快照和 `category` |
| `page/prices.js` | 每百万 token 标价 |
| `page/currency.js` | 人民币汇率中间价 |
| `page/view.test.mjs` | 筛选与格式测试 |
| `scripts/sync.mjs` | 抓取 models.dev 与中间价，重写上面三个数据文件 |
| `AGENTS.md` | 给后续会话的约定和红线 |

页面在 Magpie 的沙盒里运行：没有网络，`localStorage` 不可用，布局 / 主题 / 币种存在 `magpie.options` 里。

## 许可

MIT，见 [LICENSE](LICENSE)。打包的第三方数据与汇率来源见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
