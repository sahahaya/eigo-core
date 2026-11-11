/* quiz.js — 問題1問を描画して答え合わせする
 * 対応タイプ: choice(4択) / fill(穴埋め・選択肢タップ) / order(並べ替え・単語タップ)
 * リスニング・読解用の追加フィールド（choice / fill で使える）:
 *   audio        : 英文1つ、または配列。配列で "M: " "W: " で始まる行は声の高さを変えて読む（会話）
 *   audioChoices : true なら選択肢を画面に出さず (A)(B)(C) の音声で出す（答えたあとに文字で表示）
 *   autoplay     : false なら自動再生しない（Part 3・4 で「先に設問を読む」練習のため）
 *   scene        : 写真の代わりの説明文（Part 1）
 *   passage      : 問題の上に表示する長文（Part 6・7）
 * 答えたあと、audio / audioChoices の英文は「スクリプト」として開いて読める
 */
const Quiz = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const normalize = s => String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

  /* 2文の単語一致率 0..1 */
  function similarity(a, b) {
    const A = normalize(a).split(' ').filter(Boolean), B = normalize(b).split(' ').filter(Boolean);
    if (!A.length || !B.length) return 0;
    const bag = {}; B.forEach(w => bag[w] = (bag[w] || 0) + 1);
    let hit = 0; A.forEach(w => { if (bag[w]) { hit++; bag[w]--; } });
    return hit / Math.max(A.length, B.length);
  }

  /* 発話・英作文の正誤判定。accept に別解を入れられる */
  function matches(said, item) {
    const cands = [item.en].concat(item.accept || []);
    const n = normalize(said);
    if (!n) return { ok: false, score: 0 };
    let best = 0;
    for (const c of cands) {
      if (normalize(c) === n) return { ok: true, score: 1 };
      best = Math.max(best, similarity(n, c));
    }
    return { ok: best >= 0.8, score: best };
  }

  /* 問題を container に描画。答えたら onAnswer({correct, chosen}) を呼ぶ */
  function render(container, item, onAnswer) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    container.appendChild(wrap);

    // 選択肢の並び（音声で読み上げる順と画面の (A)(B)… をそろえるため、先に決める）
    let opts = null;
    if (item.choices) {
      opts = item.keepOrder ? item.choices.slice() : shuffle(item.choices);
      if (opts.includes('わからない')) opts = opts.filter(c => c !== 'わからない').concat(['わからない']);
    }
    const LABELS = 'ABCD';
    // 音声で選択肢を出すのは、音声合成が使えるときだけ（使えなければ文字で出す）
    const audioChoices = !!(item.audioChoices && opts && Speech.canSpeak);
    const audioLines = [].concat(item.audio || []);
    const choiceLines = audioChoices ? opts.map((c, i) => `${LABELS[i]}. ${c}`) : [];
    const playLines = audioLines.concat(choiceLines);

    const head = document.createElement('div');
    head.className = 'row between';
    head.innerHTML = `<span class="tag">${esc(item.tag || '')}</span>`;
    if (playLines.length && Speech.canSpeak) {
      const b = document.createElement('button'); b.className = 'play'; b.textContent = '▶'; b.title = '音声を聞く';
      b.onclick = () => Speech.speakSeq(playLines);
      head.appendChild(b);
      if (item.autoplay !== false) setTimeout(() => Speech.speakSeq(playLines), 300);
    }
    wrap.appendChild(head);

    // 写真の説明（Part 1）と長文（Part 6・7）
    if (item.scene) {
      const s = document.createElement('div'); s.className = 'scene';
      s.innerHTML = `<span class="lab">📷 写真（説明）</span>${esc(item.scene)}`;
      wrap.appendChild(s);
    }
    if (item.passage) {
      const p = document.createElement('div'); p.className = 'passage'; p.textContent = item.passage;
      wrap.appendChild(p);
    }
    // 音声が使えないブラウザでは、聞く問題のスクリプトを先に見せる
    if (audioLines.length && !Speech.canSpeak) {
      const s = document.createElement('div'); s.className = 'passage';
      s.textContent = '（このブラウザは音声に対応していないため、英文を表示しています）\n' + audioLines.join('\n');
      wrap.appendChild(s);
    }

    const q = document.createElement('div');
    q.className = 'quiz-q';
    wrap.appendChild(q);

    const fb = document.createElement('div');
    let answered = false;

    function finish(correct, detail) {
      if (answered) return; answered = true;
      fb.className = 'feedback ' + (correct ? 'ok' : 'ng');
      let script = '';
      if (audioLines.length || audioChoices) {
        const lines = audioLines.concat(audioChoices ? opts.map((c, i) => `(${LABELS[i]}) ${c}`) : []);
        script = `<details class="script mt"><summary>スクリプト（読み上げた英文）</summary>${lines.map(esc).join('<br>')}</details>`;
      }
      fb.innerHTML = `<b>${correct ? '正解！' : 'おしい'}</b> ${detail ? esc(detail) : ''}` +
        (item.why ? `<div class="why">${md(item.why)}</div>` : '') + script;
      wrap.appendChild(fb);
      onAnswer({ correct });
    }

    if (item.type === 'choice' || item.type === 'fill') {
      if (item.type === 'fill') {
        q.innerHTML = esc(item.q).replace(/___/g, '<span class="blank">　</span>');
      } else {
        q.textContent = item.q;
      }
      if (item.ja) { const j = document.createElement('div'); j.className = 'muted'; j.textContent = item.ja; wrap.appendChild(j); }
      const choices = document.createElement('div'); choices.className = 'choices';
      const answerText = typeof item.answer === 'number' ? item.choices[item.answer] : item.answer;
      const answerLabel = audioChoices ? `(${LABELS[opts.indexOf(answerText)]}) ` : '';
      opts.forEach((c, i) => {
        const b = document.createElement('button'); b.className = 'btn';
        b.dataset.value = c;
        b.textContent = audioChoices ? `(${LABELS[i]})` : c;
        b.onclick = () => {
          if (answered) return;
          const ok = c === answerText;
          b.classList.add(ok ? 'correct' : 'wrong');
          choices.querySelectorAll('button').forEach((x, k) => {
            x.disabled = true;
            if (audioChoices) x.textContent = `(${LABELS[k]}) ${x.dataset.value}`;
            if (x.dataset.value === answerText) x.classList.add('correct');
          });
          if (item.type === 'fill') q.innerHTML = esc(item.q).replace(/___/g, `<span class="blank">${esc(answerText)}</span>`);
          finish(ok, ok ? '' : `正解は「${answerLabel}${answerText}」`);
        };
        choices.appendChild(b);
      });
      wrap.appendChild(choices);
      return;
    }

    if (item.type === 'order') {
      q.textContent = item.ja ? `「${item.ja}」を英語にしよう` : '正しい順に並べよう';
      const hint = document.createElement('div'); hint.className = 'muted small'; hint.textContent = '単語をタップして並べる。もう一度タップで戻す。';
      wrap.appendChild(hint);
      const line = document.createElement('div'); line.className = 'answerline';
      const bank = document.createElement('div'); bank.className = 'wordbank';
      const words = shuffle(item.words.concat(item.extra || []));
      const picked = [];
      function draw() {
        line.innerHTML = ''; bank.innerHTML = '';
        picked.forEach((w, i) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = w; b.onclick = () => { if (answered) return; picked.splice(i, 1); draw(); }; line.appendChild(b); });
        const used = {};
        picked.forEach(w => used[w] = (used[w] || 0) + 1);
        const seen = {};
        words.forEach(w => {
          seen[w] = (seen[w] || 0) + 1;
          if (seen[w] <= (used[w] || 0)) return;
          const b = document.createElement('button'); b.className = 'btn'; b.textContent = w; b.onclick = () => { if (answered) return; picked.push(w); draw(); }; bank.appendChild(b);
        });
        check.disabled = picked.length === 0;
      }
      const check = document.createElement('button'); check.className = 'btn primary block mt'; check.textContent = '答え合わせ';
      check.onclick = () => {
        const got = picked.join(' ');
        const okList = [item.answer].concat(item.accept || []);
        const ok = okList.some(a => normalize(a) === normalize(got));
        finish(ok, ok ? '' : `正解は「${item.answer}」`);
        check.disabled = true;
      };
      wrap.appendChild(line); wrap.appendChild(bank); wrap.appendChild(check);
      draw();
      return;
    }

    q.textContent = '（未対応の問題タイプ: ' + item.type + '）';
  }

  /* 簡単なマークアップ: **太字**、`コード`、空行で段落、"- " で箇条書き、[A|B] は左右比較 */
  function md(text) {
    if (!text) return '';
    const blocks = String(text).split(/\n\s*\n/);
    return blocks.map(b => {
      const lines = b.split('\n');
      if (lines.every(l => /^\s*-\s/.test(l))) {
        return '<ul>' + lines.map(l => '<li>' + inline(l.replace(/^\s*-\s/, '')) + '</li>').join('') + '</ul>';
      }
      if (/^>\s/.test(lines[0])) return '<div class="point">' + lines.map(l => inline(l.replace(/^>\s?/, ''))).join('<br>') + '</div>';
      if (/^\[\[/.test(lines[0])) {
        // [[日本語の発想|英語の発想]] 形式: 1行目に見出し、2行目以降 "L: 文" "R: 文"
        const m = lines[0].match(/^\[\[(.*?)\|(.*?)\]\]/);
        const L = lines.filter(l => /^L:/.test(l)).map(l => inline(l.slice(2).trim())).join('<br>');
        const R = lines.filter(l => /^R:/.test(l)).map(l => inline(l.slice(2).trim())).join('<br>');
        return `<div class="compare"><div><span class="lab">${esc(m[1])}</span>${L}</div><div><span class="lab">${esc(m[2])}</span>${R}</div></div>`;
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
    function inline(s) {
      return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    }
  }

  return { render, shuffle, normalize, similarity, matches, md, esc };
})();
