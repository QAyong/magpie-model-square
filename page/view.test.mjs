import test from 'node:test';
import assert from 'node:assert/strict';
import { filterModels, formatContext, formatPrice, sortModels } from './view.js';

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
