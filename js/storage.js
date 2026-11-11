/* storage.js — localStorage に学習データを保存する */
const Store = (() => {
  const KEY = 'eigo-core-v1';

  const defaults = () => ({
    version: 1,
    profile: { createdAt: Date.now(), recommendedStage: null },
    diagnostic: null,          // { at, scores: {j1: {ok,total}, ...}, recommend }
    units: {},                 // unitId -> { startedAt, step, quizBest, done, doneAt, attempts, correct }
    stages: { passed: {}, unlocked: {} }, // stageId -> true
    cards: {},                 // cardId -> { ease, interval, due, reps, lapses, unitId }
    mistakes: {},              // itemKey -> { unitId, itemId, count, streak, lastAt }
    tags: {},                  // tag -> { total, correct }
    days: {},                  // 'YYYY-MM-DD' -> { answered, correct, cards, speak }
    settings: { rate: 0.9, voice: '', showJa: true }
  });

  let state = null;

  function load() {
    if (state) return state;
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) {
      console.warn('storage load failed', e);
      state = defaults();
    }
    return state;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('storage save failed', e); }
  }

  function update(fn) { fn(load()); save(); return state; }

  function todayKey(d = new Date()) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function bumpDay(field, n = 1, correct = 0) {
    update(s => {
      const k = todayKey();
      const d = s.days[k] || (s.days[k] = { answered: 0, correct: 0, cards: 0, speak: 0 });
      d[field] = (d[field] || 0) + n;
      if (field === 'answered') d.correct += correct;
    });
  }

  /* 問題に答えたときの記録 */
  function recordAnswer({ unitId, itemId, tag, correct }) {
    update(s => {
      if (unitId) {
        const u = s.units[unitId] || (s.units[unitId] = { startedAt: Date.now() });
        u.attempts = (u.attempts || 0) + 1;
        u.correct = (u.correct || 0) + (correct ? 1 : 0);
      }
      if (tag) {
        const t = s.tags[tag] || (s.tags[tag] = { total: 0, correct: 0 });
        t.total++; if (correct) t.correct++;
      }
      if (unitId && itemId) {
        const key = `${unitId}:${itemId}`;
        if (!correct) {
          const m = s.mistakes[key] || (s.mistakes[key] = { unitId, itemId, count: 0, streak: 0 });
          m.count++; m.streak = 0; m.lastAt = Date.now();
        } else if (s.mistakes[key]) {
          s.mistakes[key].streak++;
          if (s.mistakes[key].streak >= 2) delete s.mistakes[key];
        }
      }
    });
    bumpDay('answered', 1, correct ? 1 : 0);
  }

  /* 連続学習日数 */
  function streak() {
    const s = load();
    let n = 0;
    const d = new Date();
    // 今日まだ学習していなければ昨日から数える
    if (!s.days[todayKey(d)]) d.setDate(d.getDate() - 1);
    while (s.days[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function exportJSON() { return JSON.stringify(load(), null, 2); }
  function importJSON(text) {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== 'object' || !obj.units) throw new Error('形式が違います');
    state = Object.assign(defaults(), obj);
    save();
  }
  function reset() { state = defaults(); save(); }

  return { load, save, update, todayKey, bumpDay, recordAnswer, streak, exportJSON, importJSON, reset };
})();
