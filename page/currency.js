// 中国人民银行授权中国外汇交易中心公布的人民币汇率中间价：1 美元兑人民币。
// 由 scripts/sync.mjs 更新；页面运行时不能联网，换汇率可以在没有网络时手改这里。
export const USD_CNY = Object.freeze({
  rate: 6.7152,
  asOf: '2026-11-13',
  source: '中国外汇交易中心人民币汇率中间价',
});
