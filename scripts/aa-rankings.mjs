// AA 综合智能榜：保留原始分数，只匹配同厂商的明确型号。
const VENDORS = {
  openai: 'openai', anthropic: 'anthropic', google: 'google',
  'google deepmind': 'google', deepseek: 'deepseek', 'z ai': 'zhipuai',
  'z-ai': 'zhipuai', zai: 'zhipuai', zhipuai: 'zhipuai',
  qwen: 'alibaba', alibaba: 'alibaba', 'x-ai': 'xai', xai: 'xai',
  'meta-llama': 'meta', meta: 'meta',
  mistralai: 'mistral', 'mistral ai': 'mistral', mistral: 'mistral',
  moonshot: 'moonshotai', 'moonshot ai': 'moonshotai', moonshotai: 'moonshotai',
  kimi: 'moonshotai', spacexai: 'xai',
  minimax: 'minimax', cohere: 'cohere', nvidia: 'nvidia',
};
const slug = (value) => String(value ?? '').toLowerCase().replace(/[.\s_]+/g, '-');
const vendor = (value) => VENDORS[String(value ?? '').toLowerCase()] ?? String(value ?? '').toLowerCase();

export function buildIntelligenceRankings(records, catalog, { channel, fetchedAt, version = null }) {
  const index = new Map();
  for (const model of catalog.filter((m) => m.category === 'chat')) {
    const [creator, name] = model.id.split('/');
    const key = `${vendor(creator)}/${slug(name)}`;
    const hits = index.get(key) ?? [];
    hits.push(model.id);
    index.set(key, hits);
  }
  const rows = new Map();
  const skipped = new Set();
  for (const record of records) {
    if (typeof record.score !== 'number' || !Number.isFinite(record.score)) continue;
    const modelSlug = slug(record.slug);
    // 只去除已知评测力度后缀；先精确匹配，避免把产品型号合并。
    const baseSlug = modelSlug.replace(/-(?:xhigh|high|medium|low|non-reasoning)$/, '');
    const prefix = vendor(record.creator);
    const hits = index.get(`${prefix}/${modelSlug}`) ?? index.get(`${prefix}/${baseSlug}`) ?? [];
    if (hits.length !== 1) { skipped.add(`${record.creator}/${record.slug}`); continue; }
    const id = hits[0];
    if (!rows.has(id) || record.score > rows.get(id).score) {
      rows.set(id, { id, score: record.score, evidence: { 'aa-intelligence': record.score }, variant: record.name || record.slug });
    }
  }
  const models = [...rows.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
  for (let i = 0; i < models.length; i++) models[i].rank = i && models[i].score === models[i - 1].score ? models[i - 1].rank : i + 1;
  if (!models.length) throw new Error('没有对上目录的 AA 综合智能成绩，保留现有快照。');
  return {
    rankings: {
      asOf: fetchedAt.slice(0, 10), fetchedAt, featured: null,
      sources: {
        'aa-intelligence': {
          name: 'Artificial Analysis Intelligence Index',
          short: channel === 'official' ? 'AA 官方' : 'AA · OpenRouter 转发',
          url: 'https://artificialanalysis.ai/',
          dataUrl: channel === 'official' ? 'https://artificialanalysis.ai/api/v2/language/models/free' : 'https://openrouter.ai/api/v1/models',
          channel, version, asOf: fetchedAt.slice(0, 10),
        },
      },
      tasks: { intelligence: { label: '综合能力', headline: 'aa-intelligence', sources: ['aa-intelligence'], scoreKind: 'raw', models } },
    },
    skipped: [...skipped].sort(),
  };
}

export async function loadOfficial(fetchJson, key) {
  const records = [];
  let version;
  for (let page = 1; page <= 100; page++) {
    const payload = await fetchJson(`https://artificialanalysis.ai/api/v2/language/models/free?page=${page}`, { 'x-api-key': key });
    if (!Array.isArray(payload.data)) throw new Error('AA 官方响应缺少 data 数组。');
    if (page === 1) version = payload.intelligence_index_version ?? null;
    else if ((payload.intelligence_index_version ?? null) !== version) throw new Error('AA 分页期间指数版本发生变化，请重新同步。');
    for (const model of payload.data) records.push({
      creator: model.model_creator?.name, slug: model.slug, name: model.name,
      score: model.evaluations?.artificial_analysis_intelligence_index,
    });
    if (!payload.pagination?.has_more) return { records, version, channel: 'official' };
  }
  throw new Error('AA 分页超过安全上限，保留现有快照。');
}

export async function loadOpenRouter(fetchJson) {
  const payload = await fetchJson('https://openrouter.ai/api/v1/models');
  if (!Array.isArray(payload.data)) throw new Error('OpenRouter 响应缺少 data 数组。');
  return {
    channel: 'openrouter', version: null,
    records: payload.data.filter((m) => !String(m.id).includes(':')).map((m) => {
      const [creator, model] = String(m.id).split('/');
      return { creator, slug: model, name: m.name, score: m.benchmarks?.artificial_analysis?.intelligence_index };
    }),
  };
}
