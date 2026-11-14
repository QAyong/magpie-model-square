import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontend } from './frontend-rankings.mjs';
const catalog = [{ id: 'openai/gpt-6.1-sol', category: 'chat' }, { id: 'google/gemini-4-carbon', category: 'chat' }];
test('frontend uses only model website Elo, preserves raw scores and maps catalog IDs', async () => {
  const loaded = await loadFrontend(async () => ({ data: [
    { id: 'openai/gpt-6.1-sol', name: 'GPT', benchmarks: { design_arena: [
      { arena: 'agents', category: 'website', elo: 9999 },
      { arena: 'models', category: 'gamedev', elo: 8888 },
      { arena: 'models', category: 'website', elo: 1315 },
    ] } },
    { id: 'google/gemini-4-carbon', benchmarks: { design_arena: [{ arena: 'models', category: 'website', elo: 1319 }] } },
    { id: 'openai/gpt-6.1-sol:batch', benchmarks: { design_arena: [{ arena: 'models', category: 'website', elo: 9999 }] } },
  ] }), catalog, '2026-11-14T00:00:00Z');
  assert.equal(loaded.task.models.length, 2);
  assert.equal(loaded.task.models[0].id, 'google/gemini-4-carbon');
  assert.equal(loaded.task.models[1].score, 1315);
  assert.deepEqual(loaded.task.models[1].evidence, { 'design-arena-website': 1315 });
  assert.equal(loaded.source.evaluatedAt, null);
  assert.equal(loaded.task.scoreKind, 'elo');
});
test('missing website evaluations fail instead of replacing snapshot with an empty board', async () => {
  await assert.rejects(loadFrontend(async () => ({ data: [] }), catalog, '2026-11-14'), /没有对上/);
});
