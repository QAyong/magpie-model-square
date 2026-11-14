import { CATALOG, SNAPSHOT } from './catalog.js';
import { USD_CNY } from './currency.js';
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

function rowFor(model) {
  const id = String(model.id ?? '');
  const name = String(model.name || id);
  return `
    <article class="model-card">
      <button class="model-main" type="button" data-action="open" data-id="${escapeHtml(id)}" aria-haspopup="dialog">
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
      <button class="card-copy" type="button" data-action="copy-name" data-name="${escapeHtml(name)}" aria-label="复制模型名称" title="复制模型名称">${COPY_ICON}</button>
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
  closeModal();
  render();
});

for (const button of categoryButtons) {
  button.addEventListener('click', () => {
    state.category = button.dataset.category;
    state.visibleCount = PAGE_SIZE;
    closeModal();
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
  modalTitle.textContent = String(model.name || id);
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
