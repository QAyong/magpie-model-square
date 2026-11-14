import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntelligenceRankings, loadOfficial, loadOpenRouter } from './aa-rankings.mjs';
const catalog = [
  { id: 'openai/gpt-6.1-sol', category: 'chat' },
  { id: 'anthropic/claude-opus-4-7', category: 'chat' },
  { id: 'openai/image', category: 'image' },
];
const options = { channel: 'official', fetchedAt: '2026-11-14T00:00:00.000Z', version: '5.0' };
test('raw scores retain precision, omit missing scores and rank ties without mixing vendors', () => {
  const { rankings } = buildIntelligenceRankings([
    { creator: 'OpenAI', slug: 'gpt-6-1-sol-xhigh', name: 'GPT-6.1 Sol (Xhigh)', score: 54.6 },
    { creator: 'OpenAI', slug: 'gpt-6-1-sol', score: 50 },
    { creator: 'Anthropic', slug: 'claude-opus-4-7', score: 54.6 },
    { creator: 'Anthropic', slug: 'gpt-6-1-sol', score: 99 },
    { creator: 'OpenAI', slug: 'gpt-6-1-sol', score: null },
  ], catalog, options);
  assert.deepEqual(rankings.tasks.intelligence.models.map(m => [m.score, m.rank]), [[54.6, 1], [54.6, 1]]);
  assert.equal(rankings.sources['aa-intelligence'].version, '5.0');
  assert.equal(rankings.tasks.intelligence.scoreKind, 'raw');
});
test('missing scores never become zero; a real zero is retained', () => {
  assert.throws(() => buildIntelligenceRankings([{ creator: 'OpenAI', slug: 'gpt-6-1-sol', score: null }], catalog, options), /没有对上/);
  const { rankings } = buildIntelligenceRankings([{ creator: 'OpenAI', slug: 'gpt-6-1-sol', score: 0 }], catalog, options);
  assert.equal(rankings.tasks.intelligence.models[0].score, 0);
});
test('official API reads every page with authentication and retains index version', async () => {
  const calls = [];
  const loaded = await loadOfficial(async (url, headers) => {
    calls.push({ url, headers });
    return { intelligence_index_version: '5.0', pagination: { has_more: calls.length === 1 }, data: [{ slug: `m${calls.length}`, model_creator: { name: 'OpenAI' }, evaluations: { artificial_analysis_intelligence_index: 54.6 } }] };
  }, 'test-key');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('?page=2'));
  assert.equal(calls[0].headers['x-api-key'], 'test-key');
  assert.equal(loaded.records.length, 2);
  assert.equal(loaded.version, '5.0');
});
test('official pagination rejects a version change rather than mixing scores', async () => {
  let calls = 0;
  await assert.rejects(loadOfficial(async () => ({ data: [], intelligence_index_version: ++calls, pagination: { has_more: true } }), 'test-key'), /版本发生变化/);
});
test('OpenRouter uses intelligence rather than retired coding index and excludes routing variants', async () => {
  const loaded = await loadOpenRouter(async () => ({ data: [
    { id: 'openai/gpt-6.1-sol', benchmarks: { artificial_analysis: { intelligence_index: 54.6, coding_index: 99 } } },
    { id: 'openai/gpt-6.1-sol:batch', benchmarks: { artificial_analysis: { intelligence_index: 100 } } },
  ] }));
  assert.equal(loaded.records.length, 1);
  assert.equal(loaded.records[0].score, 54.6);
  assert.equal(loaded.channel, 'openrouter');
  assert.equal(loaded.version, null);
});
