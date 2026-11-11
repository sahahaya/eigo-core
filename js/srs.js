/* srs.js — 間隔反復（SM-2 を簡略化したもの）
 * grade: 0=もう一度 1=むずかしい 2=できた 3=かんたん
 */
const SRS = (() => {
  const DAY = 24 * 60 * 60 * 1000;

  function newCard(unitId) {
    return { ease: 2.5, interval: 0, due: Date.now(), reps: 0, lapses: 0, unitId };
  }

  function rate(card, grade) {
    const c = Object.assign({}, card);
    const now = Date.now();
    if (grade === 0) {
      c.reps = 0; c.lapses = (c.lapses || 0) + 1;
      c.ease = Math.max(1.3, c.ease - 0.2);
      c.interval = 0;
      c.due = now + 10 * 60 * 1000;      // 10分後にもう一度
      return c;
    }
    if (grade === 1) {
      c.ease = Math.max(1.3, c.ease - 0.15);
      c.interval = Math.max(1, Math.round((c.interval || 1) * 1.2));
    } else if (grade === 2) {
      if (c.reps === 0) c.interval = 1;
      else if (c.reps === 1) c.interval = 3;
      else c.interval = Math.round(c.interval * c.ease);
    } else {
      c.ease = c.ease + 0.1;
      if (c.reps === 0) c.interval = 3;
      else c.interval = Math.round(Math.max(c.interval, 1) * c.ease * 1.3);
    }
    c.reps = (c.reps || 0) + 1;
    c.due = now + c.interval * DAY;
    return c;
  }

  function isDue(card, now = Date.now()) { return !card.due || card.due <= now; }

  function describe(card) {
    if (!card.reps) return '新しい';
    if (card.interval >= 21) return '定着';
    if (card.interval >= 7) return '順調';
    return '学習中';
  }

  return { newCard, rate, isDue, describe };
})();
