import { CATALOG, SNAPSHOT } from './catalog.js';
import { ICON_LABS } from './icon-index.js';
import { PRICES } from './prices.js';
import { filterModels, formatContext, formatPrice, labFor, labs, sortModels } from './view.js';

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

if (globalThis.magpie && typeof globalThis.magpie.ready === 'function') {
  globalThis.magpie.ready();
}

const PAGE_SIZE = 40;
const $ = (selector) => document.querySelector(selector);
const listElement = $('#model-list');
const emptyState = $('#empty-state');
const moreButton = $('#load-more');
const countElement = $('#result-count');
const snapshotDate = $('#snapshot-date');
const searchInput = $('#search');
const categoryButtons = [...document.querySelectorAll('[data-category]')];
const layoutButtons = [...document.querySelectorAll('[data-layout]')];
const themeButtons = [...document.querySelectorAll('[data-theme-option]')];
const PREFERENCES_KEY = 'magpie-model-square';
const validLayouts = new Set(['grid', 'list']);
const validThemes = new Set(['light', 'system', 'dark']);

function readPreferences() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(PREFERENCES_KEY) ?? 'null');
    return {
      layout: validLayouts.has(saved?.layout) ? saved.layout : 'grid',
      theme: validThemes.has(saved?.theme) ? saved.theme : 'system',
    };
  } catch {
    return { layout: 'grid', theme: 'system' };
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
  visibleCount: PAGE_SIZE,
  expandedId: null,
};

snapshotDate.textContent = SNAPSHOT.fetched;

function syncPreferenceControls() {
  document.documentElement.dataset.theme = state.theme;
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
    const result = options.set(PREFERENCES_KEY, value);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch {
    // Local storage remains the primary persistence path when the host API is unavailable.
  }
}

function persistPreferences() {
  const value = { layout: state.layout, theme: state.theme };
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
  state[name] = value;
  syncPreferenceControls();
  persistPreferences();
  if (name === 'layout') render();
}

syncPreferenceControls();

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

function priceMarkup(model) {
  const price = priceOf(model);
  const label = formatPrice(price);
  const title = !price
    ? '没有标价'
    : price.official
      ? '厂商自己的接口价，每百万 token 的输入 / 输出'
      : '厂商未标价，这是其他接口里最常见的价，每百万 token 的输入 / 输出';
  return `<span class="price-value${price ? '' : ' is-missing'}" title="${title}">${escapeHtml(label)}</span>`;
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

function rowFor(model, index) {
  const id = String(model.id ?? '');
  const expanded = state.expandedId === id;
  const detailId = `model-detail-${index}`;
  return `
    <article class="model-card${expanded ? ' is-expanded' : ''}">
      <button class="model-main" type="button" data-action="toggle" data-id="${escapeHtml(id)}" aria-expanded="${expanded}" aria-controls="${detailId}">
        ${iconMarkup(model)}
        <span class="model-copy">
          <span class="model-name">${escapeHtml(model.name || id)}</span>
          <span class="model-lab">${escapeHtml(labFor(model))}</span>
        </span>
        <span class="model-foot">
          ${priceMarkup(model)}
          <span class="context-value">${escapeHtml(formatContext(contextOf(model)))}</span>
          <span class="model-flags">${flagsFor(model)}</span>
        </span>
      </button>
      ${expanded ? detailsFor(model, detailId) : ''}
    </article>`;
}

function render() {
  listElement.classList.toggle('is-list', state.layout === 'list');
  const filtered = sortModels(
    filterModels(CATALOG, state.query, state.category, state.lab),
    state.sort,
  );
  const visible = filtered.slice(0, state.visibleCount);
  listElement.innerHTML = visible.map(rowFor).join('');
  listElement.hidden = filtered.length === 0;
  emptyState.hidden = filtered.length !== 0;
  countElement.textContent = visible.length < filtered.length
    ? `显示 ${visible.length.toLocaleString('zh-CN')} / ${filtered.length.toLocaleString('zh-CN')} 个模型`
    : `${filtered.length.toLocaleString('zh-CN')} 个模型`;
  moreButton.hidden = visible.length >= filtered.length;
  moreButton.textContent = '继续显示';
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openDropdownName) {
    event.preventDefault();
    closeOpenDropdown(true);
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
  render();
});

for (const button of categoryButtons) {
  button.addEventListener('click', () => {
    state.category = button.dataset.category;
    state.visibleCount = PAGE_SIZE;
    state.expandedId = null;
    for (const item of categoryButtons) {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    }
    render();
  });
}

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

listElement.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'toggle') {
    const id = button.dataset.id;
    state.expandedId = state.expandedId === id ? null : id;
    render();
    return;
  }
  if (button.dataset.action === 'copy') {
    const id = button.dataset.id;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        const temporary = document.createElement('textarea');
        temporary.value = id;
        temporary.setAttribute('readonly', '');
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.append(temporary);
        temporary.select();
        const copied = document.execCommand('copy');
        temporary.remove();
        if (!copied) throw new Error('Clipboard unavailable');
      }
      button.textContent = '已复制';
    } catch {
      button.textContent = '复制失败';
    }
  }
});

render();
