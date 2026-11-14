import test from 'node:test';
import assert from 'node:assert/strict';
import { pickFeatured, scoreTask } from '../scripts/rankings-lib.mjs';
import {
  evidenceFootnote,
  filterModels,
  formatContext,
  formatPrice,
  formatSignal,
  headlineText,
  inputOutputPhrase,
  panelRows,
  recommendationSentence,
  sortModels,
  sourceNote,
  taskIds,
} from './view.js';

const models = [
  {
    id: 'anthropic/claude-new',
    category: 'chat',
    name: 'Claude New',
    description: 'Latest text model',
    family: 'claude',
    release_date: '2025-03-01',
    modalities: { input: ['text', 'image'], output: ['text'] },
    tool_call: true,
    reasoning: true,
    open_weights: false,
    limit: { context: 200000, output: 8192 },
  },
  {
    id: 'deepseek/deepseek-r1',
    category: 'chat',
    name: 'DeepSeek R1',
    description: 'Open reasoning model',
    family: 'deepseek',
    release_date: '2025-01-15',
    modalities: { input: ['text'], output: ['text'] },
    tool_call: false,
    reasoning: true,
    open_weights: true,
    limit: { context: 128000, output: 8192 },
  },
  {
    id: 'openai/gpt-no-date',
    category: 'chat',
    name: 'GPT No Date',
    description: 'A model with no release date',
    family: 'gpt',
    release_date: null,
    modalities: { input: ['text'], output: ['text'] },
    tool_call: true,
    reasoning: false,
    open_weights: false,
    limit: { context: 1000000, output: 16384 },
  },
  {
    id: 'openai/gpt-image-model',
    category: 'image',
    name: 'GPT Image Model',
    description: 'Image generation model',
    family: 'gpt-image',
    release_date: '2025-02-01',
    modalities: { input: ['text'], output: ['image'] },
  },
];

test('search matches model names and ids, case-insensitively', () => {
  assert.deepEqual(filterModels(models, 'claude').map((model) => model.id), ['anthropic/claude-new']);
  assert.deepEqual(filterModels(models, 'DEEPSEEK/DEEPSEEK-R1').map((model) => model.id), ['deepseek/deepseek-r1']);
});

test('category filters select only models in the requested kind', () => {
  assert.deepEqual(filterModels(models, '', 'chat').map((model) => model.id), [
    'anthropic/claude-new',
    'deepseek/deepseek-r1',
    'openai/gpt-no-date',
  ]);
  assert.deepEqual(filterModels(models, '', 'image').map((model) => model.id), ['openai/gpt-image-model']);
});

test('latest sorting uses release date descending and puts missing dates last', () => {
  assert.deepEqual(sortModels(models, 'latest').map((model) => model.id), [
    'anthropic/claude-new',
    'openai/gpt-image-model',
    'deepseek/deepseek-r1',
    'openai/gpt-no-date',
  ]);
});

test('context formatting uses compact K and M labels', () => {
  assert.equal(formatContext(128000), '128K');
  assert.equal(formatContext(1000000), '1.0M');
});

test('price formatting shows input and output per million tokens', () => {
  assert.equal(formatPrice({ input: 4, output: 20 }), '$4 / $20');
  assert.equal(formatPrice({ input: 0.15, output: 0.6 }), '$0.15 / $0.6');
  assert.equal(formatPrice(null), '未标价');
});

test('price formatting converts to yuan at the mid rate', () => {
  assert.equal(formatPrice({ input: 4, output: 20 }, 'cny'), '¥26.86 / ¥134.30');
  assert.equal(formatPrice({ input: 0.15, output: 0.6 }, 'cny'), '¥1.01 / ¥4.03');
  assert.equal(formatPrice({ input: 0, output: 0 }, 'cny'), '未标价');
  assert.equal(formatPrice(null, 'cny'), '未标价');
});

const rankings = {
  asOf: '2026-11-14',
  sources: {
    'swe-bench': { name: 'SWE-bench Verified', short: 'SWE-bench' },
    aider: { name: 'Aider polyglot', short: 'Aider' },
  },
  tasks: {
    coding: {
      label: '编程',
      headline: 'swe-bench',
      sources: ['swe-bench', 'aider'],
      models: [
        { id: 'deepseek/deepseek-r1', score: 92, rank: 1, evidence: { 'swe-bench': 74.5, aider: 55.1 } },
        { id: 'anthropic/claude-new', score: 90, rank: 2, evidence: { 'swe-bench': 71 } },
        { id: 'openai/gpt-no-date', score: 70, rank: 3, evidence: { aider: 40 } },
      ],
    },
  },
};

