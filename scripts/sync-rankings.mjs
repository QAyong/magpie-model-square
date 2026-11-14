#!/usr/bin/env node
// 拉取编程榜，写成页面离线用的 page/rankings.js。
//
//   node scripts/sync-rankings.mjs
//   node scripts/sync-rankings.mjs --dry-run
//
// 编程榜优先用 OpenRouter 公开模型接口里的 Artificial Analysis Coding Index。
// 这个接口不需要密钥，缓存大约两分钟，所以每次同步拿到的是当时的分数。
// Arena 代码榜、SWE-bench、Aider 仍会抓，只在这份实时指数缺失时才用来打分。
// 写作 / 数学 / 中文不在这里编造：如果 data/manual-signals.json 里有对应信号，会一并算进去。
// 对不上目录 id 的名字直接跳过，页面不做猜测。

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickFeatured, scoreTask } from './rankings-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(ROOT, 'page');
const SWE_URL = 'https://www.swebench.com/';
const AIDER_URL = 'https://raw.githubusercontent.com/Aider-AI/aider/main/aider/website/_data/polyglot_leaderboard.yml';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const ARENA_TREE_URL = 'https://api.github.com/repos/oolong-tea-2026/arena-ai-leaderboards/git/trees/main?recursive=1';
const ARENA_RAW = 'https://raw.githubusercontent.com/oolong-tea-2026/arena-ai-leaderboards/main';
const MANUAL_FILE = path.join(ROOT, 'data', 'manual-signals.json');

const SOURCE_META = {
  'aa-coding': { name: 'Artificial Analysis Coding Index', short: 'AA Coding', url: 'https://artificialanalysis.ai/' },
  'swe-bench': { name: 'SWE-bench Verified', short: 'SWE-bench', url: 'https://www.swebench.com/' },
  aider: { name: 'Aider polyglot', short: 'Aider', url: 'https://aider.chat/docs/leaderboards/' },
  lmarena: { name: 'LMArena 编程', short: 'LMArena', url: 'https://arena.ai/leaderboard/code' },
  superclue: { name: 'SuperCLUE', short: 'SuperCLUE', url: 'https://www.superclueai.com/' },
};

const TASKS = [
  {
    key: 'coding',
    label: '编程',
    headline: 'swe-bench',
    weights: { 'swe-bench': 0.4, aider: 0.3, lmarena: 0.3 },
  },
  {
    key: 'writing',
    label: '写作',
    headline: 'lmarena',
    weights: { lmarena: 0.7, superclue: 0.3 },
  },
  {
    key: 'math',
    label: '数学推理',
    headline: 'lmarena',
    weights: { lmarena: 1 },
  },
  {
    key: 'chinese-chat',
    label: '中文对话',
    headline: 'lmarena',
    weights: { lmarena: 0.7, superclue: 0.3 },
  },
];

