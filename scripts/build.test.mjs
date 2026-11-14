import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';

const page = new URL('../page/', import.meta.url);
const html = await readFile(new URL('index.html', page), 'utf8');
const bundle = await readFile(new URL('app.bundle.js', page), 'utf8');

test('published page uses a deferred classic script with all runtime imports bundled', async () => {
  const hash = createHash('sha256');
  const inputs = ['app.js', 'view.js', 'catalog.js', 'prices.js', 'currency.js', 'icon-index.js', 'rankings.js', 'mono-icons.js',
    ...(await readdir(new URL('icons/', page))).filter((name) => name.endsWith('.svg')).sort().map((name) => `icons/${name}`)];
  for (const file of inputs) hash.update(await readFile(new URL(file, page)));
  assert.ok(bundle.includes(`// Sources SHA256: ${hash.digest('hex')}`), '页面源码或数据已变化，请先 npm run build');
  assert.match(html, /<script defer src="app\.bundle\.js"><\/script>/);
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotThrow(() => new vm.Script(bundle));
  assert.doesNotMatch(bundle, /\bimport\s*\(/);
});

test('bundled page renders data and interactive boards without storage, network or ES module loading', async () => {
  const window = new Window({ url: 'about:blank', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  try {
    Object.defineProperty(window, 'localStorage', { get() { throw new window.DOMException('Opaque sandbox origin', 'SecurityError'); } });
    window.fetch = () => { throw new Error('Runtime networking is forbidden'); };
    window.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
    await window.eval(bundle);
    const document = window.document;
    assert.match(document.querySelector('#result-count').textContent, /614/);
    assert.equal(document.querySelectorAll('.model-card').length, 40);
    assert.equal(document.querySelectorAll('.recommend-board').length, 3);
    assert.equal(document.querySelector('#snapshot-date').textContent, '2026-11-14');
    // 单色品牌图标必须是带路径的内联 SVG，不再依赖外部 mask 请求。
    for (const prefix of ['openai/', 'moonshotai/']) {
      const svg = document.querySelector(`.board-row[data-id^="${prefix}"] svg.logo-glyph`);
      assert.ok(svg?.querySelector('path'), `${prefix} 图标必须含有内联路径`);
      assert.equal(svg.getAttribute('fill'), 'currentColor');
      assert.equal(svg.hasAttribute('src'), false);
    }
    assert.equal(document.querySelectorAll('span.logo-glyph').length, 0);
    assert.doesNotMatch(await readFile(new URL('style.css', page), 'utf8'), /(?:-webkit-)?mask\s*:/);
    document.querySelector('[data-theme-option="dark"]').click();
    assert.equal(document.documentElement.dataset.msTheme, 'dark');
    assert.equal(document.querySelector('svg.logo-glyph').getAttribute('fill'), 'currentColor');
    document.querySelector('[data-theme-option="light"]').click();
    const { CATALOG } = await import('../page/catalog.js');
    const search = document.querySelector('#search');
    for (const lab of ['openai', 'moonshotai', 'xai', 'ai21', 'inception', 'liquid', 'reflection', 'thinkingmachines', 'xiaomi']) {
      const model = CATALOG.find((m) => m.id.startsWith(`${lab}/`));
      if (!model) continue;
      search.value = model.id;
      search.dispatchEvent(new window.Event('input'));
      assert.ok(document.querySelector(`.model-card[data-model-id="${model.id}"] svg.logo-glyph path`), `${lab} 卡片必须有内联图标`);
    }
    search.value = '';
    search.dispatchEvent(new window.Event('input'));
    document.querySelector('[data-budget-index="0"]').click();
    assert.equal(document.querySelector('[data-budget-index="0"]').getAttribute('aria-pressed'), 'true');
    document.querySelector('[data-action="show-task"][data-task="frontend"]').click();
    assert.match(document.querySelector('#result-count').textContent, /112/);
    document.querySelector('.board-row').click();
    assert.equal(document.querySelector('#model-modal').hidden, false);
  } finally {
    await window.happyDOM.close();
  }
});
