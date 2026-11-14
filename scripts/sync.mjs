#!/usr/bin/env node
// 从 models.dev 和中国货币网拉取最新数据，重写 page/ 下的三个数据文件。
//
//   node scripts/sync.mjs            模型 + 价格 + 汇率
//   node scripts/sync.mjs --rate     只刷人民币汇率（几秒）
//   node scripts/sync.mjs --dry-run  只打印变化，不写文件
//
// 页面运行时仍然不联网：这个脚本改的是随包的静态快照。

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(ROOT, 'page');

const MODELS_URL = 'https://models.dev/models.json';
const API_URL = 'https://models.dev/api.json';
const RATE_URL = 'https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json';

// 同一个厂商在 models.dev 里可能有多个接口条目，价格取其中最便宜的一条。
const VENDOR_GROUPS = [
  ['zhipuai', 'zai'],
  ['moonshotai', 'moonshot'],
  ['google', 'google-vertex'],
  ['alibaba', 'alibaba-cn'],
];

// models.dev 的 type 只在部分模型上有；没有类型的都当对话模型。
const CATEGORY_BY_TYPE = {
  image: 'image',
  video: 'video',
  speech: 'speech',
  realtime: 'speech',
  transcription: 'transcription',
  embedding: 'embedding',
  reranking: 'rerank',
};

const CATALOG_FIELDS = [
  'id',
  'name',
  'description',
  'family',
  'attachment',
  'reasoning',
  'tool_call',
  'release_date',
  'last_updated',
  'modalities',
  'open_weights',
  'limit',
];

const args = new Set(process.argv.slice(2));
const onlyRate = args.has('--rate');
const dryRun = args.has('--dry-run');

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());

async function fetchJson(url, label) {
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'magpie-model-square-sync' },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new Error(`${label} 请求失败：${error.message}（${url}）`);
  }
  if (!response.ok) throw new Error(`${label} 返回 ${response.status}（${url}）`);
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON：${error.message}（${url}）`);
  }
}

function buildCatalog(models) {
  return Object.values(models).map((source) => {
    const entry = {};
    for (const field of CATALOG_FIELDS) {
      if (field === 'knowledge') continue;
      if (source[field] !== undefined) entry[field] = source[field];
      else if (field === 'family') entry[field] = null;
    }
    entry.knowledge = source.knowledge ?? null;
    entry.category = CATEGORY_BY_TYPE[source.type] ?? 'chat';
    return entry;
  });
}

function comparePrice(a, b) {
  if (a.input !== b.input) return a.input - b.input;
  return a.output - b.output;
}

// models.dev 里有的条目挂在厂商自己的 id 下，有的用 canonical_model_id 指向别的模型，
// 两种都要能查到，所以先把每个厂商的 id、canonical id 都索引起来。
function indexProviders(api) {
  const providers = [];
  for (const [providerId, provider] of Object.entries(api)) {
    const byId = new Map();
    for (const [key, entry] of Object.entries(provider?.models ?? {})) {
      byId.set(key, entry);
    }
    for (const [key, entry] of Object.entries(provider?.models ?? {})) {
      const canonical = entry?.canonical_model_id;
      if (canonical && !byId.has(canonical)) byId.set(canonical, entry);
    }
    providers.push({ providerId, byId });
  }
  return providers;
}

function priceFor(providers, id) {
  const slash = id.indexOf('/');
  const vendor = slash === -1 ? id : id.slice(0, slash);
  const localId = slash === -1 ? id : id.slice(slash + 1);
  const group = VENDOR_GROUPS.find((members) => members.includes(vendor)) ?? [vendor];

  const own = [];
  const others = [];
  for (const { providerId, byId } of providers) {
    const cost = (byId.get(localId) ?? byId.get(id))?.cost;
    if (!cost) continue;
    const input = Number(cost.input);
    const output = Number(cost.output);
    if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
    if (input <= 0 && output <= 0) continue;
    const candidate = { input, output };
    if (group.includes(providerId)) own.push(candidate);
    else others.push(candidate);
  }

  if (own.length > 0) {
    const cheapest = own.reduce((best, item) => (comparePrice(item, best) < 0 ? item : best));
    return { input: cheapest.input, output: cheapest.output, official: true };
  }
  if (others.length === 0) return null;

  // 厂商没有自己的价时，取其他接口里出现次数最多的价；并列时取更便宜的一条。
  const counts = new Map();
  for (const item of others) {
    const key = `${item.input}|${item.output}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = null;
  for (const [key, count] of counts) {
    const [input, output] = key.split('|').map(Number);
    const candidate = { input, output, count };
    if (!best || count > best.count || (count === best.count && comparePrice(candidate, best) < 0)) {
      best = candidate;
    }
  }
  return { input: best.input, output: best.output, official: false };
}