test('task ids match only models on that board', () => {
  assert.deepEqual(taskIds(rankings, 'coding'), [
    'deepseek/deepseek-r1',
    'anthropic/claude-new',
    'openai/gpt-no-date',
  ]);
  assert.deepEqual(taskIds(rankings, 'writing'), []);
});

test('task filter keeps search and lab on top of the board', () => {
  const ids = new Set(taskIds(rankings, 'coding'));
  assert.deepEqual(filterModels(models, 'claude', 'chat', 'all', ids).map((model) => model.id), ['anthropic/claude-new']);
  assert.deepEqual(filterModels(models, '', 'image', 'all', ids).map((model) => model.id), []);
});

test('task sorting puts higher recommendation scores first and unranked models last', () => {
  const scores = new Map([
    ['deepseek/deepseek-r1', 92],
    ['anthropic/claude-new', 90],
  ]);
  assert.deepEqual(sortModels(models, 'task', scores).map((model) => model.id), [
    'deepseek/deepseek-r1',
    'anthropic/claude-new',
    'openai/gpt-image-model',
    'openai/gpt-no-date',
  ]);
});

test('recommendation copy joins rank phrases and the price sentence', () => {
  assert.equal(
    recommendationSentence(['编程第 1', '写作第 3'], inputOutputPhrase({ input: 4, output: 20 }, 'cny')),
    '编程第 1 · 写作第 3；输入 ¥26.86 / 输出 ¥134.30。',
  );
  assert.equal(recommendationSentence(['编程第 1'], ''), '编程第 1。');
  assert.equal(inputOutputPhrase(null, 'cny'), '');
});

test('panel rows keep five models and hide the full-list link at five or fewer', () => {
  const five = panelRows(rankings.tasks.coding.models, 5);
  assert.equal(five.showAll, false);
  assert.equal(five.rows.length, 3);
  const more = panelRows([...rankings.tasks.coding.models, { id: 'a' }, { id: 'b' }, { id: 'c' }], 5);
  assert.equal(more.showAll, true);
  assert.equal(more.total, 6);
  assert.equal(more.rows.length, 5);
});

test('headline and source note use the board signal, not a bare score', () => {
  const task = rankings.tasks.coding;
  assert.equal(headlineText(task.models[0], task), 'SWE 74.5%');
  assert.equal(formatSignal('aider', 55.1, 'detail'), '55.1%（正确率）');
  assert.equal(formatSignal('lmarena', 1520, 'panel'), 'Elo 1520');
  assert.equal(sourceNote(task.sources, rankings.sources), 'SWE-bench 等');
  assert.equal(evidenceFootnote(rankings.asOf), '推荐分为榜内相对分，非绝对能力 · 截至 2026-11-14');
});

test('scores renormalize missing signals and ties share a rank', () => {
  const scored = scoreTask({
    'swe-bench': { a: 80, b: 40, c: 60 },
    aider: { a: 40, b: 80 },
  }, { 'swe-bench': 0.4, aider: 0.3 });
  assert.deepEqual(scored.models.map((model) => [model.id, model.score, model.rank]), [
    ['a', 57, 1],
    ['c', 50, 2],
    ['b', 43, 3],
  ]);
  const tied = scoreTask({ 'swe-bench': { a: 10, b: 10 } }, { 'swe-bench': 1 });
  assert.deepEqual(tied.models.map((model) => model.rank), [1, 1]);
});

test('featured pick needs two tasks and breaks ties by average score', () => {
  assert.equal(pickFeatured({ coding: { label: '编程', models: [{ id: 'a', score: 90, rank: 1 }] } }), null);
  const featured = pickFeatured({
    coding: {
      label: '编程',
      models: [
        { id: 'a', score: 80, rank: 1 },
        { id: 'b', score: 70, rank: 2 },
      ],
    },
    writing: {
      label: '写作',
      models: [
        { id: 'b', score: 90, rank: 1 },
        { id: 'a', score: 60, rank: 2 },
      ],
    },
  });
  assert.equal(featured.id, 'b');
  assert.equal(featured.score, 80);
  assert.deepEqual(featured.reasons, ['写作第 1', '编程第 2']);
  assert.equal(featured.taskCount, 2);
});
