import { CATALOG, SNAPSHOT } from './catalog.js';
import { USD_CNY } from './currency.js';
import { ICON_LABS } from './icon-index.js';
import { PRICES } from './prices.js';
import {
  evidenceFootnote,
  budgetTask,
  evidenceLabel,
  filterModels,
  formatContext,
  formatPrice,
  formatSignal,
  headlineText,
  inputOutputPhrase,
  labFor,
  labs,
  panelRows,
  recommendationSentence,
  sortModels,
  taskBasis,
  taskIds,
  taskScoreMap,
} from './view.js';

if (globalThis.magpie && typeof globalThis.magpie.ready === 'function') {
  globalThis.magpie.ready();
}

let RANKINGS = null;
try {
  RANKINGS = (await import('./rankings.js')).RANKINGS;
} catch {
  RANKINGS = null;
}

function hasRankings() {
  return Object.values(RANKINGS?.tasks ?? {}).some((task) => Array.isArray(task?.models) && task.models.length > 0);
}

const COLOR_ICONS = {
  anthropic: 'icons/brand-claude-color.svg',
  google: 'icons/brand-gemini-color.svg',
  alibaba: 'icons/brand-qwen-color.svg',
  deepseek: 'icons/brand-deepseek-color.svg',
  zhipuai: 'icons/brand-zhipu-color.svg',
  minimax: 'icons/brand-minimax-color.svg',
  meta: 'icons/brand-meta-color.svg',
  mistral: 'icons/brand-mistral-color.svg',
  cohere: 'icons/brand-cohere-color.svg',
  nvidia: 'icons/brand-nvidia-color.svg',
  perplexity: 'icons/brand-perplexity-color.svg',
  stepfun: 'icons/brand-stepfun-color.svg',
  baidu: 'icons/brand-wenxin-color.svg',
  tencent: 'icons/brand-hunyuan-color.svg',
  amazon: 'icons/brand-aws-color.svg',
  meituan: 'icons/brand-longcat-color.svg',
  'bytedance-seed': 'icons/brand-doubao-color.svg',
  microsoft: 'icons/brand-microsoft-color.svg',
};

const MASK_ICONS = {
  openai: 'icons/brand-openai.svg',
  xai: 'icons/brand-xai.svg',
  ai21: 'icons/brand-ai21.svg',
  moonshotai: 'icons/brand-kimi.svg',
};

const PAGE_SIZE = 40;
const $ = (selector) => document.querySelector(selector);
const listElement = $('#model-list');
const emptyState = $('#empty-state');
const moreButton = $('#load-more');
const countElement = $('#result-count');
const recommendElement = $('#recommend');
const taskPill = $('#task-pill');
const taskPillLabel = $('#task-pill-label');
const listHint = $('#list-hint');
const snapshotDate = $('#snapshot-date');
const searchInput = $('#search');
const categoryButtons = [...document.querySelectorAll('[data-category]')];
const layoutButtons = [...document.querySelectorAll('[data-layout]')];
const themeButtons = [...document.querySelectorAll('[data-theme-option]')];
const currencyButtons = [...document.querySelectorAll('[data-currency]')];
const rateNote = $('#rate-note');
const rateDot = $('#rate-dot');
const PREFERENCES_KEY = 'magpie-model-square';
const validLayouts = new Set(['grid', 'list']);
const validThemes = new Set(['light', 'system', 'dark']);
const validCurrencies = new Set(['cny', 'usd']);

function readPreferences() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(PREFERENCES_KEY) ?? 'null');
    return {
      layout: validLayouts.has(saved?.layout) ? saved.layout : 'grid',
      theme: validThemes.has(saved?.theme) ? saved.theme : 'system',
      currency: validCurrencies.has(saved?.currency) ? saved.currency : 'cny',
    };
  } catch {
    return { layout: 'grid', theme: 'system', currency: 'cny' };
  }
}

const savedPreferences = readPreferences();
const state = {
  query: '',
  category: 'all',
  lab: 'all',
  sort: 'latest',
  layout: savedPreferences.layout,
  theme: savedPreferences.theme,
  currency: savedPreferences.currency,
  task: null,
  budgetIndex: 1,
  expandedId: null,
  evidenceTask: null,
  evidenceFor: null,
  visibleCount: PAGE_SIZE,
};

// 用户自己改过之后，异步到达的宿主选项不再覆盖他的选择。
let preferencesTouched = false;

snapshotDate.textContent = SNAPSHOT.fetched;

