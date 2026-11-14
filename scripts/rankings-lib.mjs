// 榜单打分是纯函数：页面不联网，也不在浏览器里重算权重。

export function round1(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 10) / 10;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// 每个信号在本次上榜模型里 min–max 到 0–100。缺信号的模型把权重摊到它有的信号上。
export function scoreTask(rowsBySource, weights) {
  const active = Object.keys(weights).filter((key) => {
    const rows = rowsBySource?.[key];
    return rows && Object.keys(rows).length > 0;
  });
  const norms = {};
  for (const key of active) {
    const values = Object.values(rowsBySource[key]).map(Number).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    norms[key] = (value) => (max === min ? 100 : ((value - min) / (max - min)) * 100);
  }

  const ids = new Set();
  for (const key of active) {
    for (const id of Object.keys(rowsBySource[key])) ids.add(id);
  }

  const models = [];
  for (const id of ids) {
    const evidence = {};
    const parts = [];
    let weightSum = 0;
    for (const key of active) {
      const raw = Number(rowsBySource[key][id]);
      if (!Number.isFinite(raw)) continue;
      evidence[key] = round1(raw);
      parts.push({ normalized: norms[key](raw), weight: Number(weights[key]) || 0 });
      weightSum += Number(weights[key]) || 0;
    }
    if (!parts.length || weightSum <= 0) continue;
    const score = Math.round(parts.reduce((sum, part) => sum + part.normalized * (part.weight / weightSum), 0));
    models.push({ id, score, evidence });
  }

  models.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en'));
  let rank = 0;
  for (let index = 0; index < models.length; index += 1) {
    if (index === 0 || models[index].score !== models[index - 1].score) rank = index + 1;
    models[index].rank = rank;
  }
  return { models, sources: active };
}

// 主推位只在至少两个任务里都上榜的模型中选。平均名次更好者优先，并列再看平均推荐分。
export function pickFeatured(tasks) {
  const entries = Object.entries(tasks ?? {}).filter(([, task]) => Array.isArray(task?.models) && task.models.length > 0);
  if (entries.length < 2) return null;

  const byId = new Map();
  for (const [key, task] of entries) {
    for (const model of task.models) {
      const row = byId.get(model.id) ?? { id: model.id, ranks: [], scores: [], reasons: [] };
      row.ranks.push(model.rank);
      row.scores.push(model.score);
      row.reasons.push({ key, rank: model.rank, text: `${task.label}第 ${model.rank}` });
      byId.set(model.id, row);
    }
  }

  const eligible = [...byId.values()].filter((row) => row.ranks.length >= 2);
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    const rankDelta = average(a.ranks) - average(b.ranks);
    if (rankDelta) return rankDelta;
    const scoreDelta = average(b.scores) - average(a.scores);
    if (scoreDelta) return scoreDelta;
    return a.id.localeCompare(b.id, 'en');
  });

  const best = eligible[0];
  const reasons = [...best.reasons].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key, 'en'));
  return {
    id: best.id,
    reasons: reasons.map((reason) => reason.text),
    score: Math.round(average(best.scores)),
    taskCount: best.ranks.length,
  };
}
