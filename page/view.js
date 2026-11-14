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

export function filterModels(models, query = '', category = 'all', lab = 'all') {
  const needle = normalize(query.trim());
  return models.filter((model) => {
    if (category !== 'all' && model?.category !== category) return false;
    if (lab !== 'all' && labFor(model) !== lab) return false;
    if (!needle) return true;
    const searchable = [model?.name, model?.id, model?.description, model?.family, labFor(model)]
      .map(normalize)
      .join('\n');
    return searchable.includes(needle);
  });
}

export function sortModels(models, key = 'latest') {
  return [...models].sort((a, b) => {
    if (key === 'context') {
      const contextA = Number(a?.limit?.context) || 0;
      const contextB = Number(b?.limit?.context) || 0;
      if (contextA !== contextB) return contextB - contextA;
    } else if (key === 'name') {
      const nameOrder = String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'zh-CN', { sensitivity: 'base' });
      if (nameOrder !== 0) return nameOrder;
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