// 页面在 magpie 的沙盒里跑，<html> 上的 data-theme 由 bridge 维护，
// 这里只把「偏好」换算成实际明暗，写到自己的属性上，不和 bridge 抢。
function hostTheme() {
  const dark = globalThis.magpie?.theme?.dark;
  if (typeof dark === 'boolean') return dark ? 'dark' : 'light';
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

function resolvedTheme() {
  return state.theme === 'system' ? hostTheme() : state.theme;
}

function syncPreferenceControls() {
  document.documentElement.dataset.msTheme = resolvedTheme();
  // 跟随窗口时用 bridge 写入的 --magpie-*；强制浅色或深色时不能拿宿主当前主题的变量。
  if (state.theme === 'system') document.documentElement.dataset.msFollow = 'host';
  else delete document.documentElement.dataset.msFollow;
  listElement.classList.toggle('is-list', state.layout === 'list');
  for (const button of layoutButtons) {
    const active = button.dataset.layout === state.layout;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  for (const button of themeButtons) {
    const active = button.dataset.themeOption === state.theme;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  for (const button of currencyButtons) {
    const active = button.dataset.currency === state.currency;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const showRate = state.currency === 'cny';
  rateNote.textContent = showRate ? `1 美元 ≈ ${USD_CNY.rate} 元（${USD_CNY.asOf} 中间价）` : '';
  rateNote.hidden = !showRate;
  rateDot.hidden = !showRate;
}

let lastOptionsWriteAt = 0;
let optionsWriteTimer = null;
let queuedOptionsValue = null;

function flushOptionsWrite() {
  optionsWriteTimer = null;
  const options = globalThis.magpie?.options;
  if (typeof options?.set !== 'function' || !queuedOptionsValue) return;
  const value = queuedOptionsValue;
  queuedOptionsValue = null;
  lastOptionsWriteAt = Date.now();
  try {
    const result = options.set(value);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Host options are the persistent store inside magpie; localStorage only covers the browser preview.
  }
}

function persistPreferences() {
  const value = { layout: state.layout, theme: state.theme, currency: state.currency };
  try {
    globalThis.localStorage?.setItem(PREFERENCES_KEY, JSON.stringify(value));
  } catch {
    // The controls still work for this session when storage is unavailable.
  }

  if (typeof globalThis.magpie?.options?.set !== 'function') return;
  queuedOptionsValue = value;
  if (optionsWriteTimer) return;
  const wait = Math.max(0, 1000 - (Date.now() - lastOptionsWriteAt));
  if (wait > 0) optionsWriteTimer = setTimeout(flushOptionsWrite, wait);
  else flushOptionsWrite();
}

function setPreference(name, value) {
  if (state[name] === value) return;
  preferencesTouched = true;
  state[name] = value;
  syncPreferenceControls();
  persistPreferences();
  if (name === 'layout' || name === 'currency') render();
}

syncPreferenceControls();

// 沙盒页面里 localStorage 会抛 SecurityError，正式环境靠 magpie.options 持久化。
async function loadHostPreferences() {
  const get = globalThis.magpie?.options?.get;
  if (typeof get !== 'function') return;
  let stored;
  try {
    stored = await get();
  } catch {
    return;
  }
  if (!stored || typeof stored !== 'object' || preferencesTouched) return;
  const next = {
    layout: validLayouts.has(stored.layout) ? stored.layout : state.layout,
    theme: validThemes.has(stored.theme) ? stored.theme : state.theme,
    currency: validCurrencies.has(stored.currency) ? stored.currency : state.currency,
  };
  if (next.layout === state.layout && next.theme === state.theme && next.currency === state.currency) return;
  Object.assign(state, next);
  syncPreferenceControls();
  render();
}

if (typeof globalThis.magpie?.onTheme === 'function') {
  globalThis.magpie.onTheme(() => {
    if (state.theme === 'system') syncPreferenceControls();
  });
}

globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
  if (state.theme === 'system') syncPreferenceControls();
});

const dropdowns = {
  lab: {
    trigger: $('#lab-filter'),
    menu: $('#lab-filter-menu'),
    valueElement: $('#lab-filter-value'),
    options: [
      { value: 'all', label: '全部厂商' },
      ...labs(CATALOG).map((lab) => ({ value: lab, label: lab })),
    ],
    currentValue: () => state.lab,
    onSelect(value) {
      state.lab = value;
      state.visibleCount = PAGE_SIZE;
      state.expandedId = null;
      closeModal();
      render();
    },
  },
  sort: {
    trigger: $('#sort-order'),
    menu: $('#sort-order-menu'),
    valueElement: $('#sort-order-value'),
    options: [
      { value: 'latest', label: '最新发布' },
      { value: 'context', label: '上下文' },
      { value: 'name', label: '名称' },
      ...(hasRankings() ? [{ value: 'task', label: '按榜单分数' }] : []),
    ],
    currentValue: () => state.sort,
    onSelect(value) {
      state.sort = value;
      state.visibleCount = PAGE_SIZE;
      render();
    },
  },
};

let openDropdownName = null;

function syncDropdown(name) {
  const dropdown = dropdowns[name];
  const currentValue = dropdown.currentValue();
  const selected = dropdown.options.find((option) => option.value === currentValue);
  dropdown.valueElement.textContent = selected?.label ?? '';
  for (const option of dropdown.menu.querySelectorAll('[role="option"]')) {
    option.setAttribute('aria-selected', String(option.dataset.value === currentValue));
  }
}

function closeOpenDropdown(restoreFocus = false) {
  if (!openDropdownName) return;
  const dropdown = dropdowns[openDropdownName];
  dropdown.menu.hidden = true;
  dropdown.trigger.setAttribute('aria-expanded', 'false');
  dropdown.trigger.closest('.custom-dropdown').classList.remove('is-open');
  openDropdownName = null;
  if (restoreFocus) dropdown.trigger.focus();
}

function openDropdown(name) {
  if (openDropdownName === name) return;
  closeOpenDropdown();
  const dropdown = dropdowns[name];
  openDropdownName = name;
  dropdown.menu.hidden = false;
  dropdown.trigger.setAttribute('aria-expanded', 'true');
  dropdown.trigger.closest('.custom-dropdown').classList.add('is-open');
  const selected = dropdown.menu.querySelector('[aria-selected="true"]');
  (selected ?? dropdown.menu.querySelector('[role="option"]'))?.focus();
}

function chooseDropdownOption(name, option) {
  const dropdown = dropdowns[name];
  const value = option.dataset.value;
  closeOpenDropdown(true);
  if (dropdown.currentValue() !== value) dropdown.onSelect(value);
  syncDropdown(name);
}

for (const [name, dropdown] of Object.entries(dropdowns)) {
  for (const item of dropdown.options) {
    const option = document.createElement('div');
    option.className = 'dropdown-option';
    option.setAttribute('role', 'option');
    option.setAttribute('tabindex', '-1');
    option.dataset.value = item.value;
    option.textContent = item.label;
    dropdown.menu.append(option);
  }
  syncDropdown(name);

  dropdown.trigger.addEventListener('click', () => {
    if (openDropdownName === name) closeOpenDropdown(true);
    else openDropdown(name);
  });
  dropdown.trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openDropdown(name);
    }
  });
  dropdown.menu.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"]');
    if (option && dropdown.menu.contains(option)) chooseDropdownOption(name, option);
  });
  dropdown.menu.addEventListener('keydown', (event) => {
    const options = [...dropdown.menu.querySelectorAll('[role="option"]')];
    const index = options.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const base = index < 0 ? (direction > 0 ? -1 : 0) : index;
      options[(base + direction + options.length) % options.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options[event.key === 'Home' ? 0 : options.length - 1]?.focus();
    } else if (event.key === 'Enter' && options[index]) {
      event.preventDefault();
      chooseDropdownOption(name, options[index]);
    }
  });
}

