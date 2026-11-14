import { USD_CNY } from './currency.js';

const LAB_NAMES = Object.freeze({
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  moonshot: 'Moonshot',
  moonshotai: 'Moonshot',
  zhipu: 'Zhipu',
  zhipuai: 'Zhipu',
  alibaba: 'Alibaba',
  qwen: 'Alibaba',
  minimax: 'MiniMax',
  xai: 'xAI',
  mistral: 'Mistral',
  meta: 'Meta',
  stepfun: 'StepFun',
});

const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase();

export function labFor(model) {
  const prefix = String(model?.id ?? '').split('/')[0];
  return LAB_NAMES[prefix.toLocaleLowerCase()] ?? prefix;
}

export function filterModels(models, query = '', category = 'all', lab = 'all', onlyIds = null) {
  const needle = normalize(query.trim());
  return models.filter((model) => {
    if (onlyIds && !onlyIds.has(String(model?.id ?? ''))) return false;
    if (category !== 'all' && model?.category !== category) return false;
    if (lab !== 'all' && labFor(model) !== lab) return false;
    if (!needle) return true;
    const searchable = [model?.name, model?.id, model?.description, model?.family, labFor(model)]
      .map(normalize)
      .join('\n');
    return searchable.includes(needle);
  });
}

export function sortModels(models, key = 'latest', taskScores = null) {
  return [...models].sort((a, b) => {
    if (key === 'context') {
      const contextA = Number(a?.limit?.context) || 0;
      const contextB = Number(b?.limit?.context) || 0;
      if (contextA !== contextB) return contextB - contextA;
    } else if (key === 'name') {
      const nameOrder = String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'zh-CN', { sensitivity: 'base' });
      if (nameOrder !== 0) return nameOrder;
    } else if (key === 'task') {
      const scoreA = taskScores?.get?.(String(a?.id ?? ''));
      const scoreB = taskScores?.get?.(String(b?.id ?? ''));
      const hasA = Number.isFinite(scoreA);
      const hasB = Number.isFinite(scoreB);
      if (hasA !== hasB) return hasA ? -1 : 1;
      if (hasA && scoreA !== scoreB) return scoreB - scoreA;
    } else {
      const dateA = String(a?.release_date ?? '');
      const dateB = String(b?.release_date ?? '');
      if (dateA !== dateB) {
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB.localeCompare(dateA);
      }
    }
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'en', { sensitivity: 'base' });
  });
}

function trimRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const digits = number >= 100 ? 0 : number >= 10 ? 2 : 3;
  return number.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

// 人民币是汇率换算出来的估算，固定两位小数，不假装比美元原价更精确。
function cnyRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return (number * USD_CNY.rate).toFixed(2);
}

export function formatPrice(price, currency = 'usd') {
  const input = trimRate(price?.input);
  const output = trimRate(price?.output);
  if (input == null || output == null) return '未标价';
  if (Number(price.input) <= 0 && Number(price.output) <= 0) return '未标价';
  if (currency === 'cny') return `¥${cnyRate(price.input)} / ¥${cnyRate(price.output)}`;
  return `$${input} / $${output}`;
}

