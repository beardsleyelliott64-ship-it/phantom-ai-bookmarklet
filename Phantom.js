// sparx.js — Sparx Auto v3
// Reader: unchanged logic, decoded from bookmarklet
// Maths: rebuilt — handles Answer btn, multi-part pages (select + number input), Gemini JSON parsing
(function () {
  var K = 'sparx_gemini_key';
  var k = localStorage.getItem(K);
  if (!k) { k = prompt('Gemini API key:'); if (!k) return; localStorage.setItem(K, k); }

  var SKEY = 'sparx_v2_settings';
  var DEF = { model: 'gemini-2.5-flash', speed: 'normal', autoAdvance: true };
  var cfg = Object.assign({}, DEF, JSON.parse(localStorage.getItem(SKEY) || '{}'));

  var MODELS = [
    'gemini-2.0-flash-lite','gemini-2.0-flash','gemini-2.5-flash-lite',
    'gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview','gemini-3-pro-preview',
    'gemini-3.1-flash-lite-preview','gemini-3.1-pro-preview'
  ];

  var SPEEDS = {
    slow:   { ss: [35, 45], cd: [1400, 2200], ms: 2500 },
    normal: { ss: [22, 30], cd: [900,  1600], ms: 2000 },
    fast:   { ss: [10, 16], cd: [350,  750],  ms: 1200 }
  };
  function sp() { return SPEEDS[cfg.speed] || SPEEDS.normal; }
  function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  // ── State ────────────────────────────────────────────────────────────────
  var lastQ = '', busy = false, busyAt = 0, running = true, postRead = false;
  var lastReadClick = 0, lastAdvance = 0, readTimer = null, scrollEl = null;
  var storedPassage = '', sparxMode = null;
  var mathsPageBusy = false, lastMathsPageKey = '';
  var logs = [];

  // ── Watchdog ─────────────────────────────────────────────────────────────
  function watchdog() {
    if (busy && Date.now() - busyAt > 15000) {
      busy = false; lastQ = ''; addLog('watchdog reset', 'warn'); stat('watchdog reset');
    }
    if (mathsPageBusy && Date.now() - busyAt > 15000) {
      mathsPageBusy = false; lastMathsPageKey = ''; addLog('maths watchdog reset', 'warn');
    }
  }
  function setBusy(v) { busy = v; if (v) busyAt = Date.now(); }

  // ── Logging ───────────────────────────────────────────────────────────────
  function addLog(msg, type) {
    logs.unshift({ msg: msg, type: type || 'info', t: new Date().toLocaleTimeString() });
    if (logs.length > 30) logs.pop();
    renderLog();
  }
  function renderLog() {
    var el = document.getElementById('sx-log-list');
    if (!el) return;
    el.innerHTML = logs.map(function (l) {
      var c = l.type === 'ok' ? '#7fc97f' : l.type === 'warn' ? '#e7a23c' : l.type === 'err' ? '#e74c3c' : '#5a5a7a';
      return '<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:10px;color:' + c + '">' + l.t + ' ' + l.msg + '</div>';
    }).join('');
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  var sty = document.createElement('style');
  sty.textContent = '.sxa *{box-sizing:border-box;font-family:monospace}.sxa-tab{cursor:pointer;padding:4px 10px;border-radius:8px;font-size:11px;color:#6060a0;transition:all .2s}.sxa-tab.on{background:rgba(124,107,255,.2);color:#a89bff}.sxa-btn{background:rgba(124,107,255,.12);border:1px solid rgba(124,107,255,.3);color:#a89bff;border-radius:8px;padding:5px 12px;font:11px monospace;cursor:pointer;transition:all .2s;width:100%;margin-top:5px}.sxa-btn:hover{background:rgba(124,107,255,.28)}.sxa-sel{background:rgba(8,8,20,.9);border:1px solid rgba(124,107,255,.3);color:#e0e0ff;border-radius:6px;padding:4px 7px;font:11px monospace;width:100%;margin-top:3px}.sxa-tog{position:relative;display:inline-block;width:34px;height:18px}.sxa-tog input{opacity:0;width:0;height:0}.sxa-sl{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.1);border-radius:18px;transition:.3s}.sxa-sl:before{position:absolute;content:"";height:14px;width:14px;left:2px;bottom:2px;background:#444;border-radius:50%;transition:.3s}input:checked+.sxa-sl{background:rgba(124,107,255,.55)}input:checked+.sxa-sl:before{transform:translateX(16px);background:#a89bff}@keyframes sxblink{0%,100%{opacity:1}50%{opacity:.25}}.sxpulse{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:7px;vertical-align:middle}.idle{background:#444}.active{background:#7fc97f;animation:sxblink 1.2s infinite}.thinking{background:#e7a23c;animation:sxblink .5s infinite}.err{background:#e74c3c}';
  document.head.appendChild(sty);

  var stopBtn = document.createElement('div');
  stopBtn.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;padding:8px 20px;border-radius:20px;font:bold 13px monospace;cursor:pointer;box-shadow:0 2px 14px rgba(231,76,60,.5);user-select:none;';
  stopBtn.textContent = '■ Stop';
  stopBtn.onclick = function () {
    running = false;
    if (readTimer) clearInterval(readTimer);
    var p = document.getElementById('sx-panel'); if (p) p.remove();
    stopBtn.remove();
  };
  document.body.appendChild(stopBtn);

  var panel = document.createElement('div');
  panel.id = 'sx-panel';
  panel.className = 'sxa';
  panel.style.cssText = 'position:fixed;top:16px;left:16px;z-index:99999;background:rgba(9,9,21,.96);color:#e0e0ff;border-radius:16px;width:272px;box-shadow:0 4px 36px rgba(0,0,0,.75),0 0 0 1px rgba(124,107,255,.18);overflow:hidden;';
  panel.innerHTML =
    '<div style="background:linear-gradient(135deg,rgba(124,107,255,.14),rgba(168,155,255,.04));padding:11px 15px;border-bottom:1px solid rgba(124,107,255,.13);display:flex;align-items:center;justify-content:space-between">' +
    '<div style="font-weight:bold;color:#a89bff;font-size:14px">⚡ Sparx Auto</div>' +
    '<div id="sx-mode-badge" style="font-size:10px;background:rgba(124,107,255,.18);padding:2px 9px;border-radius:10px;color:#a89bff">no mode</div>' +
    '</div>' +
    '<div style="padding:10px 14px">' +
    '<div style="display:flex;gap:3px;margin-bottom:10px">' +
    '<span class="sxa-tab on" data-tab="status">Status</span>' +
    '<span class="sxa-tab" data-tab="settings">Settings</span>' +
    '<span class="sxa-tab" data-tab="log">Log</span>' +
    '</div>' +
    '<div id="sx-tab-status">' +
    '<div style="display:flex;align-items:center;margin-bottom:6px">' +
    '<span class="sxpulse idle" id="sx-pulse"></span>' +
    '<span id="sx-stat" style="font-size:12px;color:#7fc97f">select mode</span>' +
    '</div>' +
    '<div id="sx-passage" style="font-size:10px;color:#3a3a5a;margin-top:2px">passage: not captured</div>' +
    '</div>' +
    '<div id="sx-tab-settings" style="display:none">' +
    '<div style="font-size:10px;color:#6060a0;margin-bottom:2px">Model</div>' +
    '<select class="sxa-sel" id="sx-model-sel"></select>' +
    '<div style="font-size:10px;color:#6060a0;margin-top:8px;margin-bottom:2px">Speed</div>' +
    '<select class="sxa-sel" id="sx-speed-sel">' +
    '<option value="slow">Slow (stealthy)</option>' +
    '<option value="normal">Normal</option>' +
    '<option value="fast">Fast</option>' +
    '</select>' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">' +
    '<span style="font-size:11px;color:#9090b0">Auto-advance</span>' +
    '<label class="sxa-tog"><input type="checkbox" id="sx-adv"><span class="sxa-sl"></span></label>' +
    '</div>' +
    '<button class="sxa-btn" id="sx-save">Save Settings</button>' +
    '</div>' +
    '<div id="sx-tab-log" style="display:none;max-height:140px;overflow-y:auto">' +
    '<div id="sx-log-list" style="padding-top:2px"></div>' +
    '</div>' +
    '</div>';
  document.body.appendChild(panel);

  var msel = document.getElementById('sx-model-sel');
  MODELS.forEach(function (m) {
    var o = document.createElement('option');
    o.value = m; o.textContent = m;
    if (m === cfg.model) o.selected = true;
    msel.appendChild(o);
  });
  document.getElementById('sx-speed-sel').value = cfg.speed;
  document.getElementById('sx-adv').checked = cfg.autoAdvance;
  document.getElementById('sx-save').onclick = function () {
    cfg.model = msel.value;
    cfg.speed = document.getElementById('sx-speed-sel').value;
    cfg.autoAdvance = document.getElementById('sx-adv').checked;
    localStorage.setItem(SKEY, JSON.stringify(cfg));
    stat('saved'); addLog('settings saved', 'ok');
  };

  var activeTab = 'status';
  panel.querySelectorAll('.sxa-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      activeTab = t.dataset.tab;
      panel.querySelectorAll('.sxa-tab').forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      ['status', 'settings', 'log'].forEach(function (n) {
        var el = document.getElementById('sx-tab-' + n);
        if (el) el.style.display = (n === activeTab ? '' : 'none');
      });
    });
  });

  function setPulse(s) { var el = document.getElementById('sx-pulse'); if (el) el.className = 'sxpulse ' + s; }
  function stat(msg) { var el = document.getElementById('sx-stat'); if (el) el.textContent = msg; setPulse(busy || mathsPageBusy ? 'thinking' : 'active'); }
  function setPassage(txt) { var el = document.getElementById('sx-passage'); if (el) el.textContent = 'passage: ' + (txt ? txt.length + ' chars' : 'none'); }
  function setBadge(txt) { var el = document.getElementById('sx-mode-badge'); if (el) el.textContent = txt; }

  // ── Mode picker overlay ───────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:999998;background:rgba(6,6,18,.87);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML =
    '<div style="background:rgba(12,10,28,.97);border:1px solid rgba(124,107,255,.3);border-radius:20px;padding:36px 44px;text-align:center;min-width:270px;box-shadow:0 8px 52px rgba(0,0,0,.85)">' +
    '<div style="font-size:22px;font-weight:bold;color:#a89bff;font-family:monospace;margin-bottom:4px">⚡ Sparx Auto</div>' +
    '<div style="font-size:12px;color:#6060a0;font-family:monospace;margin-bottom:28px">v3 — pick platform</div>' +
    '<div style="display:flex;gap:18px;justify-content:center">' +
    '<button id="sx-btn-reader" style="background:linear-gradient(135deg,#6c5fff,#a89bff);color:#fff;border:none;border-radius:14px;padding:18px 26px;font:bold 14px monospace;cursor:pointer;min-width:108px;box-shadow:0 4px 22px rgba(108,95,255,.45)">📖<br><span style=\'font-size:11px\'>Reader</span></button>' +
    '<button id="sx-btn-maths" style="background:linear-gradient(135deg,#1a9e5c,#2ecc71);color:#fff;border:none;border-radius:14px;padding:18px 26px;font:bold 14px monospace;cursor:pointer;min-width:108px;box-shadow:0 4px 22px rgba(46,204,113,.4)">🔢<br><span style=\'font-size:11px\'>Maths</span></button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function startMode(m) {
    sparxMode = m; overlay.remove();
    setBadge(m);
    stat(m === 'reader' ? 'reader — waiting' : 'maths — scanning');
    addLog('mode: ' + m, 'ok');
    setPulse('active');
  }
  document.getElementById('sx-btn-reader').onclick = function () { startMode('reader'); };
  document.getElementById('sx-btn-maths').onclick = function () { startMode('maths'); };

  // ── Shared helpers ────────────────────────────────────────────────────────
  var cookieKw = ['cookie', 'consent', 'privacy', 'gdpr', 'necessary'];
  function isCookie(el) {
    var p = el;
    for (var i = 0; i < 4; i++) {
      if (!p) break;
      if (cookieKw.some(function (w) { return (p.className || '').toLowerCase().includes(w); })) return true;
      p = p.parentElement;
    }
    return false;
  }

  function hasDialog() {
    var ds = document.querySelectorAll('[role="dialog"],[class*="modal"],[class*="dialog"],[class*="popup"]');
    for (var i = 0; i < ds.length; i++) {
      if (ds[i].offsetParent !== null && ds[i] !== panel && !ds[i].contains(panel)) return true;
    }
    return false;
  }

  function clickKw(kws) {
    var els = document.querySelectorAll('button,a,[role="button"]');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').toLowerCase().trim();
      if (els[i].offsetParent !== null && !isCookie(els[i]) && kws.some(function (w) { return t.includes(w); })) {
        els[i].click(); return true;
      }
    }
    return false;
  }

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function setInputNative(inp, val) {
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, val);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { inp.value = val; }
  }

  function tryModel(idx, prompt, cb, firstErr, ml) {
    var mlist = ml || (function () {
      var a = [cfg.model];
      MODELS.forEach(function (m) { if (m !== cfg.model) a.push(m); });
      return a;
    }());
    if (idx >= mlist.length) { cb('all models failed: ' + (firstErr || 'unknown')); return; }
    fetch('https://generativelanguage.googleapis.com/v1beta/models/' + mlist[idx] + ':generateContent?key=' + k, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Answer questions precisely. For MCQ output ONLY the exact option text. For maths output ONLY the number. No explanation, no punctuation added. If asked for JSON output ONLY valid JSON.' }] },
        contents: [{ parts: [{ text: prompt }] }]
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error || !d.candidates || !d.candidates[0]) {
        tryModel(idx + 1, prompt, cb, (d.error && d.error.message) || 'no candidates', mlist);
      } else {
        cb(null, d.candidates[0].content.parts[0].text.trim(), mlist[idx]);
      }
    }).catch(function (e) { tryModel(idx + 1, prompt, cb, String(e), mlist); });
  }

  // ── Reader — unchanged logic ──────────────────────────────────────────────
  function capturePassage() {
    var chunks = [];
    document.querySelectorAll('p,span,div').forEach(function (el) {
      if (el.children.length > 5) return;
      var t = (el.innerText || el.textContent || '').trim();
      if (t.length > 60 && t.length < 8000) chunks.push(t);
    });
    var seen = new Set(), result = [];
    chunks.forEach(function (c) {
      var key = c.slice(0, 40);
      if (!seen.has(key)) { seen.add(key); result.push(c); }
    });
    return result.join('\n').slice(0, 25000)
      .replace(/I have read up to here/gi, '')
      .replace(/Continue|Next|Check/gi, '').trim();
  }

  function findScrollEl() {
    var best = null, bestH = 0;
    document.querySelectorAll('div,main,article,section').forEach(function (el) {
      if (el === panel || el === stopBtn) return;
      var sh = el.scrollHeight - el.clientHeight;
      if (sh > bestH && el.offsetParent !== null) { bestH = sh; best = el; }
    });
    return best;
  }

  function doScroll(px) {
    window.scrollBy(0, px);
    document.documentElement.scrollTop += px;
    document.body.scrollTop += px;
    if (scrollEl) scrollEl.scrollTop += px;
  }

  function scrollToTop() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function totalScrollH() {
    var wh = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
    var eh = scrollEl ? (scrollEl.scrollHeight - scrollEl.clientHeight) : 0;
    return Math.max(wh, eh, 500);
  }

  function getReadBtn() {
    var els = document.querySelectorAll('button,a,[role="button"]');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').toLowerCase().trim();
      if (els[i].offsetParent !== null && t.includes('i have read up to')) return els[i];
    }
    return null;
  }

  function getMCQ() {
    var divs = document.querySelectorAll('div,section,article,form');
    var best = null, bestCount = 0;
    for (var i = 0; i < divs.length; i++) {
      var c = divs[i];
      if (c.offsetParent === null) continue;
      var btns = Array.from(c.querySelectorAll('button,[role="button"],a')).filter(function (b) {
        return b.offsetParent !== null && !isCookie(b) && b.textContent.trim().length > 2 && b.textContent.trim().length < 300;
      });
      if (btns.length >= 3 && btns.length <= 8 && btns.length > bestCount) {
        var longCount = btns.filter(function (b) { return b.textContent.trim().length > 8; }).length;
        if (longCount >= Math.ceil(btns.length / 2)) { best = c; bestCount = btns.length; }
      }
    }
    if (!best) return null;
    var btns = Array.from(best.querySelectorAll('button,[role="button"],a')).filter(function (b) {
      return b.offsetParent !== null && !isCookie(b) && b.textContent.trim().length > 2 && b.textContent.trim().length < 300;
    });
    var opts = btns.map(function (b) { return b.textContent.trim(); });
    var qText = '';
    var par = best.parentElement;
    for (var j = 0; j < 5; j++) {
      if (!par) break;
      var raw = (par.innerText || par.textContent).trim();
      var cleaned = raw;
      opts.forEach(function (o) { cleaned = cleaned.split(o).join(''); });
      cleaned = cleaned.replace(/\s+/g, ' ').trim().replace(/^Q\d+\.\s*/, '').trim();
      if (cleaned.length > 10 && cleaned.length < 500) { qText = cleaned; break; }
      par = par.parentElement;
    }
    if (!qText) {
      var raw2 = (best.innerText || best.textContent).trim();
      opts.forEach(function (o) { raw2 = raw2.split(o).join(''); });
      qText = raw2.replace(/^Q\d+\.\s*/, '').replace(/\s+/g, ' ').trim();
    }
    var key = qText.slice(0, 80) + '__' + opts.join('|');
    return { container: best, buttons: btns, question: qText, options: opts, key: key };
  }

  function handleSurvey() {
    var txt = document.body.innerText;
    if (!txt.includes('like this book') && !txt.includes('easy or difficult')) return false;
    setBusy(true); stat('survey — skipping');
    var starBtns = Array.from(document.querySelectorAll('button,a,[role="button"]')).filter(function (b) {
      return b.offsetParent !== null && (b.querySelector('svg') || b.className.toLowerCase().includes('star'));
    });
    if (starBtns.length >= 3) starBtns[2].click();
    setTimeout(function () {
      var diffBtns = Array.from(document.querySelectorAll('button,a,[role="button"],[class*="btn"]')).filter(function (b) {
        return b.offsetParent !== null && (b.textContent || '').toLowerCase().includes('about right');
      });
      if (diffBtns.length) diffBtns[0].click();
      setTimeout(function () { clickKw(['continue reading', 'continue', 'next']); lastAdvance = Date.now(); setBusy(false); }, 600);
    }, 600);
    return true;
  }

  function readerLoop() {
    if (!running || busy) return;
    watchdog();
    if (hasDialog()) { clickKw(['close', 'dismiss', 'cancel', 'got it']); return; }
    if (clickKw(['retry', 'try again', 'have another go'])) { stat('retrying...'); lastQ = ''; return; }

    var rb = getReadBtn();
    if (rb && !postRead && Date.now() - lastReadClick > 4000) {
      setBusy(true); postRead = true;
      storedPassage = capturePassage();
      setPassage(storedPassage);
      addLog('passage: ' + storedPassage.length + ' chars', 'ok');
      stat('captured — scrolling...');
      scrollEl = findScrollEl();
      var ssp = sp();
      var target = rnd(ssp.ss[0], ssp.ss[1]);
      var elapsed = 0, sh = totalScrollH();
      scrollToTop();
      readTimer = setInterval(function () {
        if (!running) { clearInterval(readTimer); return; }
        elapsed++;
        doScroll(sh / target);
        stat('reading ' + elapsed + '/' + target + 's');
        if (elapsed >= target) {
          clearInterval(readTimer);
          var btn = getReadBtn();
          if (btn) { btn.click(); lastReadClick = Date.now(); stat('read done — waiting for Q'); addLog('read btn clicked', 'ok'); }
          setTimeout(function () { postRead = false; setBusy(false); lastQ = ''; }, 3500);
        }
      }, 1000);
      return;
    }
    if (postRead) return;
    if (handleSurvey()) return;

    var mcq = getMCQ();
    if (!mcq || !mcq.key || mcq.key === lastQ) return;
    lastQ = mcq.key;
    setBusy(true);
    stat('thinking...');
    addLog('Q: ' + mcq.question.slice(0, 50), 'info');
    var ssp2 = sp();
    setTimeout(function () {
      var passage = storedPassage || capturePassage();
      var opts = mcq.options.join('\n');
      var prompt = 'STORY:\n' + passage + '\n\nQUESTION: ' + mcq.question + '\n\nOPTIONS:\n' + opts + '\n\nOutput ONLY the exact option text that answers the question. Copy character for character.';
      tryModel(0, prompt, function (err, answer) {
        if (err) { setBusy(false); stat(err); addLog(err, 'err'); lastQ = ''; return; }
        var label = answer.length > 38 ? answer.slice(0, 38) + '…' : answer;
        stat('→ ' + label);
        addLog('ans: ' + label, 'ok');
        var clicked = false, normA = normalize(answer);
        for (var i = 0; i < mcq.buttons.length; i++) {
          if (normalize(mcq.buttons[i].textContent.trim()) === normA) { mcq.buttons[i].click(); clicked = true; break; }
        }
        if (!clicked) {
          for (var i = 0; i < mcq.buttons.length; i++) {
            var normB = normalize(mcq.buttons[i].textContent.trim());
            if (normA.length >= 8 && normB.length >= 8 && (normA.includes(normB) || normB.includes(normA))) {
              mcq.buttons[i].click(); clicked = true; break;
            }
          }
        }
        if (!clicked) {
          var bestScore = 0, bestBtn = null;
          for (var i = 0; i < mcq.buttons.length; i++) {
            var normB = normalize(mcq.buttons[i].textContent.trim());
            var words = normA.split(' ');
            var matches = words.filter(function (w) { return w.length > 3 && normB.includes(w); }).length;
            if (matches > bestScore) { bestScore = matches; bestBtn = mcq.buttons[i]; }
          }
          if (bestScore >= 2) { bestBtn.click(); clicked = true; }
        }
        if (!clicked) { stat('no match — retrying'); addLog('no match', 'warn'); lastQ = ''; setBusy(false); return; }
        setTimeout(function () {
          if (cfg.autoAdvance) { clickKw(['continue', 'next', 'continue your current task']); lastAdvance = Date.now(); addLog('advanced', 'ok'); }
          setBusy(false);
          setTimeout(function () { var fresh = getMCQ(); if (!fresh || fresh.key !== lastQ) { lastQ = ''; } }, 1800);
        }, rnd(ssp2.cd[0], ssp2.cd[1]));
      });
    }, rnd(800, 1400));
  }

  // ── Maths v2 ─────────────────────────────────────────────────────────────
  function captureFullPageText() {
    var chunks = [], seen = new Set();
    document.querySelectorAll('p,span,div,h1,h2,h3,h4,li').forEach(function (el) {
      if (el.children.length > 8 || !el.offsetParent) return;
      var t = (el.innerText || el.textContent || '').trim();
      if (t.length < 3 || t.length > 2000) return;
      var key = t.slice(0, 60);
      if (!seen.has(key)) { seen.add(key); chunks.push(t); }
    });
    // Also pull KaTeX annotations
    document.querySelectorAll('.katex,.katex-display').forEach(function (k) {
      if (!k.offsetParent) return;
      var ann = k.querySelector('annotation[encoding="application/x-tex"]');
      var t = ann ? ann.textContent.trim() : (k.innerText || k.textContent || '').trim();
      if (t) chunks.push(t);
    });
    return chunks.join('\n').slice(0, 8000);
  }

  function getAnswerBtn() {
    var els = document.querySelectorAll('button,a,[role="button"]');
    for (var i = 0; i < els.length; i++) {
      if (!els[i].offsetParent) continue;
      var t = (els[i].textContent || '').trim();
      if (t === 'Answer') return els[i];
    }
    return null;
  }

  function getSubmitBtn() {
    var els = document.querySelectorAll('button,a,[role="button"]');
    for (var i = 0; i < els.length; i++) {
      if (!els[i].offsetParent) continue;
      var t = (els[i].textContent || '').toLowerCase().trim();
      if (t.includes('submit')) return els[i];
    }
    return null;
  }

  function getCheckBtn() {
    var els = document.querySelectorAll('button,a,[role="button"]');
    for (var i = 0; i < els.length; i++) {
      if (!els[i].offsetParent) continue;
      var t = (els[i].textContent || '').toLowerCase().trim();
      if (t === 'check' || t === 'check my answer' || t === 'check answer' || t === 'submit' || t === 'enter') return els[i];
    }
    return null;
  }

  function getNextMathsBtn() {
    var els = document.querySelectorAll('button,a,[role="button"]');
    for (var i = 0; i < els.length; i++) {
      if (!els[i].offsetParent) continue;
      var t = (els[i].textContent || '').toLowerCase().trim();
      if (t === 'next' || t === 'next question' || t.includes('got it') || t === 'continue' || t === 'try another') return els[i];
    }
    return null;
  }

  // Detect all answer components on the current page
  // Returns array of: {type:'select', options:[{text,el}]} | {type:'input', el}
  function getMathsAnswerComponents() {
    var navTexts = ['back', 'next', 'submit', 'answer', 'check', 'continue', 'watch video', 'zoom', 'got it', 'try another'];
    var components = [];

    // Find select-style button groups (2–6 non-nav visible buttons)
    var candidateBtns = Array.from(document.querySelectorAll('button,[role="button"]')).filter(function (b) {
      if (!b.offsetParent) return false;
      if (isCookie(b)) return false;
      var t = (b.textContent || '').trim().toLowerCase();
      if (navTexts.some(function (n) { return t === n; })) return false;
      if (t.length < 2 || t.length > 120) return false;
      return true;
    });
    if (candidateBtns.length >= 2 && candidateBtns.length <= 6) {
      components.push({
        type: 'select',
        options: candidateBtns.map(function (b) { return { text: b.textContent.trim(), el: b }; })
      });
    }

    // Find number/text inputs
    Array.from(document.querySelectorAll('input[type="text"],input[type="number"],input:not([type])')).forEach(function (inp) {
      if (!inp.offsetParent || inp.readOnly) return;
      if (getComputedStyle(inp).display === 'none') return;
      if (isCookie(inp)) return;
      components.push({ type: 'input', el: inp });
    });

    return components;
  }

  function mathsPageKey() {
    var comps = getMathsAnswerComponents();
    var sub = getSubmitBtn();
    if (!sub && !comps.length) return null;
    return comps.map(function (c) {
      if (c.type === 'select') return 'sel:' + c.options.map(function (o) { return o.text; }).join('|');
      return 'inp';
    }).join('__') || 'empty';
  }

  function buildMathsPrompt(questionText, components) {
    var hasSelect = components.some(function (c) { return c.type === 'select'; });
    var hasInput  = components.some(function (c) { return c.type === 'input'; });
    var prompt = 'MATHS QUESTION AND CONTEXT:\n' + questionText + '\n\n';

    if (hasSelect && hasInput) {
      var sel = components.find(function (c) { return c.type === 'select'; });
      prompt += 'ANSWER BOTH PARTS:\n';
      prompt += 'Part a) Choose ONE from: ' + sel.options.map(function (o) { return '"' + o.text + '"'; }).join(', ') + '\n';
      prompt += 'Part b) Calculate the number (currency if £ shown, 2 decimal places if pence)\n\n';
      prompt += 'Return ONLY this exact JSON, no other text:\n{"a":"EXACT_OPTION_TEXT","b":"NUMBER"}';
    } else if (hasSelect) {
      var sel = components.find(function (c) { return c.type === 'select'; });
      prompt += 'Choose ONE: ' + sel.options.map(function (o) { return '"' + o.text + '"'; }).join(', ') + '\n\n';
      prompt += 'Return ONLY the exact option text, nothing else.';
    } else if (hasInput) {
      prompt += 'Calculate the answer.\nReturn ONLY the number (2 decimal places if a money/decimal answer, integer otherwise). Nothing else.';
    }
    return prompt;
  }

  function tryLocalSolve(q) {
    if (!q) return null;
    var t = q.replace(/\s+/g, ' ');
    var m;
    m = t.match(/(\d+(?:\.\d+)?)\s*[×x\*]\s*(\d+(?:\.\d+)?)/i);
    if (m) return String(parseFloat(m[1]) * parseFloat(m[2]));
    m = t.match(/(\d+(?:\.\d+)?)\s*[÷\/]\s*(\d+(?:\.\d+)?)/);
    if (m) { var r = parseFloat(m[1]) / parseFloat(m[2]); return Number.isInteger(r) ? String(r) : r.toFixed(2); }
    m = t.match(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)/);
    if (m) return String(parseFloat(m[1]) + parseFloat(m[2]));
    m = t.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
    if (m) return String(parseFloat(m[1]) - parseFloat(m[2]));
    m = t.match(/(\d+)\s*[²\^2]/);
    if (m) return String(parseInt(m[1]) * parseInt(m[1]));
    return null;
  }

  function applyMathsAnswer(components, rawAnswer) {
    // Parse response — try JSON first, fall back to plain
    var parsed = null;
    var clean = rawAnswer.replace(/```json|```/g, '').trim();
    try { parsed = JSON.parse(clean); } catch (e) { parsed = null; }

    var ssp = sp();
    var selectDone = false, inputDone = false;

    components.forEach(function (comp) {
      if (comp.type === 'select') {
        var target = '';
        if (parsed && (parsed.a || parsed['a)'])) {
          target = parsed.a || parsed['a)'];
        } else if (!parsed) {
          target = rawAnswer;
        }
        var normT = normalize(target);
        var bestEl = null, bestScore = -1;

        comp.options.forEach(function (opt) {
          var normO = normalize(opt.text);
          if (normO === normT) { bestEl = opt.el; bestScore = 999; }
          else if (bestScore < 999 && (normT.includes(normO) || normO.includes(normT)) && normO.length > bestScore) {
            bestScore = normO.length; bestEl = opt.el;
          }
        });

        if (bestEl) {
          setTimeout(function () {
            bestEl.click();
            addLog('selected: ' + bestEl.textContent.trim(), 'ok');
            selectDone = true;
          }, rnd(200, 500));
        } else {
          addLog('select: no match for "' + target + '"', 'warn');
          selectDone = true;
        }

      } else if (comp.type === 'input') {
        var val = '';
        if (parsed) {
          val = String(parsed.b || parsed['b)'] || parsed.answer || '').trim();
        } else {
          var m = rawAnswer.match(/[-\d.]+/);
          val = m ? m[0] : rawAnswer.trim();
        }
        if (val) {
          setTimeout(function () {
            setInputNative(comp.el, val);
            comp.el.focus();
            addLog('filled: ' + val, 'ok');
            inputDone = true;
          }, rnd(350, 700));
        } else {
          addLog('input: no numeric value parsed', 'warn');
          inputDone = true;
        }
      }
    });

    // Submit after all fills settle
    var submitDelay = rnd(ssp.cd[0] + 300, ssp.cd[1] + 500);
    setTimeout(function () {
      var sub = getSubmitBtn() || getCheckBtn();
      if (sub) {
        sub.click();
        lastAdvance = Date.now();
        addLog('submitted', 'ok');
        stat('maths: submitted');
      } else {
        // Try Enter on last input
        components.forEach(function (c) {
          if (c.type === 'input' && c.el) {
            c.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          }
        });
      }
      setTimeout(function () {
        mathsPageBusy = false;
        lastMathsPageKey = '';
      }, 1500);
    }, submitDelay);
  }

  function mathsLoopV2() {
    if (!running || mathsPageBusy) return;
    watchdog();

    if (hasDialog()) { clickKw(['close', 'dismiss', 'cancel', 'got it', 'ok']); return; }

    // Next/continue after answered
    var nx = getNextMathsBtn();
    if (nx && Date.now() - lastAdvance > 1400) {
      nx.click();
      lastAdvance = Date.now();
      lastMathsPageKey = '';
      addLog('next', 'ok');
      stat('maths — scanning');
      return;
    }

    // Answer input page — has submit button + components
    var sub = getSubmitBtn();
    var comps = getMathsAnswerComponents();

    if (sub && comps.length > 0) {
      var pk = mathsPageKey();
      if (!pk || pk === lastMathsPageKey) return;
      lastMathsPageKey = pk;
      mathsPageBusy = true;
      busyAt = Date.now();

      var questionText = captureFullPageText();
      stat('maths: solving...');
      addLog('page: ' + comps.length + ' part(s) — ' + comps.map(function (c) { return c.type; }).join(', '), 'info');

      // Fast local path for single numeric input only
      if (comps.length === 1 && comps[0].type === 'input') {
        var local = tryLocalSolve(questionText);
        if (local !== null) {
          addLog('local: ' + local, 'ok');
          stat('maths: ' + local);
          var inp = comps[0].el;
          setTimeout(function () {
            setInputNative(inp, local);
            inp.focus();
            setTimeout(function () {
              var chk = getCheckBtn() || getSubmitBtn();
              if (chk) { chk.click(); lastAdvance = Date.now(); addLog('checked', 'ok'); }
              else { inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true })); }
              setTimeout(function () { mathsPageBusy = false; lastMathsPageKey = ''; }, 1200);
            }, rnd(sp().cd[0], sp().cd[1]));
          }, rnd(300, 600));
          return;
        }
      }

      // Gemini path
      var prompt = buildMathsPrompt(questionText, comps);
      tryModel(0, prompt, function (err, answer, model) {
        if (err) {
          stat('err: ' + err); addLog(err, 'err');
          mathsPageBusy = false; lastMathsPageKey = '';
          return;
        }
        var preview = answer.length > 60 ? answer.slice(0, 60) + '…' : answer;
        addLog('gemini → ' + preview + ' (' + model.split('-').pop() + ')', 'ok');
        stat('maths: applying answer');
        applyMathsAnswer(comps, answer);
      }, null, null);
      return;
    }

    // Question page — look for "Answer" button to transition to input page
    var ab = getAnswerBtn();
    if (ab) {
      // Use body text fingerprint as key so we don't click repeatedly
      var qfp = (document.body.innerText || '').slice(50, 250);
      if (qfp !== lastMathsPageKey) {
        lastMathsPageKey = qfp;
        stat('maths: clicking Answer');
        addLog('Answer btn — clicking', 'info');
        setTimeout(function () { ab.click(); }, rnd(600, 1200));
      }
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  function loop() {
    if (!running || !sparxMode) return;
    watchdog();
    if (sparxMode === 'reader') readerLoop();
    else if (sparxMode === 'maths') mathsLoopV2();
  }

  setInterval(loop, sp().ms);
  setPulse('idle');
  stat('select mode above');
  addLog('sparx auto v3 loaded', 'ok');
})();