function buildPrices(catalog, providers) {
  const prices = new Map();
  for (const model of catalog) {
    const price = priceFor(providers, model.id);
    if (price) prices.set(model.id, price);
  }
  return prices;
}

function renderCatalog(catalog, fetched) {
  return [
    '// Generated from the local models.dev catalog snapshot; includes every model type.',
    `export const CATALOG = ${JSON.stringify(catalog)};`,
    `export const SNAPSHOT = Object.freeze({ fetched: '${fetched}', source: '${MODELS_URL}' });`,
    '',
  ].join('\n');
}

function renderPrices(prices, fetched) {
  const ids = [...prices.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  const lines = [
    `// Per-million-token input/output USD from models.dev provider prices on ${fetched}.`,
    '// official true means a nonzero price from the model vendor; false means the most common other interface price.',
    'export const PRICES = {',
  ];
  ids.forEach((id, index) => {
    const separator = index === ids.length - 1 ? '' : ',';
    lines.push(`  ${JSON.stringify(id)}: ${JSON.stringify(prices.get(id))}${separator}`);
  });
  lines.push('};', '');
  return lines.join('\n');
}

function renderCurrency(rate, asOf) {
  return [
    '// 中国人民银行授权中国外汇交易中心公布的人民币汇率中间价：1 美元兑人民币。',
    '// 由 scripts/sync.mjs 更新；页面运行时不能联网，换汇率可以在没有网络时手改这里。',
    'export const USD_CNY = Object.freeze({',
    `  rate: ${rate},`,
    `  asOf: '${asOf}',`,
    "  source: '中国外汇交易中心人民币汇率中间价',",
    '});',
    '',
  ].join('\n');
}

function parseCurrency(payload) {
  const record = (payload?.records ?? []).find((item) => item?.vrtEName === 'USD/CNY');
  const rate = Number(record?.price);
  const asOf = /^(\d{4}-\d{2}-\d{2})/.exec(String(payload?.data?.lastDate ?? ''))?.[1];
  if (!Number.isFinite(rate) || rate < 3 || rate > 15) {
    throw new Error(`中间价异常：${JSON.stringify(record?.price ?? null)}`);
  }
  if (!asOf) throw new Error(`中间价日期异常：${JSON.stringify(payload?.data?.lastDate ?? null)}`);
  return { rate, asOf };
}

function parseCatalog(source) {
  const line = source.split('\n').find((item) => item.startsWith('export const CATALOG = '));
  if (!line) return [];
  try {
    return JSON.parse(line.slice('export const CATALOG = '.length).replace(/;$/, ''));
  } catch {
    return [];
  }
}

async function readExisting(name) {
  try {
    return await readFile(path.join(PAGE, name), 'utf8');
  } catch {
    return '';
  }
}

async function syncReadme(catalog, fetched) {
  const file = path.join(ROOT, 'README.md');
  const original = await readFile(file, 'utf8');
  const next = original
    .replace(/快照日期 \d{4}-\d{2}-\d{2}/, `快照日期 ${fetched}`)
    .replace(/共 \d+ 个模型/, `共 ${catalog.length} 个模型`);
  if (next === original) return false;
  if (!dryRun) await writeFile(file, next);
  return true;
}

function describePriceDiff(previous, next) {
  const body = previous
    .slice(previous.indexOf('{'), previous.lastIndexOf('}') + 1)
    .replace(/,(\s*})/g, '$1'); // 旧文件每行以逗号结尾，最后一行也不例外。
  const before = JSON.parse(body || '{}');
  const after = Object.fromEntries(next);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, price] of Object.entries(after)) {
    if (!before[id]) added.push(id);
    else if (before[id].input !== price.input || before[id].output !== price.output || before[id].official !== price.official) {
      changed.push([id, before[id], price]);
    }
  }
  for (const id of Object.keys(before)) if (!after[id]) removed.push(id);
  return { before: Object.keys(before).length, added, removed, changed };
}

