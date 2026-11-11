/* data.js — 教材 JSON の読み込み（fetch）。読み込んだものはメモリにキャッシュ */
const Data = (() => {
  const cache = {};
  async function getJSON(path) {
    if (cache[path]) return cache[path];
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path} を読み込めません (${res.status})`);
    const json = await res.json();
    cache[path] = json;
    return json;
  }
  const loadIndex = () => getJSON('data/index.json');
  const loadDiagnostic = () => getJSON('data/diagnostic.json');

  async function findUnitMeta(unitId) {
    const idx = await loadIndex();
    for (const st of idx.stages) {
      const u = st.units.find(u => u.id === unitId);
      if (u) return { unit: u, stage: st };
    }
    return null;
  }
  async function loadUnit(unitId) {
    const m = await findUnitMeta(unitId);
    if (!m || !m.unit.file) throw new Error(`単元 ${unitId} はまだ準備中です`);
    const u = await getJSON('data/' + m.unit.file);
    u.id = u.id || unitId;
    return u;
  }
  async function loadVocab(stageId) {
    const idx = await loadIndex();
    const st = idx.stages.find(s => s.id === stageId);
    if (!st || !st.vocab) return { cards: [] };
    return getJSON('data/' + st.vocab);
  }
  return { loadIndex, loadDiagnostic, loadUnit, loadVocab, findUnitMeta };
})();
