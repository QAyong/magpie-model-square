# 模型广场

给 Magpie 窗口使用的本地模型浏览页。数据来自随包附带的 `page/catalog.js` 和 `page/prices.js` 快照；页面不联网，也不使用推荐排序。价格是每百万 token 的输入 / 输出，优先用厂商自己的接口价。

## 使用

从插件目录运行：

```sh
magpie plugin add .
```

页面提供名称、ID、描述与厂商搜索，厂商和模型种类筛选，按发布日期、上下文或名称排序，以及模型详情和 ID 复制。种类包括对话、图像、视频、语音、转写、嵌入和重排序。列表初始显示 40 条，可继续加载。

## 数据快照

- 来源：<https://models.dev/models.json>
- 日期：以 `page/catalog.js` 中 `SNAPSHOT.fetched` 为准。
- 目录包含 models.dev 快照中的全部模型种类，并保存页面需要的模型字段与归一后的 `category`。

## 本地检查

```sh
node --test page/view.test.mjs
```