async function main() {
  const currencyFile = path.join(PAGE, 'currency.js');
  const ratePayload = await fetchJson(RATE_URL, '中国货币网中间价');
  const { rate, asOf } = parseCurrency(ratePayload);
  const currencySource = renderCurrency(rate, asOf);
  const previousCurrency = await readExisting('currency.js');
  const previousRate = Number(/rate:\s*([\d.]+)/.exec(previousCurrency)?.[1]);
  const previousAsOf = /asOf:\s*'([^']+)'/.exec(previousCurrency)?.[1];

  const report = [`中间价：${asOf} 1 美元 ≈ ${rate} 元` + (previousRate ? `（原 ${previousAsOf} ${previousRate}）` : '')];

  if (onlyRate) {
    if (!dryRun && currencySource !== previousCurrency) await writeFile(currencyFile, currencySource);
    console.log(report.join('\n'));
    console.log(dryRun ? '未写入（--dry-run）。' : currencySource === previousCurrency ? '汇率没有变化。' : '已更新 page/currency.js。');
    return;
  }

  const [models, api] = await Promise.all([
    fetchJson(MODELS_URL, 'models.dev 模型'),
    fetchJson(API_URL, 'models.dev 价格'),
  ]);

  const catalog = buildCatalog(models);
  const providers = indexProviders(api);
  const prices = buildPrices(catalog, providers);
  // 上游偶尔会返回残缺数据，不能拿它覆盖掉可用的快照。
  if (catalog.length < 300) throw new Error(`模型数量异常：${catalog.length}`);
  if (prices.size < 300) throw new Error(`价格数量异常：${prices.size}`);
  const catalogSource = renderCatalog(catalog, today);
  const pricesSource = renderPrices(prices, today);
  const previousCatalog = await readExisting('catalog.js');

  const previousIds = new Set(parseCatalog(previousCatalog).map((model) => model.id));
  const nextIds = new Set(catalog.map((model) => model.id));
  const addedModels = [...nextIds].filter((id) => !previousIds.has(id));
  const removedModels = [...previousIds].filter((id) => !nextIds.has(id));

  const priceDiff = describePriceDiff(await readExisting('prices.js'), prices);

  report.push(
    `模型：${catalog.length} 个（新增 ${addedModels.length}，移除 ${removedModels.length}）`,
    `价格：${prices.size} 条（新增 ${priceDiff.added.length}，移除 ${priceDiff.removed.length}，变动 ${priceDiff.changed.length}）`,
  );
  const samples = priceDiff.changed.slice(0, 8).map(([id, before, after]) => {
    const format = (price) => `$${price.input}/$${price.output}${price.official ? '' : '（非官方）'}`;
    return `  ${id}: ${format(before)} → ${format(after)}`;
  });
  if (samples.length > 0) report.push('价格变动样例：', ...samples);

  if (dryRun) {
    console.log(report.join('\n'));
    console.log('未写入（--dry-run）。');
    return;
  }

  const writes = [];
  if (catalogSource !== previousCatalog) writes.push(writeFile(path.join(PAGE, 'catalog.js'), catalogSource));
  if (pricesSource !== (await readExisting('prices.js'))) writes.push(writeFile(path.join(PAGE, 'prices.js'), pricesSource));
  if (currencySource !== previousCurrency) writes.push(writeFile(currencyFile, currencySource));
  await Promise.all(writes);
  const readmeChanged = await syncReadme(catalog, today);

  console.log(report.join('\n'));
  console.log(writes.length > 0 ? `已更新 ${writes.length} 个数据文件。` : '数据没有变化。');
  if (readmeChanged) console.log('已同步 README 状态段。');
  console.log('下一步：node --test page/view.test.mjs && node --check page/app.js');
}

main().catch((error) => {
  console.error(`同步失败：${error.message}`);
  process.exitCode = 1;
});
