/* app.js — 画面の描画とルーティング（hash ベース） */
const App = (() => {
  const $view = document.getElementById('view');
  const $title = document.getElementById('pageTitle');
  const $back = document.getElementById('backBtn');
  const $streak = document.getElementById('streakBadge');
  const $toast = document.getElementById('toast');
  const esc = Quiz.esc, md = Quiz.md;
  const PASS_RATE = 0.8;
  let INDEX = null;
  let toastTimer = null;

  function h(html) { $view.innerHTML = html; window.scrollTo(0, 0); }
  function toast(msg) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $toast.hidden = true, 2200);
  }
  function setTitle(t, showBack) { $title.textContent = t; $back.hidden = !showBack; }
  function updateStreak() { const n = Store.streak(); $streak.textContent = n ? `🔥 ${n}日` : ''; }
  function setTab(name) { document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === name)); }
  const go = hash => { location.hash = hash; };
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

  /* ---------- 進捗ヘルパ ---------- */
  function stageIndex(stageId) { return INDEX.stages.findIndex(s => s.id === stageId); }
  function stageUnlocked(i) {
    const s = Store.load();
    if (i === 0) return true;
    const st = INDEX.stages[i], prev = INDEX.stages[i - 1];
    return !!(s.stages.passed[prev.id] || s.stages.unlocked[st.id]);
  }
  function unitState(id) { return Store.load().units[id] || null; }
  function readyUnits(stage) { return stage.units.filter(u => u.file); }
  function nextUnit() {
    for (let i = 0; i < INDEX.stages.length; i++) {
      for (const u of readyUnits(INDEX.stages[i])) {
        const st = unitState(u.id);
        if (!st || !st.done) return { unit: u, stage: INDEX.stages[i], locked: !stageUnlocked(i) };
      }
    }
    return null;
  }
  function dueCards() {
    const s = Store.load();
    return Object.entries(s.cards).filter(([, c]) => SRS.isDue(c)).map(([id, c]) => Object.assign({ id }, c));
  }
  function addCardsFromUnit(unit) {
    Store.update(s => {
      (unit.vocab || []).forEach(v => {
        const id = `${unit.id}:${v.en}`;
        if (!s.cards[id]) s.cards[id] = Object.assign(SRS.newCard(unit.id), { en: v.en, ja: v.ja, ex: v.ex || '' });
      });
    });
  }

  /* ---------- ルーティング ---------- */
  async function route() {
    const hash = location.hash.slice(1) || 'home';
    const [name, arg] = hash.split('/');
    Speech.stop();
    // 読み込みに時間がかかるときだけ「読み込み中」を出す（前の画面が残って見えないように）
    const loading = setTimeout(() => h('<p class="muted center mt">読み込み中…</p>'), 300);
    try {
      INDEX = INDEX || await Data.loadIndex();
      switch (name) {
        case 'home': await viewHome(); break;
        case 'course': await viewCourse(); break;
        case 'unit': await viewUnit(arg); break;
        case 'test': await viewTest(arg); break;
        case 'review': await viewReview(arg); break;
        case 'compose': await viewCompose(); break;
        case 'stats': await viewStats(); break;
        case 'settings': await viewSettings(); break;
        case 'diagnostic': await viewDiagnostic(); break;
        default: go('home');
      }
    } catch (e) {
      console.error(e);
      setTitle('エラー', true);
      h(`<div class="card"><h2>読み込みエラー</h2><p>${esc(e.message)}</p>
        <p class="muted small">ファイルを直接ダブルクリックで開くと（file://）教材JSONを読み込めません。README の手順どおり、簡易サーバーか GitHub Pages から開いてください。</p></div>`);
    } finally {
      clearTimeout(loading);
    }
    updateStreak();
  }

  /* ---------- ホーム ---------- */
  async function viewHome() {
    setTitle('英語の核心', false); setTab('home');
    const s = Store.load();
    const today = s.days[Store.todayKey()] || {};
    const due = dueCards().length;
    const nu = nextUnit();
    const started = Object.keys(s.units).length > 0;
    let html = '';
    if (!s.diagnostic) {
      html += `<div class="card hero"><h2>はじめに：診断テスト</h2>
        <p>12問・約3分。どこから始めるのがよいか提案します。中1からやり直すつもりでも、現在地を知っておくと進みが速くなります。</p>
        <div class="row"><button class="btn" onclick="location.hash='#diagnostic'">診断テストを受ける</button>
        <button class="btn ghost" onclick="App.skipDiag()">スキップして中1から</button></div></div>`;
    }
    html += `<div class="card"><h2>今日のメニュー <span class="muted small">約15分</span></h2>`;
    html += menuItem('🔁', '復習カード', due ? `${due}枚が復習どき` : (Object.keys(s.cards).length ? '今日の分は終わっています' : '単元を始めると単語カードが増えます'), '#review', today.cards > 0 && !due);
    if (nu) {
      const st = unitState(nu.unit.id);
      html += menuItem('📖', `${nu.stage.title}：${nu.unit.title}`, st ? '続きから' : `新しい単元 ・ 約${nu.unit.minutes || 12}分`, nu.locked ? '#course' : `#unit/${nu.unit.id}`, false);
    } else {
      html += menuItem('🎉', '用意された単元はすべて完了', '新しい単元が追加されるのを待ちつつ、復習と英作文を続けましょう', '#course', true);
    }
    html += menuItem('🗣', '瞬間英作文', started ? (today.speak ? `今日 ${today.speak} 文 話しました` : '学んだ文法で日本語→英語') : '単元を1つ終えると使えます', '#compose', today.speak > 0);
    html += `</div>`;

    // 進捗
    html += `<div class="card"><h2>進み具合</h2>`;
    INDEX.stages.forEach((st, i) => {
      const ready = readyUnits(st);
      const done = ready.filter(u => (unitState(u.id) || {}).done).length;
      const locked = !stageUnlocked(i);
      html += `<div class="row between mt"><span>${locked ? '🔒 ' : ''}${esc(st.group)} ${esc(st.title)}</span><span class="muted small">${done}/${ready.length}${st.units.length > ready.length ? `（全${st.units.length}単元予定）` : ''}</span></div>
        <div class="progress"><div style="width:${pct(done, ready.length || 1)}%"></div></div>`;
    });
    html += `<p class="mt mb0"><a href="#course">コース一覧を見る →</a></p></div>`;
    html += `<p class="center small"><a href="#settings">⚙ 設定・データ</a></p>`;
    h(html);
  }
  function menuItem(ico, name, sub, href, done) {
    return `<button class="menu-item ${done ? 'done' : ''}" onclick="location.hash='${href}'"><span class="ico">${ico}</span><span class="t"><span class="name">${esc(name)}</span><br><span class="sub">${esc(sub)}</span></span><span>${done ? '✓' : '›'}</span></button>`;
  }
  function skipDiag() {
    Store.update(s => { s.diagnostic = { at: Date.now(), skipped: true, recommend: 'j1' }; });
    toast('中1から始めます'); viewHome();
  }

  /* ---------- コース ---------- */
  async function viewCourse() {
    setTitle('コース', false); setTab('course');
    const s = Store.load();
    let html = `<p class="muted small">各段階の確認テストに80%以上で合格すると次が開きます。「先に進む」で自由に進めることもできます。</p>`;
    INDEX.stages.forEach((st, i) => {
      const unlocked = stageUnlocked(i);
      const passed = !!s.stages.passed[st.id];
      const ready = readyUnits(st);
      html += `<div class="stage-head"><h2>${unlocked ? '' : '🔒 '}${esc(st.group)}　${esc(st.title)}</h2>
        <span class="small">${passed ? '<span style="color:var(--ok)">✓ 合格</span>' : (ready.length && unlocked ? `<a href="#test/${st.id}">確認テスト</a>` : '')}</span></div>`;
      if (st.description) html += `<p class="muted small">${esc(st.description)}</p>`;
      html += `<div class="card">`;
      if (!unlocked) {
        html += `<p class="small muted">前の段階の確認テストに合格すると開きます。</p>
          <button class="btn sm" onclick="App.unlockStage('${st.id}')">ロックを外して先に進む</button>`;
      }
      if (!st.units.length) html += `<p class="muted small">単元は準備中です。</p>`;
      st.units.forEach((u, n) => {
        const ust = unitState(u.id) || {};
        const cls = ['unit-item', ust.done ? 'done' : '', !unlocked ? 'locked' : '', !u.file ? 'planned' : ''].join(' ');
        const click = (u.file && unlocked) ? `onclick="location.hash='#unit/${u.id}'" style="cursor:pointer"` : '';
        html += `<div class="${cls}" ${click}><span class="num">${ust.done ? '✓' : n + 1}</span>
          <span class="t"><span class="name">${esc(u.title)}</span><br><span class="sub">${esc(u.subtitle || '')}${!u.file ? '（準備中）' : (ust.quizBest != null ? ` ・ 練習 ${ust.quizBest}%` : '')}</span></span>
          <span class="muted">${u.file && unlocked ? '›' : ''}</span></div>`;
      });
      html += `</div>`;
    });
    h(html);
  }
  function unlockStage(id) {
    Store.update(s => { s.stages.unlocked[id] = true; });
    toast('ロックを外しました'); viewCourse();
  }

  /* ---------- 単元 ---------- */
  const STEP_NAMES = { question: 'つまずき', core: '核心', examples: '例文', quiz: '練習', speak: '話す' };

  async function viewUnit(unitId) {
    const unit = await Data.loadUnit(unitId);
    const meta = await Data.findUnitMeta(unitId);
    setTitle(`${meta.stage.short || meta.stage.title}：${unit.title}`, true); setTab('course');
    Store.update(s => { if (!s.units[unitId]) s.units[unitId] = { startedAt: Date.now(), step: 0 }; });
    addCardsFromUnit(unit);
    let step = Math.min(unitState(unitId).step || 0, unit.steps.length - 1);

    function stepsBar() {
      return `<div class="steps">${unit.steps.map((st, i) => `<span class="${i < step ? 'done' : i === step ? 'cur' : ''}">${STEP_NAMES[st.type] || st.type}</span>`).join('')}</div>`;
    }
    function nav(nextLabel) {
      return `<div class="row mt">${step > 0 ? `<button class="btn" onclick="App._unitStep(-1)">← 前へ</button>` : ''}<button class="btn primary grow" onclick="App._unitStep(1)">${nextLabel || '次へ →'}</button></div>`;
    }
    App._unitStep = (d) => {
      step = Math.max(0, Math.min(unit.steps.length - 1, step + d));
      Store.update(s => { s.units[unitId].step = step; });
      render();
    };

    function render() {
      Speech.stop();
      const st = unit.steps[step];
      let html = `<p class="muted small mb0">${esc(unit.subtitle || '')}</p>` + stepsBar();
      if (st.type === 'question' || st.type === 'core') {
        html += `<div class="card"><h2>${esc(st.title)}</h2><div class="lesson-body">${md(st.body)}</div>`;
        if (st.points) html += `<h3>ここだけは押さえる</h3><ul>${st.points.map(p => `<li>${md(p).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>`;
        html += `</div>` + nav(st.type === 'question' ? '核心を見る →' : '例文で確かめる →');
        h(html);
        return;
      }
      if (st.type === 'examples') {
        html += `<div class="card"><h2>${esc(st.title || '例文')}</h2>`;
        if (st.intro) html += `<div class="lesson-body">${md(st.intro)}</div>`;
        st.items.forEach((ex, i) => {
          html += `<div class="example"><div class="row"><div class="grow"><div class="en">${esc(ex.en)}</div><div class="ja">${esc(ex.ja)}</div>
            ${ex.note ? `<div class="note">${md(ex.note).replace(/^<p>|<\/p>$/g, '')}</div>` : ''}${ex.sound ? `<div class="sound">🔊 ${esc(ex.sound)}</div>` : ''}</div>
            ${Speech.canSpeak ? `<button class="play" onclick="Speech.speak(${JSON.stringify(ex.en).replace(/"/g, '&quot;')})">▶</button>` : ''}</div></div>`;
        });
        html += `</div>`;
        if (Speech.canSpeak) {
          html += `<div class="card"><h3 style="margin-top:0">シャドーイング</h3><p class="small muted">音声のすぐ後ろについて、同じリズムで声に出します。意味を考えながら3回。最初はゆっくりでOK。</p>
            <div class="row"><button class="btn" onclick="App._shadow(${JSON.stringify(st.items.map(x => x.en)).replace(/"/g, '&quot;')})">▶ 全文を続けて再生</button><button class="btn" onclick="Speech.stop()">■ 停止</button></div>
            <p class="small muted mt mb0">速さは <a href="#settings">設定</a> で変えられます（今: ${Store.load().settings.rate}）</p></div>`;
        } else {
          html += `<p class="muted small">このブラウザは音声合成に対応していないため、再生ボタンは表示していません。</p>`;
        }
        html += nav('練習問題へ →');
        h(html);
        return;
      }
      if (st.type === 'quiz') {
        runQuizSet({ items: st.items, unitId, titleHtml: `<p class="muted small mb0">${esc(unit.subtitle || '')}</p>` + stepsBar(), onDone: (score) => {
          Store.update(s => { const u = s.units[unitId]; u.quizBest = Math.max(u.quizBest || 0, score); });
          h(`<p class="muted small mb0">${esc(unit.subtitle || '')}</p>` + stepsBar() + `<div class="card center"><h2>練習おわり</h2><div class="score-ring">${score}%</div>
            <p class="muted small">${score >= 80 ? 'よくできています。' : '間違えた問題は「復習」タブで優先して出題されます。'}</p></div>` + nav('その文法で言ってみよう →'));
        }});
        return;
      }
      if (st.type === 'speak') {
        runSpeakSet({ items: st.items, headHtml: `<p class="muted small mb0">${esc(unit.subtitle || '')}</p>` + stepsBar(), intro: st.intro, onDone: () => {
          Store.update(s => { const u = s.units[unitId]; u.done = true; u.doneAt = Date.now(); u.step = 0; });
          h(`<div class="card center"><h2>🎉 単元完了</h2><p>${esc(unit.title)}を終えました。単語カードは「復習」に入っています。</p>
            <div class="row mt"><button class="btn grow" onclick="location.hash='#course'">コースへ</button><button class="btn primary grow" onclick="location.hash='#home'">ホームへ</button></div></div>`);
        }});
        return;
      }
      h(html + `<div class="card">未対応のステップ: ${esc(st.type)}</div>` + nav());
    }
    App._shadow = async (list) => {
      await Speech.speakSeq(list, { gap: 1200 });
    };
    render();
  }

  /* 問題セットを順に出す。items: 問題配列（unitId を持つものはそれを優先） */
  function runQuizSet({ items, unitId, titleHtml = '', onDone }) {
    let i = 0, correct = 0;
    const box = document.createElement('div');
    function next() {
      if (i >= items.length) { onDone(pct(correct, items.length)); return; }
      const item = items[i];
      h(titleHtml + `<div class="card"><div class="row between"><span class="muted small">${i + 1} / ${items.length}</span><span class="muted small">正解 ${correct}</span></div><div id="qbox"></div><div id="qnext"></div></div>`);
      const qbox = document.getElementById('qbox');
      Quiz.render(qbox, item, ({ correct: ok }) => {
        if (ok) correct++;
        Store.recordAnswer({ unitId: item.unitId || unitId, itemId: item.id || String(i), tag: item.tag, correct: ok });
        document.getElementById('qnext').innerHTML = `<button class="btn primary block mt" onclick="App._qnext()">${i + 1 < items.length ? '次の問題 →' : '結果を見る'}</button>`;
      });
    }
    App._qnext = () => { i++; next(); };
    next();
  }

  /* 発話練習（その文法で言ってみよう・瞬間英作文で共用） */
  function runSpeakSet({ items, headHtml = '', intro, onDone, mode = 'speak' }) {
    let i = 0;
    let said = 0;
    function show() {
      if (i >= items.length) { onDone(said); return; }
      const it = items[i];
      let html = headHtml + `<div class="card">
        ${i === 0 && intro ? `<div class="lesson-body">${md(intro)}</div>` : ''}
        <div class="row between"><span class="muted small">${i + 1} / ${items.length}</span>${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}</div>
        <div class="quiz-q">${esc(it.ja)}</div>
        ${it.hint ? `<p class="muted small">ヒント: ${esc(it.hint)}</p>` : ''}
        <div id="speakArea"></div>
        <div class="row mt">
          ${Speech.canListen ? `<button class="mic" id="micBtn" title="話す">🎤</button>` : ''}
          <div class="grow"><input class="textin" id="typeIn" placeholder="${Speech.canListen ? '話すか、ここに入力' : 'ここに英語を入力'}" autocomplete="off" autocapitalize="sentences"></div>
        </div>
        <div class="row mt"><button class="btn grow" id="checkBtn">答え合わせ</button><button class="btn" id="revealBtn">答えを見る</button></div>
        <div id="result"></div></div>`;
      h(html);
      const result = document.getElementById('result');
      const typeIn = document.getElementById('typeIn');
      const mic = document.getElementById('micBtn');
      if (!Speech.canListen) {
        const n = document.createElement('p'); n.className = 'muted small'; n.textContent = 'このブラウザは音声認識に対応していないため、入力で練習します。';
        document.getElementById('speakArea').appendChild(n);
      }
      function reveal(heard, verdict) {
        let html = '';
        if (heard != null) html += `<div class="heard">${heard ? '聞き取り: ' + esc(heard) : '聞き取れませんでした'}</div>`;
        if (verdict) html += `<div class="feedback ${verdict.ok ? 'ok' : 'ng'}"><b>${verdict.ok ? '言えました！' : 'もう少し'}</b> ${verdict.ok ? '' : `（単語の一致 ${Math.round(verdict.score * 100)}%）`}</div>`;
        html += `<div class="example mt"><div class="row"><div class="grow"><div class="en">${esc(it.en)}</div>${it.accept && it.accept.length ? `<div class="ja">別の言い方: ${esc(it.accept.join(' / '))}</div>` : ''}${it.note ? `<div class="note">${md(it.note).replace(/^<p>|<\/p>$/g, '')}</div>` : ''}</div>
          ${Speech.canSpeak ? `<button class="play" onclick="Speech.speak(${JSON.stringify(it.en).replace(/"/g, '&quot;')})">▶</button>` : ''}</div></div>
          <p class="small muted">お手本を聞いて、もう一度声に出してから次へ。</p>
          <div class="row"><button class="btn ok grow" onclick="App._spNext(true)">言えた ✓</button><button class="btn grow" onclick="App._spNext(false)">まだあやしい</button></div>`;
        result.innerHTML = html;
        if (Speech.canSpeak) Speech.speak(it.en);
        document.getElementById('checkBtn').disabled = true; document.getElementById('revealBtn').disabled = true; if (mic) mic.disabled = true;
      }
      document.getElementById('checkBtn').onclick = () => { const v = typeIn.value.trim(); if (!v) return reveal(null, null); reveal(v, Quiz.matches(v, it)); };
      document.getElementById('revealBtn').onclick = () => reveal(null, null);
      typeIn.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('checkBtn').click(); });
      if (mic) mic.onclick = async () => {
        mic.classList.add('listening'); mic.textContent = '…';
        const heard = await Speech.listen({ timeout: 7000 });
        mic.classList.remove('listening'); mic.textContent = '🎤';
        // 候補が複数あれば一番よいものを採用
        const cands = heard.split(' | ').filter(Boolean);
        let best = { ok: false, score: 0 }, bestText = cands[0] || '';
        cands.forEach(c => { const m = Quiz.matches(c, it); if (m.score > best.score) { best = m; bestText = c; } });
        reveal(bestText, cands.length ? best : null);
      };
    }
    App._spNext = (ok) => {
      if (ok) said++;
      Store.bumpDay('speak', 1);
      if (!ok && mode === 'compose') items.push(items[i]); // あやしい文は最後にもう一度
      i++; show();
    };
    show();
  }

  /* ---------- 確認テスト ---------- */
  async function viewTest(stageId) {
    const st = INDEX.stages.find(s => s.id === stageId);
    if (!st) return go('course');
    setTitle(`${st.title} 確認テスト`, true); setTab('course');
    const units = await Promise.all(readyUnits(st).map(u => Data.loadUnit(u.id)));
    let pool = [];
    units.forEach(u => u.steps.filter(s => s.type === 'quiz').forEach(s => s.items.forEach((it, i) => pool.push(Object.assign({ unitId: u.id, id: it.id || String(i) }, it)))));
    if (!pool.length) return h('<div class="card">この段階にはまだ問題がありません。</div>');
    const n = Math.min(10, pool.length);
    h(`<div class="card"><h2>${esc(st.group)} ${esc(st.title)} 確認テスト</h2><p>${n}問。${Math.round(PASS_RATE * 100)}%以上で合格し、次の段階が開きます。解説は1問ごとに出ます。</p>
      <button class="btn primary block" id="startTest">はじめる</button></div>`);
    document.getElementById('startTest').onclick = () => {
      const items = Quiz.shuffle(pool).slice(0, n);
      runQuizSet({ items, titleHtml: `<p class="muted small mb0">確認テスト</p>`, onDone: (score) => {
        const passed = score >= PASS_RATE * 100;
        if (passed) Store.update(s => { s.stages.passed[stageId] = true; });
        h(`<div class="card center"><h2>${passed ? '🎉 合格' : 'もう一歩'}</h2><div class="score-ring">${score}%</div>
          <p>${passed ? '次の段階が開きました。' : '間違えた問題は「復習」で優先的に出ます。少し復習してからもう一度どうぞ。'}</p>
          <div class="row mt"><button class="btn grow" onclick="location.hash='#test/${stageId}'">もう一度</button><button class="btn primary grow" onclick="location.hash='#course'">コースへ</button></div></div>`);
      }});
    };
  }

  /* ---------- 復習（単語カード・間違えた問題） ---------- */
  async function viewReview(sub) {
    setTitle('復習', false); setTab('review');
    const s = Store.load();
    const due = dueCards();
    const total = Object.keys(s.cards).length;
    const mistakes = Object.values(s.mistakes);
    if (sub === 'cards') return runCards(due);
    if (sub === 'mistakes') return runMistakes(mistakes);
    if (sub === 'all') return listCards();
    const stat = { new: 0, learning: 0, good: 0, mature: 0 };
    Object.values(s.cards).forEach(c => { const d = SRS.describe(c); if (d === '新しい') stat.new++; else if (d === '学習中') stat.learning++; else if (d === '順調') stat.good++; else stat.mature++; });
    h(`<div class="card"><h2>単語・フレーズカード</h2>
        <p>復習どき: <b>${due.length}</b> 枚 <span class="muted small">/ 全${total}枚（新しい ${stat.new}・学習中 ${stat.learning}・順調 ${stat.good}・定着 ${stat.mature}）</span></p>
        <p class="muted small">思い出せた手ごたえで4段階に評価すると、次に出るタイミングが自動で決まります。「かんたん」は間隔が大きく伸び、「もう一度」は10分後にまた出ます。</p>
        <div class="row"><button class="btn primary grow" ${due.length ? '' : 'disabled'} onclick="location.hash='#review/cards'">復習をはじめる</button><button class="btn" onclick="location.hash='#review/all'">一覧</button></div>
        ${total === 0 ? '<p class="muted small mt">単元を開くと、その単元の単語がカードに追加されます。</p>' : ''}</div>
      <div class="card"><h2>間違えた問題</h2>
        <p>${mistakes.length ? `<b>${mistakes.length}</b> 問が復習待ちです。2回続けて正解すると一覧から消えます。` : '復習待ちの問題はありません。'}</p>
        <button class="btn primary block" ${mistakes.length ? '' : 'disabled'} onclick="location.hash='#review/mistakes'">解き直す</button></div>`);
  }
  function runCards(queue) {
    setTitle('単語カード', true);
    let done = 0, flipped = false;
    function show() {
      if (!queue.length) {
        h(`<div class="card center"><h2>復習おわり</h2><p>${done}枚を復習しました。</p><button class="btn primary" onclick="location.hash='#review'">戻る</button></div>`);
        return;
      }
      const c = queue[0];
      h(`<p class="muted small center mb0">残り ${queue.length} 枚 ・ ${SRS.describe(c)}</p>
        <div class="card flashcard" id="fc"><div class="front">${esc(c.en)}</div><div id="back" hidden><div class="back mt">${esc(c.ja)}</div>${c.ex ? `<div class="ex">${esc(c.ex)}</div>` : ''}</div>
          <p class="muted small mt" id="tapHint">タップして意味を見る</p></div>
        <div class="row center" style="justify-content:center">${Speech.canSpeak ? `<button class="btn sm" onclick="Speech.speak(${JSON.stringify(c.en).replace(/"/g, '&quot;')})">▶ 発音</button>` : ''}</div>
        <div class="grades mt" id="grades" hidden>
          <button class="btn ng" onclick="App._grade(0)">もう一度<small>10分後</small></button>
          <button class="btn" onclick="App._grade(1)">むずかしい<small>${ivl(c, 1)}</small></button>
          <button class="btn ok" onclick="App._grade(2)">できた<small>${ivl(c, 2)}</small></button>
          <button class="btn" onclick="App._grade(3)">かんたん<small>${ivl(c, 3)}</small></button></div>`);
      flipped = false;
      document.getElementById('fc').onclick = () => {
        if (flipped) return; flipped = true;
        document.getElementById('back').hidden = false; document.getElementById('tapHint').hidden = true; document.getElementById('grades').hidden = false;
      };
      if (Speech.canSpeak) Speech.speak(c.en);
    }
    function ivl(c, g) { const n = SRS.rate(c, g); return n.interval >= 1 ? `${n.interval}日後` : '今日'; }
    App._grade = (g) => {
      const c = queue.shift();
      const updated = SRS.rate(c, g);
      Store.update(s => { s.cards[c.id] = Object.assign({}, s.cards[c.id], updated); });
      Store.bumpDay('cards', 1);
      done++;
      if (g === 0) queue.push(Object.assign({}, c, updated));
      show();
    };
    show();
  }
  function listCards() {
    setTitle('カード一覧', true);
    const s = Store.load();
    const rows = Object.entries(s.cards).sort((a, b) => a[1].due - b[1].due);
    h(`<div class="card"><table class="simple"><tr><th>英語</th><th>意味</th><th>状態</th></tr>${rows.map(([id, c]) => `<tr><td>${esc(c.en)}</td><td>${esc(c.ja)}</td><td class="small">${SRS.describe(c)}</td></tr>`).join('')}</table>
      ${rows.length ? '' : '<p class="muted">まだカードがありません。</p>'}</div>`);
  }
  async function runMistakes(list) {
    setTitle('間違えた問題', true);
    const byUnit = {};
    list.forEach(m => (byUnit[m.unitId] = byUnit[m.unitId] || []).push(m.itemId));
    const items = [];
    for (const uid of Object.keys(byUnit)) {
      let unit; try { unit = await Data.loadUnit(uid); } catch (e) { continue; }
      unit.steps.filter(s => s.type === 'quiz').forEach(st => st.items.forEach((it, i) => {
        const id = it.id || String(i);
        if (byUnit[uid].includes(id)) items.push(Object.assign({ unitId: uid, id }, it));
      }));
    }
    if (!items.length) return h('<div class="card">解き直す問題が見つかりませんでした。<br><a href="#review">戻る</a></div>');
    runQuizSet({ items: Quiz.shuffle(items), titleHtml: `<p class="muted small mb0">間違えた問題の解き直し</p>`, onDone: (score) => {
      h(`<div class="card center"><h2>解き直しおわり</h2><div class="score-ring">${score}%</div><button class="btn primary" onclick="location.hash='#review'">戻る</button></div>`);
    }});
  }

  /* ---------- 瞬間英作文 ---------- */
  async function viewCompose() {
    setTitle('瞬間英作文', false); setTab('compose');
    const s = Store.load();
    const startedIds = Object.keys(s.units);
    if (!startedIds.length) return h('<div class="card"><h2>瞬間英作文</h2><p>単元を1つ始めると、その単元の文で練習できます。</p><a class="btn primary" href="#course">コースへ</a></div>');
    // 教材は並行して読み込み、コースの順番に並べる
    const order = {};
    INDEX.stages.forEach(st => st.units.forEach(u => { order[u.id] = Object.keys(order).length; }));
    const units = (await Promise.all(startedIds.map(id => Data.loadUnit(id).catch(() => null))))
      .filter(Boolean).sort((a, b) => (order[a.id] ?? 1e9) - (order[b.id] ?? 1e9));
    h(`<div class="card"><h2>瞬間英作文</h2>
      <p class="small">日本語を見た瞬間に英語で言う練習です。「正しく」より「速く・口に出す」を優先。つまったら答えを見て、声に出してから次へ。</p>
      <label class="small muted">範囲</label>
      <select class="textin" id="scope"><option value="all">学んだ単元すべて</option>${units.map(u => `<option value="${u.id}">${esc(u.title)}</option>`).join('')}</select>
      <label class="small muted mt" style="display:block">問題数</label>
      <select class="textin" id="count"><option value="5">5文</option><option value="10" selected>10文</option><option value="20">20文</option></select>
      <button class="btn primary block mt" id="startCompose">はじめる</button></div>`);
    document.getElementById('startCompose').onclick = () => {
      const scope = document.getElementById('scope').value, n = +document.getElementById('count').value;
      let pool = [];
      units.filter(u => scope === 'all' || u.id === scope).forEach(u => u.steps.filter(st => st.type === 'speak').forEach(st => st.items.forEach(it => pool.push(Object.assign({ tag: u.title }, it)))));
      pool = Quiz.shuffle(pool).slice(0, n);
      runSpeakSet({ items: pool, mode: 'compose', headHtml: '<p class="muted small mb0">瞬間英作文</p>', onDone: (said) => {
        h(`<div class="card center"><h2>おつかれさま</h2><p>${said} 文を言えました。</p><button class="btn primary" onclick="location.hash='#compose'">もう一度</button></div>`);
      }});
    };
  }

  /* ---------- 学習記録 ---------- */
  async function viewStats() {
    setTitle('学習記録', false); setTab('stats');
    const s = Store.load();
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ key: Store.todayKey(d), label: `${d.getMonth() + 1}/${d.getDate()}`, rec: s.days[Store.todayKey(d)] }); }
    const act = d => d.rec ? (d.rec.answered || 0) + (d.rec.cards || 0) + (d.rec.speak || 0) : 0;
    const max = Math.max(1, ...days.map(act));
    const totalA = Object.values(s.days).reduce((a, d) => a + (d.answered || 0), 0);
    const totalC = Object.values(s.days).reduce((a, d) => a + (d.correct || 0), 0);
    const activeDays = Object.keys(s.days).length;
    let unitRows = '';
    INDEX.stages.forEach(st => st.units.forEach(u => {
      const r = s.units[u.id]; if (!r || !r.attempts) return;
      unitRows += `<tr><td>${esc(st.title)} ${esc(u.title)}</td><td>${pct(r.correct, r.attempts)}%</td><td class="small muted">${r.attempts}問</td></tr>`;
    }));
    const weak = Object.entries(s.tags).filter(([, t]) => t.total >= 3).map(([k, t]) => ({ k, acc: t.correct / t.total, n: t.total })).filter(t => t.acc < 0.7).sort((a, b) => a.acc - b.acc).slice(0, 6);
    h(`<div class="card"><div class="row between"><div><div class="muted small">連続</div><div class="big">${Store.streak()}<span class="muted" style="font-size:16px">日</span></div></div>
        <div><div class="muted small">学習した日</div><div class="big">${activeDays}</div></div>
        <div><div class="muted small">正答率</div><div class="big">${pct(totalC, totalA)}<span class="muted" style="font-size:16px">%</span></div></div></div>
        <div class="bars">${days.map((d, i) => `<div class="${i === 13 ? 'today' : ''}" style="height:${Math.round(100 * act(d) / max)}%" title="${d.label}: ${act(d)}"></div>`).join('')}</div>
        <div class="bars-labels">${days.map((d, i) => `<div>${i % 3 === 1 ? d.label : ''}</div>`).join('')}</div>
        <p class="muted small mb0">直近14日の学習量（問題＋カード＋発話）</p></div>
      <div class="card"><h2>苦手な項目</h2>${weak.length ? `<ul>${weak.map(w => `<li>${esc(w.k)} <span class="muted small">正答率 ${Math.round(w.acc * 100)}%（${w.n}問）</span></li>`).join('')}</ul><p class="small muted">「復習」の解き直しで優先的に出ます。</p>` : '<p class="muted small">まだ十分なデータがありません（同じ項目を3問以上解くと表示されます）。</p>'}</div>
      <div class="card"><h2>単元ごとの正答率</h2>${unitRows ? `<table class="simple"><tr><th>単元</th><th>正答率</th><th></th></tr>${unitRows}</table>` : '<p class="muted small">まだ記録がありません。</p>'}</div>`);
  }

  /* ---------- 設定 ---------- */
  async function viewSettings() {
    setTitle('設定・データ', true); setTab('');
    const s = Store.load();
    const voices = Speech.voices();
    h(`<div class="card"><h2>音声</h2>
      <label class="small muted">読み上げの速さ: <span id="rateVal">${s.settings.rate}</span></label>
      <input type="range" id="rate" min="0.5" max="1.2" step="0.05" value="${s.settings.rate}">
      <label class="small muted">声</label>
      <select class="textin" id="voice"><option value="">自動（英語）</option>${voices.map(v => `<option value="${esc(v.name)}" ${v.name === s.settings.voice ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>
      <button class="btn mt" onclick="Speech.speak('I drink coffee every morning.')">▶ 試しに聞く</button>
      <p class="small muted mt mb0">音声合成: ${Speech.canSpeak ? '使えます' : '非対応'} ／ 音声認識: ${Speech.canListen ? '使えます' : '非対応（発話チェックは入力で代用）'}</p></div>
      <div class="card"><h2>データ</h2><p class="small muted">学習記録はこの端末のブラウザに保存されます。別の端末に移すときは書き出し→読み込みしてください。</p>
        <div class="row"><button class="btn" id="exportBtn">書き出し（JSON）</button><label class="btn">読み込み<input type="file" id="importFile" accept="application/json" hidden></label></div>
        <p class="mt"><a href="#diagnostic">診断テストをもう一度受ける</a></p>
        <button class="btn ng mt" id="resetBtn">すべての記録を消す</button></div>`);
    document.getElementById('rate').oninput = e => { const v = +e.target.value; document.getElementById('rateVal').textContent = v; Store.update(s => s.settings.rate = v); };
    document.getElementById('voice').onchange = e => Store.update(s => s.settings.voice = e.target.value);
    document.getElementById('exportBtn').onclick = () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `eigo-core-${Store.todayKey()}.json`; a.click();
    };
    document.getElementById('importFile').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => { try { Store.importJSON(r.result); toast('読み込みました'); go('home'); } catch (err) { alert('読み込めませんでした: ' + err.message); } }; r.readAsText(f);
    };
    document.getElementById('resetBtn').onclick = () => { if (confirm('学習記録をすべて消します。よろしいですか？')) { Store.reset(); toast('消しました'); go('home'); } };
  }

  /* ---------- 診断テスト ---------- */
  async function viewDiagnostic() {
    setTitle('診断テスト', true); setTab('');
    const diag = await Data.loadDiagnostic();
    h(`<div class="card"><h2>診断テスト</h2><p>${diag.items.length}問です。分からない問題は勘で選ばず「わからない」を選んでください（正確に判定するため）。</p><button class="btn primary block" id="start">はじめる</button></div>`);
    document.getElementById('start').onclick = () => {
      const items = diag.items.map((it, i) => Object.assign({ id: 'd' + i }, it, { choices: it.choices.concat(['わからない']) }));
      let i = 0; const scores = {};
      function next() {
        if (i >= items.length) return finish();
        const it = items[i];
        h(`<div class="card"><div class="muted small">${i + 1} / ${items.length}</div><div id="qbox"></div><div id="qnext"></div></div>`);
        Quiz.render(document.getElementById('qbox'), Object.assign({}, it, { why: '' }), ({ correct }) => {
          const sc = scores[it.level] || (scores[it.level] = { ok: 0, total: 0 });
          sc.total++; if (correct) sc.ok++;
          document.getElementById('qnext').innerHTML = `<button class="btn primary block mt" onclick="App._dnext()">次へ</button>`;
        });
      }
      App._dnext = () => { i++; next(); };
      function finish() {
        const order = diag.levels; // e.g. ["j1","j2","j3"]
        let recommend = order[order.length - 1] + '+';
        for (const lv of order) { const sc = scores[lv]; if (!sc || sc.ok / sc.total < 0.7) { recommend = lv; break; } }
        const names = diag.levelNames || {};
        Store.update(s => {
          s.diagnostic = { at: Date.now(), scores, recommend };
          // 推奨より前の段階は合格扱いにして開く
          for (const lv of order) { if (lv === recommend) break; s.stages.passed[lv] = true; }
        });
        const recName = names[recommend] || (recommend.endsWith('+') ? '高校英語' : recommend);
        h(`<div class="card center"><h2>結果</h2>
          <table class="simple" style="margin:10px 0">${order.map(lv => `<tr><td>${esc(names[lv] || lv)}</td><td>${scores[lv] ? `${scores[lv].ok} / ${scores[lv].total}` : '-'}</td></tr>`).join('')}</table>
          <p><b>${esc(recName)}</b>から始めるのがおすすめです。</p>
          <p class="small muted">${recommend === order[0] ? '基礎から積み上げるのが結局いちばん速い道です。1日1単元を目安に。' : 'それより前の段階は開いた状態にしました。不安な単元だけ戻って確認できます。'}</p>
          <button class="btn primary block" onclick="location.hash='#course'">コースを見る</button></div>`);
      }
      next();
    };
  }

  /* ---------- 起動 ---------- */
  $back.onclick = () => { if (history.length > 1) history.back(); else go('home'); };
  window.addEventListener('hashchange', route);
  route();

  return { skipDiag, unlockStage, toast };
})();
