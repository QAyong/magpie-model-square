import { buildIntelligenceRankings } from './aa-rankings.mjs';

// OpenRouter 转发 Design Arena 的 Website (HTML, Non-Agentic) Elo。
// 仅取 models/website，不混用 Agent、游戏、3D 或总体设计分。
export async function loadFrontend(fetchJson, catalog, fetchedAt) {
  const payload = await fetchJson('https://openrouter.ai/api/v1/models');
  if (!Array.isArray(payload.data)) throw new Error('前端榜响应缺少 data 数组。');
  const records = [];
  for (const model of payload.data) {
    if (String(model.id).includes(':')) continue;
    const result = model.benchmarks?.design_arena?.find((r) => r.arena === 'models' && r.category === 'website');
    if (typeof result?.elo !== 'number' || !Number.isFinite(result.elo)) continue;
    const [creator, slug] = model.id.split('/');
    records.push({ creator, slug, name: model.name, score: result.elo });
  }
  const { rankings, skipped } = buildIntelligenceRankings(records, catalog, { channel: 'openrouter', fetchedAt });
  const models = rankings.tasks.intelligence.models.map((row) => ({ ...row, evidence: { 'design-arena-website': row.score } }));
  return {
    task: { label: '前端 / 网页', headline: 'design-arena-website', sources: ['design-arena-website'], scoreKind: 'elo', models },
    source: {
      name: 'Design Arena · Website (HTML, Non-Agentic)', short: 'Design Arena',
      url: 'https://www.designarena.ai/leaderboard/code',
      dataUrl: 'https://openrouter.ai/api/v1/models', channel: 'openrouter',
      asOf: fetchedAt.slice(0, 10), fetchedAt, evaluatedAt: null,
    },
    skipped,
  };
}
