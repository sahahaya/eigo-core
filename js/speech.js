/* speech.js — ブラウザ標準の Web Speech API だけを使う
 * 音声合成: speechSynthesis（ほぼ全ブラウザ）
 * 音声認識: SpeechRecognition（Chrome / Edge / Safari など。非対応なら canListen=false）
 */
const Speech = (() => {
  const synth = window.speechSynthesis || null;
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const canSpeak = !!synth;
  const canListen = !!Rec;
  let voicesCache = [];
  let currentRec = null;

  function loadVoices() {
    if (!synth) return [];
    voicesCache = synth.getVoices().filter(v => /^en([-_]|$)/i.test(v.lang));
    return voicesCache;
  }
  if (synth) {
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') synth.onvoiceschanged = loadVoices;
  }

  function pickVoice(second) {
    const want = (Store.load().settings.voice || '');
    const list = voicesCache.length ? voicesCache : loadVoices();
    let main = null;
    if (want) main = list.find(v => v.name === want) || null;
    // 英語(米)を優先、なければ英語なら何でも
    main = main || list.find(v => /en-US/i.test(v.lang)) || list[0] || null;
    if (!second) return main;
    // 会話の2人目：ほかの英語の声があればそれを使う（なければ同じ声で高さだけ変える）
    return list.find(v => v !== main && /en-US/i.test(v.lang)) || list.find(v => v !== main) || main;
  }

  function speakOne(text, opts = {}) {
    return new Promise(resolve => {
      if (!synth) return resolve(false);
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = opts.rate != null ? opts.rate : (Store.load().settings.rate || 0.9);
      if (opts.pitch != null) u.pitch = opts.pitch;
      const v = pickVoice(opts.second); if (v) u.voice = v;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
    });
  }

  // 連続読み上げの「番号」。新しい読み上げや停止のたびに増やし、古い連続読み上げを止める
  let seqToken = 0;

  function speak(text, opts = {}) { seqToken++; return speakOne(text, opts); }

  /* 複数の行を順に読み上げる。"M: " "W: " で始まる行は話し手ごとに声（高さ）を変える */
  async function speakSeq(lines, opts = {}) {
    const my = ++seqToken;
    for (const raw of [].concat(lines)) {
      if (my !== seqToken) return false;
      const s = String(raw);
      const m = s.match(/^\s*(M|W):\s*/);
      const o = Object.assign({}, opts);
      if (m) { o.second = m[1] === 'W'; o.pitch = m[1] === 'W' ? 1.2 : 0.85; }
      const ok = await speakOne(m ? s.slice(m[0].length) : s, o);
      if (!ok || my !== seqToken) return false;
      await new Promise(r => setTimeout(r, opts.gap || 450));
    }
    return true;
  }

  function stop() { seqToken++; if (synth) synth.cancel(); if (currentRec) { try { currentRec.abort(); } catch (e) {} currentRec = null; } }

  /* 一度だけ聞き取り、文字列を返す。失敗・非対応なら '' */
  function listen(opts = {}) {
    return new Promise(resolve => {
      if (!Rec) return resolve('');
      stop();
      const r = new Rec();
      currentRec = r;
      r.lang = opts.lang || 'en-US';
      r.interimResults = false;
      r.maxAlternatives = 3;
      let done = false;
      const finish = (txt) => { if (done) return; done = true; currentRec = null; resolve(txt || ''); };
      r.onresult = e => {
        const alts = [];
        for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript);
        finish(alts.join(' | '));
      };
      r.onerror = () => finish('');
      r.onend = () => finish('');
      if (opts.onstart) r.onstart = opts.onstart;
      try { r.start(); } catch (e) { finish(''); }
      setTimeout(() => { try { r.stop(); } catch (e) {} }, opts.timeout || 8000);
    });
  }

  function voices() { return voicesCache.length ? voicesCache : loadVoices(); }

  return { canSpeak, canListen, speak, speakSeq, stop, listen, voices };
})();
