import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { Window } from 'happy-dom';

const page = new URL('../page/', import.meta.url);
const html = await readFile(new URL('index.html', page), 'utf8');
const bundle = await readFile(new URL('app.bundle.js', page), 'utf8');

test('published page uses a deferred classic script with all runtime imports bundled', async () => {
  const hash = createHash('sha256');
  for (const file of ['app.js', 'view.js', 'catalog.js', 'prices.js', 'currency.js', 'icon-index.js', 'rankings.js']) hash.update(await readFile(new URL(file, page)));
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