export function formatContext(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '—';
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${Math.round(number / 1_000)}K`;
  return String(number);
}

export function labs(models) {
  return [...new Set(models.map(labFor).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN', { sensitivity: 'base' }));
}

export function taskIds(rankings, taskKey) {
  const models = rankings?.tasks?.[taskKey]?.models;
  if (!Array.isArray(models)) return [];
  return models.map((model) => String(model?.id ?? '')).filter(Boolean);
}

export function taskScoreMap(rankings, taskKey = null) {
  const map = new Map();
  const entries = taskKey
    ? [[taskKey, rankings?.tasks?.[taskKey]]]
    : rankings?.tasks?.intelligence
      ? [['intelligence', rankings.tasks.intelligence]]
      : Object.entries(rankings?.tasks ?? {});
  for (const [, task] of entries) {
    for (const model of task?.models ?? []) {
      const score = Number(model?.score);
      if (!Number.isFinite(score)) continue;
      const previous = map.get(model.id);
      if (previous == null || score > previous) map.set(model.id, score);
    }
  }
  return map;
}

export function panelRows(models, limit = 5) {
  const list = Array.isArray(models) ? models : [];
  return {
    rows: list.slice(0, limit),
    total: list.length,
    showAll: list.length > limit,
  };
}

export function recommendationSentence(reasons, pricePhrase = '') {
  const phrase = (Array.isArray(reasons) ? reasons : []).map((item) => String(item).trim()).filter(Boolean).join(' · ');
  const parts = [];
  if (phrase) parts.push(phrase);
  if (pricePhrase) parts.push(pricePhrase);
  return parts.length ? `${parts.join('；')}。` : '';
}

export function inputOutputPhrase(price, currency = 'usd') {
  const formatted = formatPrice(price, currency);
  if (formatted === '未标价') return '';
  const [input, output] = formatted.split(' / ');
  if (!input || !output) return '';
  return `输入 ${input} / 输出 ${output}`;
}

export function formatSignal(sourceId, value, mode = 'detail') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const text = Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
  if (sourceId === 'swe-bench') return mode === 'panel' ? `SWE ${text}%` : `${text}%`;
  if (sourceId === 'aider') return mode === 'panel' ? `Aider ${text}%` : `${text}%（正确率）`;
  if (sourceId === 'lmarena' || sourceId === 'design-arena-website') return mode === 'panel' ? `Elo ${text}` : text;
  if (sourceId === 'aa-coding' || sourceId === 'aa-intelligence') return mode === 'panel' ? `AA ${text}` : text;
  return text;
}

export function sourceNote(sourceIds, sources) {
  const names = (sourceIds ?? []).map((id) => sources?.[id]?.short || sources?.[id]?.name).filter(Boolean);
  if (names.length > 1) return `${names[0]} 等`;
  return names[0] ?? '';
}

export function evidenceLabel(sourceId, task, sources) {
  const name = sources?.[sourceId]?.name || sourceId;
  if (sourceId === 'lmarena') return `${name} ${task?.label ?? ''} Elo`.replace(/\s+/g, ' ').trim();
  return name;
}

export function headlineText(model, task) {
  const preferred = [task?.headline, ...(task?.sources ?? [])].filter(Boolean);
  const sourceId = preferred.find((id) => Number.isFinite(Number(model?.evidence?.[id])));
  if (!sourceId) return '';
  return formatSignal(sourceId, model.evidence[sourceId], 'panel');
}

export function budgetTask(intelligence, prices, budget, currency = 'cny') {
  const rate = currency === 'cny' ? USD_CNY.rate : 1;
  const models = (intelligence?.models ?? []).flatMap((row) => {
    const price = prices[row.id];
    if (!Number.isFinite(price?.input) || !Number.isFinite(price?.output) || price.input <= 0 || price.output <= 0) return [];
    const cost = (price.input * 3 + price.output) / 4 * rate;
    if (cost > budget || !Number.isFinite(row.score)) return [];
    return [{ ...row, cost }];
  }).sort((a, b) => b.score - a.score || a.cost - b.cost || a.id.localeCompare(b.id, 'en'));
  for (let i = 0; i < models.length; i++) models[i].rank = i && models[i].score === models[i - 1].score ? models[i - 1].rank : i + 1;
  const unit = currency === 'cny' ? '¥' : '$';
  return {
    label: '性价比 · 预算内最强', headline: 'aa-intelligence', sources: ['aa-intelligence'], scoreKind: 'budget', models,
    description: `每百万总 token 估算成本 ≤ ${unit}${budget}，输入:输出 = 3:1；仅纳入同时有 AA 成绩和非零输入、输出标价的模型。价格为目录快照，未计缓存折扣与额外推理用量`,
  };
}

export function taskBasis(task, sources, asOf) {
  const names = (task?.sources ?? []).map((id) => sources?.[id]?.name).filter(Boolean);
  const basis = names.length ? `依据 ${names.join('/')}` : '';
  return [`按「${task?.label ?? ''}」推荐`, basis, asOf ? `${['raw', 'elo', 'budget'].includes(task?.scoreKind) ? '抓取于' : '数据截至'} ${asOf}` : ''].filter(Boolean).join(' · ');
}

export function evidenceFootnote(asOf, task = null) {
  if (task?.scoreKind === 'elo') return `Design Arena 网页生成偏好 Elo，经 OpenRouter 转发；不代表全部编程能力 · 抓取于 ${asOf}`;
  if (task?.scoreKind === 'budget') return `${task.description}；按 AA 原始分排序，不计算能力分除以价格 · AA 抓取于 ${asOf}`;
  if (task?.scoreKind === 'raw') return `AA 综合智能指数原始分；同型号取已收录配置的最高分 · 抓取于 ${asOf}`;
  return `推荐分为榜内相对分，非绝对能力 · 截至 ${asOf}`;
}