// 榜单名字和目录 id 对不上时才写在这里。能按目录 id 后缀唯一对上的不用写。
const ALIASES = {
  'claude 4.5 opus': 'anthropic/claude-opus-4-5',
  'claude 4.6 opus': 'anthropic/claude-opus-4-6',
  'claude 4.5 sonnet': 'anthropic/claude-sonnet-4-5',
  'claude 4.5 haiku': 'anthropic/claude-haiku-4-5',
  'claude 4 opus': 'anthropic/claude-opus-4-0',
  'claude 4 sonnet': 'anthropic/claude-sonnet-4-0',
  'claude 3.7 sonnet': 'anthropic/claude-3-7-sonnet-20250219',
  'gemini 3 flash': 'google/gemini-3-flash-preview',
  'gemini 3 pro preview': 'google/gemini-3-pro-preview',
  'gemini 2.5 pro': 'google/gemini-2.5-pro',
  'gemini 2.5 flash': 'google/gemini-2.5-flash',
  'gemini 2.0 flash': 'google/gemini-2.0-flash',
  'gemini-2.5-pro-preview-06-05': 'google/gemini-2.5-pro-preview',
  'gemini 2.5 pro preview 05-06': 'google/gemini-2.5-pro-preview',
  'gemini 2.5 pro preview 03-25': 'google/gemini-2.5-pro-preview',
  'minimax m2.5': 'minimax/MiniMax-M2.5',
  'minimax m2': 'minimax/MiniMax-M2',
  'glm 5': 'zhipuai/glm-5',
  'glm 4.6': 'zhipuai/glm-4.6',
  'glm 4.5': 'zhipuai/glm-4.5',
  'gpt 5.2': 'openai/gpt-5.2',
  'gpt 5.2 codex': 'openai/gpt-5.2-codex',
  'gpt 5.1': 'openai/gpt-5.1',
  'gpt 5.1 codex': 'openai/gpt-5.1-codex',
  'gpt 5': 'openai/gpt-5',
  'gpt 5 mini': 'openai/gpt-5-mini',
  'gpt 5 nano': 'openai/gpt-5-nano',
  'gpt 4.1': 'openai/gpt-4.1',
  'gpt 4.1 mini': 'openai/gpt-4.1-mini',
  'gpt 4.1 nano': 'openai/gpt-4.1-nano',
  'gpt 4o': 'openai/gpt-4o',
  'gpt-4o-mini-2024-07-18': 'openai/gpt-4o-mini',
  'kimi k2.5': 'moonshotai/kimi-k2.5',
  'kimi k2 thinking': 'moonshotai/kimi-k2-thinking',
  'kimi k2 instruct': 'moonshotai/kimi-k2-instruct',
  'kimi k2': 'moonshotai/kimi-k2',
  'deepseek v3.2': 'deepseek/deepseek-v3.2',
  'deepseek v3.2 reasoner': 'deepseek/deepseek-v3.2',
  'deepseek r1': 'deepseek/deepseek-r1',
  'deepseek r1 (0528)': 'deepseek/deepseek-r1-0528',
  'deepseek v3 (0324)': 'deepseek/deepseek-v3-0324',
  'qwen3-coder 480b/a35b instruct': 'alibaba/qwen3-coder-480b-a35b-instruct',
  'qwen2.5-coder 32b instruct': 'alibaba/qwen2.5-coder-32b-instruct',
  'qwen3 235b a22b diff, no think, alibaba api': 'alibaba/qwen3-235b-a22b',
  'qwen3 32b': 'alibaba/qwen3-32b',
  'devstral (2512)': 'mistral/devstral-2512',
  'llama 4 maverick instruct': 'meta/llama-4-maverick-17b-instruct',
  'llama 4 maverick': 'meta/llama-4-maverick-17b-instruct',
  'llama 4 scout instruct': 'meta/llama-4-scout-17b-instruct',
  'o3': 'openai/o3',
  'o3-pro': 'openai/o3-pro',
  'o3-mini': 'openai/o3-mini',
  'o4-mini': 'openai/o4-mini',
  'gpt-oss-120b': 'openai/gpt-oss-120b',
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');

function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function fetchText(url, label) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', ['-fsSL', '--max-time', '90', '-A', 'magpie-model-square-sync', url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    const errors = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', (error) => reject(new Error(`${label} 请求失败：${error.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim();
        reject(new Error(`${label} 请求失败${detail ? `：${detail}` : ''}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function loadCatalogIds() {
  return readFile(path.join(PAGE, 'catalog.js'), 'utf8').then((source) => {
    const line = source.split('\n').find((item) => item.startsWith('export const CATALOG = '));
    if (!line) throw new Error('page/catalog.js 里没有 CATALOG');
    const catalog = JSON.parse(line.slice('export const CATALOG = '.length).replace(/;$/, ''));
    return new Set(catalog.filter((model) => model?.category === 'chat').map((model) => model.id));
  });
}

function stripVariant(name) {
  return String(name)
    .replace(/\((?:[^)]*reasoning[^)]*|high|medium|low|t=\d+|no thinking|no think|default think|\d+k thinking(?: tokens)?|\d+k think)\)/gi, ' ')
    .replace(/\((?:20\d{2}-\d{2}-\d{2}|20\d{6})\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveId(name, ids) {
  const raw = String(name ?? '').trim();
  if (!raw || /^multiple$/i.test(raw)) return null;
  if (ids.has(raw)) return raw;

  const stamp = raw.match(/20\d{6}/);
  if (stamp) {
    const dated = [...ids].filter((id) => id.includes(stamp[0]));
    if (dated.length === 1) return dated[0];
  }

  const candidates = [raw, stripVariant(raw)];
  for (const candidate of candidates) {
    const slug = candidate.toLowerCase();
    const suffixHits = [...ids].filter((id) => id.split('/')[1]?.toLowerCase() === slug);
    if (suffixHits.length === 1) return suffixHits[0];
    const alias = ALIASES[slug];
    if (alias && ids.has(alias)) return alias;
  }
  return null;
}

function keepBest(bucket, id, value, date) {
  const score = Number(value);
  if (!id || !Number.isFinite(score)) return;
  const previous = bucket.get(id);
  if (!previous || score > previous.score) bucket.set(id, { score, date: date || '' });
}

function parseSweBench(html) {
  const match = html.match(/<script type="application\/json" id="leaderboard-data">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('SWE-bench 页面里没有 leaderboard-data');
  const boards = JSON.parse(match[1]);
  const verified = boards.find((board) => board?.name === 'Verified');
  if (!verified) throw new Error('SWE-bench 页面里没有 Verified 榜');
  const rows = [];
  for (const row of verified.results ?? []) {
    if (!/mini-swe-agent/i.test(String(row?.agent ?? ''))) continue;
    const model = row.name || row.model || row.model_display;
    if (!model || /^multiple$/i.test(String(row.model_display ?? '')) || /^multiple$/i.test(String(model))) continue;
    const score = Number.parseFloat(row.resolved);
    if (!Number.isFinite(score)) continue;
    rows.push({ model: String(model), score, date: String(row.date ?? '') });
  }
  return rows;
}

function parseAider(yaml) {
  const rows = [];
  for (const block of yaml.split(/\n(?=- )/)) {
    const field = (name) => {
      const match = block.match(new RegExp(`^\\s*${name}:\\s*(.*)$`, 'm'));
      return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
    };
    const model = field('model');
    const rate = Number(field('pass_rate_2'));
    const tests = Number(field('test_cases'));
    if (!model || !Number.isFinite(rate)) continue;
    if (Number.isFinite(tests) && tests > 0 && tests < 200) continue;
    if (model.includes('+')) continue;
    rows.push({ model, score: rate, date: field('date') });
  }
  return rows;
}

function indexRows(rows, ids, label) {
  const bucket = new Map();
  const skipped = [];
  for (const row of rows) {
    const id = resolveId(row.model, ids);
    if (!id) {
      skipped.push(row.model);
      continue;
    }
    keepBest(bucket, id, row.score, row.date);
  }
  const uniqueSkipped = [...new Set(skipped)].sort((a, b) => a.localeCompare(b, 'en'));
  console.log(`${label}：${rows.length} 条，对上 ${bucket.size} 个目录模型，跳过 ${uniqueSkipped.length} 个名字。`);
  if (uniqueSkipped.length) console.log(`  跳过：${uniqueSkipped.join('、')}`);
  return bucket;
}

function latestDate(buckets) {
  const dates = [];
  for (const bucket of buckets) {
    for (const row of bucket.values()) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(row.date)) dates.push(row.date);
    }
  }
  dates.sort();
  return dates.at(-1) ?? '';
}

async function loadManual(ids) {
  let text;
  try {
    text = await readFile(MANUAL_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { signals: {}, dates: {} };
    throw error;
  }
  const parsed = JSON.parse(text);
  const signals = {};
  const dates = {};
  for (const [source, tasks] of Object.entries(parsed.signals ?? parsed)) {
    if (!SOURCE_META[source] || !tasks || typeof tasks !== 'object') continue;
    signals[source] = {};
    for (const [taskKey, models] of Object.entries(tasks)) {
      if (!models || typeof models !== 'object') continue;
      const bucket = new Map();
      for (const [id, value] of Object.entries(models)) {
        if (!ids.has(id)) continue;
        keepBest(bucket, id, value, parsed.asOf || '');
      }
      if (bucket.size) signals[source][taskKey] = bucket;
    }
    if (parsed.asOf) dates[source] = String(parsed.asOf);
  }
  console.log(`手动信号：${Object.keys(signals).join('、') || '无'}`);
  return { signals, dates };
}

function bucketObject(bucket) {
  return Object.fromEntries([...bucket.entries()].map(([id, row]) => [id, row.score]));
}

const OPENROUTER_VENDORS = {
  mistralai: 'mistral',
  'meta-llama': 'meta',
  qwen: 'alibaba',
  'x-ai': 'xai',
  'z-ai': 'zhipuai',
  zai: 'zhipuai',
  moonshot: 'moonshotai',
};

function catalogIndex(ids) {
  const index = new Map();
  for (const id of ids) {
    const key = id.toLowerCase();
    const hits = index.get(key) ?? [];
    hits.push(id);
    index.set(key, hits);
  }
  return index;
}

function openRouterCandidates(modelId) {
  const base = String(modelId ?? '').split(':')[0].toLowerCase();
  const [vendor, name] = base.split('/');
  if (!vendor || !name) return [];
  const vendors = [vendor, OPENROUTER_VENDORS[vendor]].filter(Boolean);
  const names = [name, name.replace(/(\d)\.(\d)/g, '$1-$2')];
  return [...new Set(vendors.flatMap((item) => names.map((model) => `${item}/${model}`)))];
}

function resolveOpenRouterId(modelId, index) {
  for (const candidate of openRouterCandidates(modelId)) {
    const hits = index.get(candidate.toLowerCase()) ?? [];
    if (hits.length === 1) return hits[0];
  }
  return null;
}

async function loadCodingIndex(ids) {
  try {
    const payload = JSON.parse(await fetchText(OPENROUTER_MODELS_URL, 'OpenRouter'));
    const models = Array.isArray(payload?.data) ? payload.data : [];
    const index = catalogIndex(ids);
    const bucket = new Map();
    const skipped = [];
    let scored = 0;
    for (const model of models) {
      const score = Number(model?.benchmarks?.artificial_analysis?.coding_index);
      if (!Number.isFinite(score)) continue;
      scored += 1;
      const id = resolveOpenRouterId(model.id, index);
      if (!id) {
        skipped.push(String(model.id).split(':')[0]);
        continue;
      }
      keepBest(bucket, id, score, today());
    }
    const uniqueSkipped = [...new Set(skipped)].sort((a, b) => a.localeCompare(b, 'en'));
    console.log(`AA Coding Index：${scored} 条有分数，对上 ${bucket.size} 个目录模型，跳过 ${uniqueSkipped.length} 个名字。`);
    if (uniqueSkipped.length) console.log(`  跳过：${uniqueSkipped.join('、')}`);
    return { bucket, date: bucket.size ? today() : '' };
  } catch (error) {
    console.warn(`AA Coding Index 跳过：${error.message}`);
    return { bucket: new Map(), date: '' };
  }
}

function arenaSlugs(name) {
  const raw = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  const bases = [raw, raw.replace(/-(?:max|xhigh|high|medium|low)$/i, '')];
  const slugs = [];
  for (const base of bases) {
    if (!base) continue;
    slugs.push(base);
    slugs.push(base.replace(/(\d)\.(\d)/g, '$1-$2'));
  }
  return [...new Set(slugs)];
}

function resolveArenaId(name, ids) {
  for (const slug of arenaSlugs(name)) {
    const hits = [...ids].filter((id) => id.split('/')[1]?.toLowerCase() === slug);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

async function loadArenaCode(ids) {
  try {
    const tree = JSON.parse(await fetchText(ARENA_TREE_URL, 'Arena'));
    const file = (tree.tree ?? [])
      .map((item) => item.path)
      .filter((item) => /^data\/\d{4}-\d{2}-\d{2}\/code\.json$/.test(item))
      .sort()
      .at(-1);
    if (!file) throw new Error('仓库里没有 code.json');
    const board = JSON.parse(await fetchText(`${ARENA_RAW}/${file}`, 'Arena'));
    const date = String(board.meta?.fetched_at ?? file).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
    const bucket = new Map();
    const skipped = [];
    for (const model of board.models ?? []) {
      const id = resolveArenaId(model.model, ids);
      if (!id) {
        skipped.push(String(model.model));
        continue;
      }
      keepBest(bucket, id, model.score, date);
    }
    const uniqueSkipped = [...new Set(skipped)].sort((a, b) => a.localeCompare(b, 'en'));
    console.log(`Arena 代码榜 ${date || file}：${board.models?.length ?? 0} 条，对上 ${bucket.size} 个目录模型，跳过 ${uniqueSkipped.length} 个名字。`);
    if (uniqueSkipped.length) console.log(`  跳过：${uniqueSkipped.join('、')}`);
    return { bucket, date };
  } catch (error) {
    console.warn(`Arena 跳过：${error.message}`);
    return { bucket: new Map(), date: '' };
  }
}

function buildRankings(ids, swe, aider, arena, codingIndex, manual) {
  const codingSwe = indexRows(swe, ids, 'SWE-bench');
  const codingAider = indexRows(aider, ids, 'Aider');
  const bySource = {
    'aa-coding': codingIndex.bucket.size ? { coding: codingIndex.bucket } : {},
    'swe-bench': { coding: codingSwe },
    aider: { coding: codingAider },
    lmarena: arena.bucket.size ? { coding: arena.bucket } : {},
  };
  for (const [source, tasks] of Object.entries(manual.signals)) {
    bySource[source] = { ...(bySource[source] ?? {}), ...tasks };
  }

  const sourceDates = {
    'aa-coding': codingIndex.date,
    'swe-bench': latestDate([codingSwe]),
    aider: latestDate([codingAider]),
    lmarena: arena.date,
    ...manual.dates,
  };

  const tasks = {};
  for (const spec of TASKS) {
    let weights = spec.weights;
    let preferredHeadline = spec.headline;
    if (spec.key === 'coding' && bySource['aa-coding']?.coding?.size) {
      weights = { 'aa-coding': 1 };
      preferredHeadline = 'aa-coding';
    } else if (spec.key === 'coding' && bySource.lmarena?.coding?.size) {
      const older = [sourceDates['swe-bench'], sourceDates.aider].filter(Boolean).sort().at(-1) ?? '';
      if (sourceDates.lmarena && sourceDates.lmarena > older) {
        weights = { lmarena: 1 };
        preferredHeadline = 'lmarena';
      }
    }
    const rowsBySource = {};
    for (const source of Object.keys(weights)) {
      const bucket = bySource[source]?.[spec.key];
      if (bucket && bucket.size) rowsBySource[source] = bucketObject(bucket);
    }
    const scored = scoreTask(rowsBySource, weights);
    if (!scored.models.length) continue;
    const headline = [preferredHeadline, ...scored.sources].find((source) => scored.sources.includes(source));
    tasks[spec.key] = {
      label: spec.label,
      headline,
      sources: scored.sources,
      models: scored.models,
    };
  }

  const sources = {};
  for (const task of Object.values(tasks)) {
    for (const source of task.sources) {
      sources[source] = { ...SOURCE_META[source], asOf: sourceDates[source] || today() };
    }
  }

  const dates = Object.values(sources).map((source) => source.asOf).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  dates.sort();
  return {
    asOf: dates.at(-1) || today(),
    featured: pickFeatured(tasks),
    sources,
    tasks,
  };
}

function renderRankings(rankings) {
  return [
    '// Generated by scripts/sync-rankings.mjs. Scores are relative to this snapshot.',
    `export const RANKINGS = ${JSON.stringify(rankings)};`,
    '',
  ].join('\n');
}

async function main() {
  const ids = await loadCatalogIds();
  const swePromise = fetchText(SWE_URL, 'SWE-bench').then(parseSweBench).catch((error) => {
    console.warn(`SWE-bench 跳过：${error.message}`);
    return [];
  });
  const aiderPromise = fetchText(AIDER_URL, 'Aider').then(parseAider).catch((error) => {
    console.warn(`Aider 跳过：${error.message}`);
    return [];
  });
  const [swe, aider, arena, codingIndex, manual] = await Promise.all([
    swePromise,
    aiderPromise,
    loadArenaCode(ids),
    loadCodingIndex(ids),
    loadManual(ids),
  ]);
  if (!swe.length && !aider.length && !arena.bucket.size && !codingIndex.bucket.size && !Object.keys(manual.signals).length) {
    throw new Error('没有任何榜单数据，不写 page/rankings.js。');
  }
  const rankings = buildRankings(ids, swe, aider, arena, codingIndex, manual);
  const taskSummary = Object.entries(rankings.tasks).map(([key, task]) => `${key} ${task.models.length}`).join('，') || '无';
  console.log(`快照 ${rankings.asOf}；任务：${taskSummary}；主推：${rankings.featured?.id ?? '无'}`);
  const next = renderRankings(rankings);
  if (dryRun) {
    console.log('未写入（--dry-run）。');
    return;
  }
  await writeFile(path.join(PAGE, 'rankings.js'), next);
  console.log('已更新 page/rankings.js。');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