document.addEventListener('click', (event) => {
  if (openDropdownName && !event.target.closest('.custom-dropdown')) closeOpenDropdown();
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function contextOf(model) {
  return model?.limit?.context;
}

function priceOf(model) {
  return PRICES[String(model?.id ?? '')] ?? null;
}

const PRICE_UNIT = '每百万 token 的输入 / 输出';

function priceTitle(price) {
  if (!price) return '没有标价';
  const base = price.official ? '厂商自己的接口价' : '厂商未标价，这是其他接口里最常见的价';
  if (state.currency !== 'cny') return `${base}，${PRICE_UNIT}`;
  return `${base}，按 ${USD_CNY.asOf} 中间价 1 美元 ≈ ${USD_CNY.rate} 元换算成人民币，${PRICE_UNIT}`;
}

function priceMarkup(model) {
  const price = priceOf(model);
  const label = formatPrice(price, state.currency);
  return `<span class="price-value${price ? '' : ' is-missing'}" title="${priceTitle(price)}">${escapeHtml(label)}</span>`;
}

function textList(values) {
  if (!Array.isArray(values) || values.length === 0) return '未提供';
  const labels = { text: '文本', image: '图片', audio: '音频', video: '视频' };
  return values.map((value) => labels[String(value).toLowerCase()] ?? String(value)).join('、');
}

const CATEGORY_LABELS = {
  chat: '对话',
  image: '图像',
  video: '视频',
  speech: '语音',
  transcription: '转写',
  embedding: '嵌入',
  rerank: '重排序',
};

function categoryLabel(model) {
  return CATEGORY_LABELS[model?.category] ?? '对话';
}

function isMultimodal(model) {
  const values = [...(model?.modalities?.input ?? []), ...(model?.modalities?.output ?? [])];
  return values.some((item) => {
    const name = String(item).toLowerCase();
    return name && name !== 'text';
  });
}

function flagsFor(model) {
  const flags = [categoryLabel(model)];
  if (model?.category === 'chat' && isMultimodal(model)) flags.push('多模态');
  return flags.map((flag) => `<span class="flag">${escapeHtml(flag)}</span>`).join('');
}

function detailsFor(model, detailId) {
  const limit = model.limit ?? {};
  const modalities = model.modalities ?? {};
  const id = String(model.id ?? '');
  const release = model.release_date || '未提供';
  const knowledge = model.knowledge || '未提供';
  const openWeights = model.open_weights === true ? '是' : model.open_weights === false ? '否' : '未提供';
  return `
    <div class="model-detail" id="${detailId}">
      <p class="detail-description">${escapeHtml(model.description || '暂无描述。')}</p>
      <dl class="detail-grid">
        <div class="detail-item"><dt>种类</dt><dd>${escapeHtml(categoryLabel(model))}${model?.category === 'chat' && isMultimodal(model) ? '、多模态' : ''}</dd></div>
        <div class="detail-item"><dt>模型 ID</dt><dd class="id-line"><code>${escapeHtml(id)}</code><button class="copy-button" type="button" data-action="copy" data-id="${escapeHtml(id)}">复制</button></dd></div>
        ${evidenceMarkup(model)}
        <div class="detail-item"><dt>输入模态</dt><dd>${escapeHtml(textList(modalities.input))}</dd></div>
        <div class="detail-item"><dt>输出模态</dt><dd>${escapeHtml(textList(modalities.output))}</dd></div>
        <div class="detail-item"><dt>标价</dt><dd>${priceMarkup(model)}</dd></div>
        <div class="detail-item"><dt>上下文 / 输出上限</dt><dd>${escapeHtml(formatContext(limit.context))} / ${escapeHtml(formatContext(limit.output))}</dd></div>
        <div class="detail-item"><dt>发布日期</dt><dd>${escapeHtml(release)}</dd></div>
        <div class="detail-item"><dt>知识截止日期</dt><dd>${escapeHtml(knowledge)}</dd></div>
        <div class="detail-item"><dt>开源权重</dt><dd>${openWeights}</dd></div>
      </dl>
    </div>`;
}

function iconMarkup(model) {
  const lab = String(model?.id ?? '').split('/')[0].toLowerCase();
  const family = String(model?.family ?? '').toLowerCase();
  let spec = null;
  if (lab === 'google' && family.startsWith('gemma')) spec = { type: 'img', src: 'icons/brand-gemma-color.svg' };
  else if (MASK_ICONS[lab]) spec = { type: 'mask', src: MASK_ICONS[lab] };
  else if (COLOR_ICONS[lab]) spec = { type: 'img', src: COLOR_ICONS[lab] };
  else if (ICON_LABS.has(lab)) spec = { type: 'mask', src: `icons/${lab}.svg` };
  if (!spec) {
    const letter = [...labFor(model)][0] || '?';
    return `<span class="logo-plate is-letter" aria-hidden="true">${escapeHtml(letter.toUpperCase())}</span>`;
  }
  if (spec.type === 'img') {
    return `<span class="logo-plate" aria-hidden="true"><img class="logo-img" src="${spec.src}" alt=""></span>`;
  }
  return `<span class="logo-plate" aria-hidden="true"><span class="logo-glyph" style="--icon:url('${spec.src}')"></span></span>`;
}

const COPY_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="14" height="14" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
const COPIED_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12.5 4.6 4.6L19 7.4"></path></svg>';

function activeTask() {
  return state.task ? RANKINGS?.tasks?.[state.task] ?? null : null;
}

function rankRow(id) {
  return activeTask()?.models?.find((model) => model.id === id) ?? null;
}

function evidenceTasksFor(model) {
  const tasks = RANKINGS?.tasks ?? {};
  const pick = (key) => {
    const task = tasks[key];
    const row = task?.models?.find((item) => item.id === model.id);
    return row ? [[key, task, row]] : [];
  };
  if (state.task) return pick(state.task);
  const showingEvidence = state.evidenceFor === model.id || state.expandedId === model.id;
  if (!showingEvidence || !state.evidenceTask) return [];
  const keys = state.evidenceTask === '*' ? Object.keys(tasks) : [state.evidenceTask];
  return keys.flatMap((key) => pick(key));
}

function evidenceMarkup(model) {
  return evidenceTasksFor(model).map(([, task, row]) => {
    const seen = new Set();
    const items = [task.headline, ...(task.sources ?? [])].filter((sourceId) => {
      if (!sourceId || seen.has(sourceId) || !Number.isFinite(Number(row.evidence?.[sourceId]))) return false;
      seen.add(sourceId);
      return true;
    }).map((sourceId) => `<li><span>${escapeHtml(evidenceLabel(sourceId, task, RANKINGS.sources))}</span><span>${escapeHtml(formatSignal(sourceId, row.evidence[sourceId]))}</span></li>`).join('');
    return `<div class="detail-item detail-evidence"><dt>推荐依据 · ${escapeHtml(task.label)}</dt><dd><ul class="evidence-list">${items}</ul>${row.variant ? `<p class="evidence-note">评测配置：${escapeHtml(row.variant)}</p>` : ''}<p class="evidence-note">${escapeHtml(evidenceFootnote(RANKINGS.asOf, task))}</p></dd></div>`;
  }).join('');
}

function rowFor(model) {
  const id = String(model.id ?? '');
  const name = String(model.name || id);
  const ranked = rankRow(id);
  const expanded = state.expandedId === id;
  const badge = ranked ? `<span class="rank-badge" aria-hidden="true">${escapeHtml(ranked.rank)}</span>` : '';
  const score = ranked ? `<span class="task-score">${activeTask()?.scoreKind === 'elo' ? '网页 Elo' : 'AA 指数'} ${escapeHtml(ranked.score)}</span>` : '';
  const detailId = `detail-${id.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
  return `
    <article class="model-card${expanded ? ' is-expanded' : ''}" data-model-id="${escapeHtml(id)}">
      <button class="model-main" type="button" data-action="open" data-id="${escapeHtml(id)}" aria-haspopup="dialog">
        <span class="model-mark">${badge}${iconMarkup(model)}</span>
        <span class="model-copy">
          <span class="model-name">${escapeHtml(model.name || id)}</span>
          <span class="model-lab">${escapeHtml(labFor(model))}</span>
          ${score}
        </span>
        <span class="model-foot">
          ${priceMarkup(model)}
          <span class="context-value">${escapeHtml(formatContext(contextOf(model)))}</span>
          <span class="model-flags">${flagsFor(model)}</span>
        </span>
      </button>
      <button class="card-copy" type="button" data-action="copy-name" data-name="${escapeHtml(name)}" aria-label="复制模型名称" title="复制模型名称">${COPY_ICON}</button>
      ${expanded ? detailsFor(model, detailId) : ''}
    </article>`;
}

function featuredMarkup() {
  const featured = RANKINGS?.featured;
  const model = featured?.id ? modelById(featured.id) : null;
  if (!model) return '';
  const blurb = recommendationSentence(featured.reasons, inputOutputPhrase(priceOf(model), state.currency));
  const stats = [
    ['推荐分', featured.score ?? '—'],
    ['标价', formatPrice(priceOf(model), state.currency)],
    ['上下文', formatContext(contextOf(model))],
    ['上榜', featured.taskCount ?? '—'],
  ];
  return `<article class="recommend-feature">
      <p class="feature-kicker"><strong>综合推荐</strong></p>
      <div class="feature-identity">${iconMarkup(model)}<div class="model-copy"><span class="model-name">${escapeHtml(model.name || model.id)}</span><span class="model-lab">${escapeHtml(labFor(model))}</span></div></div>
      ${blurb ? `<p class="feature-blurb">${escapeHtml(blurb)}</p>` : ''}
      <dl class="feature-stats">${stats.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
      <div class="feature-actions">
        <button type="button" data-action="reveal" data-id="${escapeHtml(model.id)}" data-task="*">详情</button>
        <button type="button" data-action="copy-id" data-id="${escapeHtml(model.id)}">复制 ID</button>
      </div>
    </article>`;
}

function budgetOptions() {
  return state.currency === 'cny' ? [10, 30, 100] : [1, 5, 20];
}

function boardMarkup(key, task) {
  const panel = panelRows(task.models, 5);
  const rows = panel.rows.map((row) => {
    const model = modelById(row.id);
    if (!model) return '';
    const metric = headlineText(row, task) + (key === 'value' ? ` · ${state.currency === 'cny' ? '¥' : '$'}${row.cost.toFixed(2)}` : '');
    const cost = key === 'value' ? `<span class="board-score-sub">${state.currency === 'cny' ? '¥' : '$'}${row.cost.toFixed(2)} / M</span>` : '';
    const name = String(model.name || row.id);
    return `<button class="board-row" type="button" data-action="reveal" data-id="${escapeHtml(row.id)}" data-task="${escapeHtml(key)}" aria-label="${escapeHtml(`${name}，${metric}，查看详情`)}">
        <span class="board-rank" aria-hidden="true">${escapeHtml(row.rank)}</span>
        ${iconMarkup(model)}
        <span class="board-name">${escapeHtml(name)}</span>
        <span class="board-metric"><span class="board-score-main">${escapeHtml(row.score)}</span>${cost}</span>
        <svg class="board-detail" aria-hidden="true" viewBox="0 0 16 16"><path d="m6 4 4 4-4 4"/></svg>
      </button>`;
  }).join('');
  const arrow = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 8h10m-4-4 4 4-4 4"/></svg>';
  const more = panel.showAll
    ? `<button class="board-all" type="button" data-action="show-task" data-task="${escapeHtml(key)}" aria-label="查看${escapeHtml(task.label)}全部 ${panel.total} 个模型"><span>查看全部 ${panel.total.toLocaleString('zh-CN')} 个模型</span>${arrow}</button>`
    : '';
  const controls = key === 'value' ? `<div class="budget-controls" role="group" aria-label="每百万总 token 成本上限">${budgetOptions().map((value, i) => `<button type="button" data-action="budget" data-budget-index="${i}" aria-pressed="${i === state.budgetIndex}">≤ ${state.currency === 'cny' ? '¥' : '$'}${value}</button>`).join('')}</div>` : `<div class="board-columns" aria-hidden="true"><span>模型</span><span>${key === 'frontend' ? '网页 Elo' : '综合指数'}</span></div>`;
  const title = key === 'value' ? '性价比' : key === 'frontend' ? '前端 / 网页' : task.label;
  const note = key === 'value' ? '输入 / 输出 3:1 · 每百万总 token 成本' : key === 'frontend' ? '网页生成偏好 · 不代表全部编程能力' : '按 AA 综合智能指数排序';
  return `<section class="recommend-board" aria-labelledby="board-${escapeHtml(key)}"><header class="board-header"><div class="board-head"><h2 id="board-${escapeHtml(key)}" class="board-title">${escapeHtml(title)}</h2><span class="board-count">${key === 'value' ? '预算内最强' : `${panel.total} 个模型`}</span></div><p class="board-note" title="${escapeHtml(note)}">${escapeHtml(note)}</p>${controls}</header><div class="board-rows">${rows || '<p class="board-empty">该预算下暂无已评测且有标价的模型，试试提高预算。</p>'}</div>${more}</section>`;
}

function renderRecommend() {
  if (!recommendElement) return;
  const tasks = Object.entries(RANKINGS?.tasks ?? {}).filter(([key, task]) => Array.isArray(task?.models) && (task.models.length > 0 || key === 'value'));
  if (!tasks.length) {
    recommendElement.hidden = true;
    recommendElement.innerHTML = '';
    return;
  }
  recommendElement.hidden = false;
  recommendElement.innerHTML = `<p class="recommend-kicker">榜单抓取于 <time datetime="${escapeHtml(RANKINGS.asOf)}">${escapeHtml(RANKINGS.asOf)}</time></p><div class="recommend-panels">${featuredMarkup()}${tasks.map(([key, task]) => boardMarkup(key, task)).join('')}</div>`;
}

function currentModels() {
  const only = state.task ? new Set(taskIds(RANKINGS, state.task)) : null;
  const scores = state.sort === 'task' ? taskScoreMap(RANKINGS, state.task) : null;
  return sortModels(filterModels(CATALOG, state.query, state.category, state.lab, only), state.sort, scores);
}

function syncCategories() {
  const locked = Boolean(state.task);
  for (const button of categoryButtons) {
    const active = button.dataset.category === state.category;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
    button.disabled = locked && button.dataset.category !== 'chat';
  }
}

function enterTask(key) {
  const task = RANKINGS?.tasks?.[key];
  if (!task?.models?.length) return;
  closeOpenDropdown(false);
  closeModal();
  state.task = key;
  state.category = 'chat';
  state.sort = 'task';
  state.expandedId = null;
  state.evidenceTask = key;
  state.visibleCount = PAGE_SIZE;
  syncDropdown('sort');
  render();
}

function exitTask() {
  if (!state.task) return;
  closeModal();
  if (state.sort === 'task') state.sort = 'latest';
  state.task = null;
  state.evidenceTask = null;
  state.expandedId = null;
  state.visibleCount = PAGE_SIZE;
  syncDropdown('sort');
  render();
}

function revealModel(id, taskKey, returnFocus) {
  if (!modelById(id)) return;
  state.evidenceTask = taskKey || state.task;
  state.evidenceFor = id;
  openModal(id, returnFocus);
}

function render() {
  if (RANKINGS?.tasks?.intelligence) {
    RANKINGS.tasks.value = budgetTask(RANKINGS.tasks.intelligence, PRICES, budgetOptions()[state.budgetIndex], state.currency);
  }
  listElement.classList.toggle('is-list', state.layout === 'list');
  renderRecommend();
  const filtered = currentModels();
  if (state.expandedId && !filtered.slice(0, state.visibleCount).some((model) => model.id === state.expandedId)) {
    const index = filtered.findIndex((model) => model.id === state.expandedId);
    if (index >= 0) state.visibleCount = index + 1;
    else state.expandedId = null;
  }
  const visible = filtered.slice(0, state.visibleCount);
  listElement.innerHTML = visible.map(rowFor).join('');
  listElement.hidden = filtered.length === 0;
  emptyState.hidden = filtered.length !== 0;
  const task = activeTask();
  if (taskPill) {
    taskPill.hidden = !task;
    if (task) {
      taskPillLabel.textContent = `${task.label} · 上榜 ${task.models.length.toLocaleString('zh-CN')} 个`;
      taskPill.setAttribute('aria-label', `清除${task.label}筛选`);
    }
  }
  if (listHint) listHint.textContent = task ? taskBasis(task, RANKINGS.sources, RANKINGS.asOf) : '选择一个模型查看详情';
  emptyState.textContent = task && filtered.length === 0
    ? `按「${task.label}」推荐 0 个模型。试试清除厂商筛选，或清除任务筛选。`
    : '没有找到符合条件的模型。';
  countElement.textContent = visible.length < filtered.length
    ? `显示 ${visible.length.toLocaleString('zh-CN')} / ${filtered.length.toLocaleString('zh-CN')} 个模型`
    : `${filtered.length.toLocaleString('zh-CN')} 个模型`;
  moreButton.hidden = visible.length >= filtered.length;
  moreButton.textContent = '继续显示';
  syncCategories();
  refreshModal();
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openDropdownName) {
    event.preventDefault();
    closeOpenDropdown(true);
    return;
  }
  if (event.key === 'Escape' && !modal.hidden) {
    event.preventDefault();
    closeModal();
    return;
  }
  const tagName = event.target?.tagName;
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA'].includes(tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  state.visibleCount = PAGE_SIZE;
  state.expandedId = null;
  closeModal();
  render();
});

for (const button of categoryButtons) {
  button.addEventListener('click', () => {
    if (button.disabled || (state.task && button.dataset.category !== 'chat')) return;
    state.category = button.dataset.category;
    state.visibleCount = PAGE_SIZE;
    state.expandedId = null;
    closeModal();
    render();
  });
}

taskPill?.addEventListener('click', () => exitTask());

recommendElement?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !recommendElement.contains(button)) return;
  if (button.dataset.action === 'budget') {
    const index = Number(button.dataset.budgetIndex);
    if (!Number.isInteger(index) || index < 0 || index >= budgetOptions().length) return;
    state.budgetIndex = index;
    state.visibleCount = PAGE_SIZE;
    render();
    recommendElement.querySelector(`[data-budget-index="${index}"]`)?.focus();
    return;
  }
  if (button.dataset.action === 'show-task') {
    enterTask(button.dataset.task);
    return;
  }
  if (button.dataset.action === 'reveal') {
    revealModel(button.dataset.id, button.dataset.task, button);
    return;
  }
  if (button.dataset.action === 'copy-id') {
    const previous = button.textContent;
    try {
      await copyText(button.dataset.id);
      button.textContent = '已复制';
    } catch {
      button.textContent = '复制失败';
    }
    setTimeout(() => {
      if (button.isConnected) button.textContent = previous;
    }, 1400);
  }
});

moreButton.addEventListener('click', () => {
  state.visibleCount += PAGE_SIZE;
  render();
});

for (const button of layoutButtons) {
  button.addEventListener('click', () => setPreference('layout', button.dataset.layout));
}

for (const button of themeButtons) {
  button.addEventListener('click', () => setPreference('theme', button.dataset.themeOption));
}

for (const button of currencyButtons) {
  button.addEventListener('click', () => setPreference('currency', button.dataset.currency));
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // 沙盒页面的 clipboard API 会以 NotAllowedError 拒绝，退回选区方案。
    }
  }
  const temporary = document.createElement('textarea');
  temporary.value = value;
  temporary.setAttribute('readonly', '');
  temporary.style.position = 'fixed';
  temporary.style.opacity = '0';
  document.body.append(temporary);
  temporary.select();
  const copied = document.execCommand('copy');
  temporary.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

function flashCopied(button) {
  button.innerHTML = COPIED_ICON;
  button.classList.add('is-copied');
  button.setAttribute('aria-label', '已复制');
  button.title = '已复制';
  setTimeout(() => {
    if (!button.isConnected) return;
    button.innerHTML = COPY_ICON;
    button.classList.remove('is-copied');
    button.setAttribute('aria-label', '复制模型名称');
    button.title = '复制模型名称';
  }, 1400);
}

const modal = $('#model-modal');
const modalDialog = modal.querySelector('.dialog');
const modalBody = $('#model-modal-body');
const modalTitle = $('#model-modal-title');
const modalLab = $('#model-modal-lab');
const modalCopy = $('#model-modal-copy');
const modalMark = $('#model-modal-mark');
const SPRING = 'cubic-bezier(.22, 1.2, .36, 1)';
const IOS_EASE = 'cubic-bezier(.32, .72, 0, 1)';
const MORPH_REST = 'inset(-100px round 14px)';
const VEIL_OFF = { backgroundColor: 'rgba(0, 0, 0, 0)', backdropFilter: 'blur(0px) saturate(1)', webkitBackdropFilter: 'blur(0px) saturate(1)' };
let openModelId = null;
let modalReturn = null;
let modalOrigin = null;
let modalDone = null;

function calm() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function modelById(id) {
  return CATALOG.find((model) => String(model.id ?? '') === id);
}

function unveil(node) {
  for (const prop of ['opacity', 'background-color', 'backdrop-filter', '-webkit-backdrop-filter']) node.style.removeProperty(prop);
}

function fromRect(from, to) {
  const scale = Math.max(0.3, Math.min(1, from.width / to.width));
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

function morphFrom(from, to) {
  const scale = Math.max(0.3, Math.min(1, from.width / to.width));
  const width = Math.min(to.width, from.width / scale);
  const height = Math.min(to.height, from.height / scale);
  const radius = Math.min(10, from.height / 2) / scale;
  return {
    transform: fromRect(from, to),
    clipPath: `inset(${(to.height - height) / 2}px ${(to.width - width) / 2}px round ${radius}px)`,
  };
}

function stopModalMotion() {
  modalDone = null;
  for (const anim of [...modal.getAnimations(), ...modalDialog.getAnimations()]) anim.cancel();
}

function closeModal() {
  if (modal.hidden || modal.classList.contains('out')) return;
  stopModalMotion();
  modal.classList.add('out');
  const was = modalDialog.style.transform;
  modalDialog.style.transform = 'none';
  const to = modalDialog.getBoundingClientRect();
  const from = calm() ? null : modalOrigin;
  modalDialog.style.transform = was;
  const clip = modalDialog.style.clipPath || MORPH_REST;
  const shape = { duration: from ? 380 : 260, easing: IOS_EASE, fill: 'forwards' };
  const moves = [
    modal.animate([VEIL_OFF], { ...shape, easing: 'ease-out' }),
    calm()
      ? modalDialog.animate([{ opacity: 0 }], { duration: 140, fill: 'forwards' })
      : modalDialog.animate(from ? [{ transform: was || 'none', clipPath: clip }, morphFrom(from, to)] : [{ transform: 'translateY(14px) scale(.95)' }], shape),
  ];
  if (!calm()) {
    moves.push(modalDialog.animate(
      [{ offset: from ? 0.6 : 0.2, opacity: getComputedStyle(modalDialog).opacity, easing: 'ease-in' }, { opacity: 0 }],
      { ...shape, easing: 'linear' },
    ));
  }
  const done = modalDone = Promise.all(moves.map((anim) => anim.finished)).then(() => {
    if (modalDone !== done) return;
    modalDone = null;
    modal.hidden = true;
    modal.classList.remove('out');
    openModelId = null;
    modalDialog.style.opacity = modalDialog.style.transform = modalDialog.style.clipPath = '';
    unveil(modal);
    const back = modalReturn;
    modalReturn = null;
    modalOrigin = null;
    back?.focus();
  }, () => {});
}

function openModal(id, returnFocus) {
  const model = modelById(id);
  if (!model) return;
  closeOpenDropdown(false);
  stopModalMotion();
  modal.classList.remove('out');
  openModelId = id;
  const name = String(model.name || id);
  modalTitle.textContent = name;
  if (modalCopy) modalCopy.dataset.name = name;
  modalLab.textContent = labFor(model);
  modalMark.innerHTML = iconMarkup(model);
  modalBody.innerHTML = detailsFor(model, 'model-modal-detail');
  const origin = returnFocus?.getBoundingClientRect?.();
  modal.hidden = false;
  if (!modalReturn) modalReturn = returnFocus;
  modalDialog.style.opacity = modalDialog.style.transform = modalDialog.style.clipPath = '';
  unveil(modal);
  const to = modalDialog.getBoundingClientRect();
  const from = origin && origin.width ? { left: origin.left, top: origin.top, width: origin.width, height: origin.height } : null;
  modalOrigin = from;
  modal.animate([{ ...VEIL_OFF, offset: 0 }], { duration: 280, easing: 'ease-out' });
  if (calm()) {
    modalDialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  } else {
    const grow = modalDialog.animate(
      from ? [morphFrom(from, to), { transform: 'none', clipPath: MORPH_REST }] : [{ transform: 'translateY(24px) scale(.94)' }, { transform: 'none' }],
      { duration: 570, easing: SPRING },
    );
    modalDialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: from ? 140 : 240, easing: 'ease-out' });
    if (from) {
      const x0 = modalDialog.offsetLeft;
      const y0 = modalDialog.offsetTop;
      const follow = new ResizeObserver(() => {
        const now = { left: to.left + modalDialog.offsetLeft - x0, top: to.top + modalDialog.offsetTop - y0, width: modalDialog.offsetWidth, height: modalDialog.offsetHeight };
        grow.effect.setKeyframes([morphFrom(from, now), { transform: 'none', clipPath: MORPH_REST }]);
      });
      follow.observe(modalDialog);
      const stop = () => follow.disconnect();
      grow.finished.then(stop, stop);
    }
  }
  modal.querySelector('.modal-close')?.focus();
}

function refreshModal() {
  if (modal.hidden || modal.classList.contains('out') || !openModelId) return;
  const model = modelById(openModelId);
  if (!model) {
    closeModal();
    return;
  }
  modalBody.innerHTML = detailsFor(model, 'model-modal-detail');
}

modal.addEventListener('click', async (event) => {
  const nameCopy = event.target.closest('button[data-action="copy-name"]');
  if (nameCopy) {
    try {
      await copyText(nameCopy.dataset.name);
      flashCopied(nameCopy);
    } catch {
      nameCopy.title = '复制失败';
      setTimeout(() => {
        if (nameCopy.isConnected) nameCopy.title = '复制模型名称';
      }, 1400);
    }
    return;
  }
  const copy = event.target.closest('button[data-action="copy"]');
  if (copy) {
    try {
      await copyText(copy.dataset.id);
      copy.textContent = '已复制';
    } catch {
      copy.textContent = '复制失败';
    }
    return;
  }
  if (event.target === modal || event.target.closest('.modal-close')) closeModal();
});

modal.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const items = [...modal.querySelectorAll('button')].filter((item) => !item.disabled);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

listElement.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'open') {
    if (!state.task) {
      state.evidenceTask = null;
      state.evidenceFor = null;
    }
    openModal(button.dataset.id, button);
    return;
  }
  if (button.dataset.action === 'copy') {
    try {
      await copyText(button.dataset.id);
      button.textContent = '已复制';
    } catch {
      button.textContent = '复制失败';
    }
    return;
  }
  if (button.dataset.action === 'copy-name') {
    try {
      await copyText(button.dataset.name);
      flashCopied(button);
    } catch {
      button.title = '复制失败';
      setTimeout(() => {
        if (button.isConnected) button.title = '复制模型名称';
      }, 1400);
    }
  }
});

render();
loadHostPreferences();
