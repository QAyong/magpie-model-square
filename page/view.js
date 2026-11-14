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
  if (sourceId === 'lmarena') return mode === 'panel' ? `Elo ${text}` : text;
  if (sourceId === 'aa-coding') return mode === 'panel' ? `AA ${text}` : text;
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

export function taskBasis(task, sources, asOf) {
  const names = (task?.sources ?? []).map((id) => sources?.[id]?.name).filter(Boolean);
  const basis = names.length ? `依据 ${names.join('/')}` : '';
  return [`按「${task?.label ?? ''}」推荐`, basis, asOf ? `数据截至 ${asOf}` : ''].filter(Boolean).join(' · ');
}

export function evidenceFootnote(asOf) {
  return `推荐分为榜内相对分，非绝对能力 · 截至 ${asOf}`;
}
