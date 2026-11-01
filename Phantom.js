(function(){
'use strict';

// ── Key / Config ──────────────────────────────────────────────────────────────
var K='ph_gemini_key';
var k=localStorage.getItem(K);
if(!k){k=prompt('Gemini API key:');if(!k)return;localStorage.setItem(K,k);}
var SKEY='phantom_v1';
var DEF={model:'gemini-2.5-flash',speed:'normal',autoAdvance:true};
var cfg=Object.assign({},DEF,JSON.parse(localStorage.getItem(SKEY)||'{}'));
var MODELS=['gemini-2.0-flash-lite','gemini-2.0-flash','gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro','gemini-3-flash-preview','gemini-3-pro-preview','gemini-3.1-flash-lite-preview','gemini-3.1-pro-preview'];
var SPEEDS={
  slow:  {ss:[35,45],cd:[1400,2200],ms:2500},
  normal:{ss:[22,30],cd:[900,1600], ms:1800},
  fast:  {ss:[10,16],cd:[350,750],  ms:1000}
};
function sp(){return SPEEDS[cfg.speed]||SPEEDS.normal;}
function rnd(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function saveCfg(){localStorage.setItem(SKEY,JSON.stringify(cfg));}

// ── State ─────────────────────────────────────────────────────────────────────
var lastQ='',busy=false,busyAt=0,running=true,postRead=false,
    lastReadClick=0,lastAdvance=0,lastAnswerClick=0,
    readTimer=null,
    storedPassage='',storedMathsContext='',
    sparxMode=null,
    lastMathsQ='',mathsBusy=false,mathsBusyAt=0,
    pendingMathsAnswer=null,currentPageKey='',
    logs=[],stats={ans:0,correct:0,streak:0};
var panel,stopBtn;

// ── Watchdog ──────────────────────────────────────────────────────────────────
function watchdog(){
  if(busy&&Date.now()-busyAt>15000){busy=false;lastQ='';stat('watchdog reset');}
  if(mathsBusy&&Date.now()-mathsBusyAt>20000){
    mathsBusy=false;lastMathsQ='';pendingMathsAnswer=null;
    mlog('watchdog reset','warn');
  }
}
function setBusy(v){busy=v;if(v)busyAt=Date.now();}
function setMathsBusy(v){mathsBusy=v;if(v)mathsBusyAt=Date.now();}
function isInPanel(el){
  var p=el;
  while(p){if(panel&&p===panel)return true;if(stopBtn&&p===stopBtn)return true;p=p.parentElement;}
  return false;
}

// ── Reader log (tabs UI) ──────────────────────────────────────────────────────
var logs=[];
function addLog(msg,type){
  logs.unshift({msg:msg,type:type||'info',t:new Date().toLocaleTimeString()});
  if(logs.length>40)logs.pop();
  renderReaderLog();
}
function renderReaderLog(){
  var el=document.getElementById('ph-log');if(!el)return;
  el.innerHTML=logs.map(function(l){
    var c=l.type==='ok'?'#00ffaa':l.type==='warn'?'#ffcc00':l.type==='err'?'#ff4466':'#7799ee';
    return'<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:'+c+'">'+l.t+' '+l.msg+'</div>';
  }).join('');
}

// ── Maths panel log ───────────────────────────────────────────────────────────
function mlog(msg,type){
  var el=document.getElementById('ph-mlog');if(!el)return;
  var c=type==='ok'?'#00ffaa':type==='warn'?'#ffcc00':type==='err'?'#ff4466':'#aaccbb';
  var row=document.createElement('div');
  row.style.cssText='padding:2px 0;font-size:11px;color:'+c+';border-bottom:1px solid rgba(0,255,170,.06);';
  row.textContent=new Date().toLocaleTimeString()+' '+msg;
  el.insertBefore(row,el.firstChild);
  if(el.children.length>60)el.removeChild(el.lastChild);
  // also pipe to reader log array
  addLog(msg,type);
}

function setFieldStatus(txt,color){
  var el=document.getElementById('ph-field-status');
  if(el){el.textContent=txt;el.style.color=color||'#aaccbb';}
}

function setValueInput(val){
  var el=document.getElementById('ph-value-input');
  if(el)el.value=val;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
var sty=document.createElement('style');
sty.textContent='@keyframes phGlow{0%,100%{box-shadow:0 0 0 1px rgba(0,255,170,.2),0 12px 48px rgba(0,0,0,.9)}50%{box-shadow:0 0 0 1px rgba(0,200,255,.35),0 0 40px rgba(0,200,255,.15),0 12px 48px rgba(0,0,0,.9)}}@keyframes phOrb{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.5);opacity:.85}}@keyframes phScan{0%{top:-2px}100%{top:100%}}@keyframes phPulse{0%,100%{opacity:1}50%{opacity:.2}}@keyframes phFast{0%,100%{opacity:1}50%{opacity:.1}}.ph-wrap{position:fixed;top:16px;left:16px;z-index:2147483647;width:340px;font-family:SF Mono,Fira Code,monospace;user-select:none}.ph-panel{background:rgba(4,6,18,.98);border-radius:18px;overflow:hidden;animation:phGlow 4s ease infinite;position:relative}.ph-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}.ph-orb{position:absolute;border-radius:50%;filter:blur(40px);animation:phOrb 6s ease infinite}.ph-orb1{width:160px;height:160px;background:rgba(0,255,170,.07);top:-40px;right:-20px}.ph-orb2{width:110px;height:110px;background:rgba(0,150,255,.08);bottom:10px;left:-10px;animation-delay:-3s}.ph-scan{position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(0,255,170,.3),transparent);animation:phScan 3s linear infinite;pointer-events:none}.ph-inner{position:relative;z-index:1}.ph-header{padding:14px 16px 12px;border-bottom:1px solid rgba(0,255,170,.1);display:flex;align-items:center;justify-content:space-between;cursor:move}.ph-logo{display:flex;align-items:center;gap:10px}.ph-icon{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#00ffaa,#0066ff);display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 14px rgba(0,255,170,.5);color:#000;font-weight:900}.ph-name{font-size:15px;font-weight:800;letter-spacing:2px;background:linear-gradient(90deg,#00ffaa,#00ccff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}.ph-badge{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:3px 11px;border-radius:20px;background:rgba(0,255,170,.1);border:1px solid rgba(0,255,170,.3);color:rgba(0,255,170,.9)}.ph-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:10px 14px}.ph-stat{background:rgba(255,255,255,.03);border:1px solid rgba(0,255,170,.1);border-radius:10px;padding:7px 4px;text-align:center}.ph-stat-n{font-size:26px;font-weight:800;background:linear-gradient(135deg,#00ffaa,#00aaff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1}.ph-stat-l{font-size:10px;color:rgba(100,200,160,.6);letter-spacing:1px;text-transform:uppercase;margin-top:2px}.ph-status{display:flex;align-items:center;gap:9px;padding:8px 14px;background:rgba(0,0,0,.4);border-top:1px solid rgba(0,255,170,.06);border-bottom:1px solid rgba(0,255,170,.06)}.ph-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.ph-dot.idle{background:#444}.ph-dot.active{background:#00ffaa;animation:phPulse 1.5s ease infinite}.ph-dot.thinking{background:#ffcc00;animation:phFast .4s ease infinite}.ph-dot.err{background:#ff4466}.ph-stxt{font-size:13px;color:rgba(200,240,220,.9);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.ph-tabs{display:flex;border-bottom:1px solid rgba(0,255,170,.08)}.ph-tab{flex:1;text-align:center;padding:8px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(120,160,140,.5);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:all .2s;font-family:inherit}.ph-tab.on{color:#00ffaa;border-bottom-color:#00ffaa}.ph-body{padding:12px 14px 14px}.ph-lbl{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:rgba(100,200,160,.5);display:block;margin-top:10px}.ph-sel{width:100%;background:rgba(4,14,10,.95);border:1px solid rgba(0,255,170,.2);color:#cceedc;border-radius:8px;padding:6px 9px;font:12px SF Mono,monospace;outline:none;margin-top:4px}.ph-btn{width:100%;margin-top:10px;padding:8px;background:linear-gradient(135deg,rgba(0,255,170,.12),rgba(0,150,255,.1));border:1px solid rgba(0,255,170,.25);color:#00ffaa;border-radius:10px;font:700 12px SF Mono,monospace;cursor:pointer;letter-spacing:1px;font-family:inherit}.ph-tog{position:relative;display:inline-block;width:38px;height:20px}.ph-tog input{opacity:0;width:0;height:0}.ph-sl{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.07);border-radius:20px;transition:.3s;border:1px solid rgba(0,255,170,.15)}.ph-sl:before{position:absolute;content:"";height:14px;width:14px;left:2px;bottom:2px;background:#555;border-radius:50%;transition:.3s}input:checked+.ph-sl{background:rgba(0,255,170,.3);border-color:rgba(0,255,170,.5)}input:checked+.ph-sl:before{transform:translateX(18px);background:#00ffaa}.ph-log-wrap{max-height:120px;overflow-y:auto}.ph-log-wrap::-webkit-scrollbar{width:3px}.ph-log-wrap::-webkit-scrollbar-thumb{background:rgba(0,255,170,.25);border-radius:2px}.ph-adv-row{display:flex;align-items:center;justify-content:space-between;margin-top:12px}.ph-adv-lbl{font-size:11px;color:rgba(0,255,170,.6)}.ph-m-sec{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(0,255,170,.45);margin:10px 0 5px;}.ph-m-status{font-size:12px;color:#aaccbb;background:rgba(0,255,170,.04);border:1px solid rgba(0,255,170,.12);border-radius:8px;padding:6px 10px;min-height:32px;word-break:break-word;}.ph-m-row{display:flex;gap:7px;margin-top:8px;}.ph-m-btn{flex:1;padding:7px 4px;background:rgba(0,255,170,.08);border:1px solid rgba(0,255,170,.25);color:#00ffaa;border-radius:9px;font:700 11px SF Mono,monospace;cursor:pointer;letter-spacing:.8px;font-family:inherit;transition:background .2s;}.ph-m-btn:hover{background:rgba(0,255,170,.18);}.ph-m-btn.red{background:rgba(255,68,102,.08);border-color:rgba(255,68,102,.3);color:#ff4466;}.ph-m-btn.red:hover{background:rgba(255,68,102,.18);}.ph-m-inp{width:100%;margin-top:8px;padding:8px 10px;background:rgba(0,20,10,.9);border:1px solid rgba(0,255,170,.25);color:#e0ffe8;border-radius:9px;font:13px SF Mono,monospace;outline:none;box-sizing:border-box;}.ph-m-inp:focus{border-color:rgba(0,255,170,.6);}.ph-m-inp::placeholder{color:rgba(0,255,170,.25);}.ph-mlog-wrap{max-height:100px;overflow-y:auto;background:rgba(0,0,0,.5);border-radius:8px;padding:6px 8px;margin-bottom:6px;}.ph-mlog-wrap::-webkit-scrollbar{width:3px}.ph-mlog-wrap::-webkit-scrollbar-thumb{background:rgba(0,255,170,.2);border-radius:2px}';
document.head.appendChild(sty);

// ── Stop button ───────────────────────────────────────────────────────────────
stopBtn=document.createElement('div');
stopBtn.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:rgba(20,0,10,.97);color:#ff4466;padding:8px 20px;border-radius:20px;font:700 13px monospace;cursor:pointer;border:1px solid rgba(255,68,102,.4);letter-spacing:1px;';
stopBtn.textContent='◼ STOP PHANTOM';
stopBtn.onclick=function(){running=false;if(readTimer)clearInterval(readTimer);if(panel)panel.remove();stopBtn.remove();};
document.body.appendChild(stopBtn);

// ── Panel HTML ────────────────────────────────────────────────────────────────
panel=document.createElement('div');
panel.className='ph-wrap';
panel.innerHTML=
'<div class="ph-panel">'+
'<div class="ph-bg"><div class="ph-orb ph-orb1"></div><div class="ph-orb ph-orb2"></div><div class="ph-scan"></div></div>'+
'<div class="ph-inner">'+

// header
'<div class="ph-header" id="ph-hdr">'+
'<div class="ph-logo"><div class="ph-icon">⚡</div><div class="ph-name">PHANTOM</div></div>'+
'<div class="ph-badge" id="ph-mode">INIT</div>'+
'</div>'+

// ── READER UI ────────────────────────────────────────────────────────────────
'<div id="ph-reader-ui">'+
'<div class="ph-stats">'+
'<div class="ph-stat"><div class="ph-stat-n" id="ph-ans">0</div><div class="ph-stat-l">Answered</div></div>'+
'<div class="ph-stat"><div class="ph-stat-n" id="ph-cor">0</div><div class="ph-stat-l">Correct</div></div>'+
'<div class="ph-stat"><div class="ph-stat-n" id="ph-str">0</div><div class="ph-stat-l">Streak</div></div>'+
'</div>'+
'<div class="ph-status"><div class="ph-dot idle" id="ph-dot"></div><div class="ph-stxt" id="ph-stxt">initialising...</div></div>'+
'<div class="ph-tabs">'+
'<button class="ph-tab on" id="ph-t1" onclick="document.getElementById(\'ph-s\').style.display=\'block\';document.getElementById(\'ph-rl\').style.display=\'none\';this.className=\'ph-tab on\';document.getElementById(\'ph-t2\').className=\'ph-tab\';">SETTINGS</button>'+
'<button class="ph-tab" id="ph-t2" onclick="document.getElementById(\'ph-s\').style.display=\'none\';document.getElementById(\'ph-rl\').style.display=\'block\';this.className=\'ph-tab on\';document.getElementById(\'ph-t1\').className=\'ph-tab\';">LOG</button>'+
'</div>'+
'<div class="ph-body">'+
'<div id="ph-s">'+
'<span class="ph-lbl">Model</span><select class="ph-sel" id="ph-model"></select>'+
'<span class="ph-lbl">Speed</span>'+
'<select class="ph-sel" id="ph-speed"><option value="slow">Slow (safer)</option><option value="normal">Normal</option><option value="fast">Fast</option></select>'+
'<div class="ph-adv-row"><span class="ph-adv-lbl">Auto-advance</span><label class="ph-tog"><input type="checkbox" id="ph-adv"><span class="ph-sl"></span></label></div>'+
'<button class="ph-btn" id="ph-save">SAVE CONFIG</button>'+
'</div>'+
'<div id="ph-rl" style="display:none"><div class="ph-log-wrap"><div id="ph-log"></div></div></div>'+
'</div>'+
'</div>'+ // end reader-ui

// ── MATHS UI ─────────────────────────────────────────────────────────────────
'<div id="ph-maths-ui" style="display:none;padding:10px 14px 14px;">'+

// maths stats row
'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px;">'+
'<div class="ph-stat"><div class="ph-stat-n" id="ph-m-ans">0</div><div class="ph-stat-l">Answered</div></div>'+
'<div class="ph-stat"><div class="ph-stat-n" id="ph-m-cor">0</div><div class="ph-stat-l">Correct</div></div>'+
'<div class="ph-stat"><div class="ph-stat-n" id="ph-m-str">0</div><div class="ph-stat-l">Streak</div></div>'+
'</div>'+

// log area
'<div class="ph-mlog-wrap"><div id="ph-mlog"><div style="font-size:11px;color:rgba(0,255,170,.35);">Log cleared</div></div></div>'+

// field status
'<div class="ph-m-sec">VISIBLE ANSWER FIELD</div>'+
'<div class="ph-m-status" id="ph-field-status">Scanning...</div>'+
'<div class="ph-m-row">'+
'<button class="ph-m-btn" id="ph-refresh-btn">REFRESH FIELDS</button>'+
'<button class="ph-m-btn" id="ph-inspect-btn">INSPECT</button>'+
'</div>'+

// value input
'<div class="ph-m-sec">VALUE TO ENTER</div>'+
'<input class="ph-m-inp" id="ph-value-input" type="text" placeholder="Waiting for Gemini...">'+
'<div class="ph-m-row">'+
'<button class="ph-m-btn" id="ph-fill-btn">FILL FIELD</button>'+
'<button class="ph-m-btn red" id="ph-clear-btn">CLEAR LOG</button>'+
'</div>'+

'</div>'+ // end maths-ui

'</div></div>'; // end inner + panel

document.body.appendChild(panel);

// ── Populate reader settings ───────────────────────────────────────────────────
var msel=document.getElementById('ph-model');
MODELS.forEach(function(m){var o=document.createElement('option');o.value=m;o.textContent=m;if(m===cfg.model)o.selected=true;msel.appendChild(o);});
document.getElementById('ph-speed').value=cfg.speed||'normal';
document.getElementById('ph-adv').checked=cfg.autoAdvance!==false;
document.getElementById('ph-save').onclick=function(){
  cfg.model=document.getElementById('ph-model').value;
  cfg.speed=document.getElementById('ph-speed').value;
  cfg.autoAdvance=document.getElementById('ph-adv').checked;
  saveCfg();stat('config saved');addLog('config saved','ok');
};

// ── Maths panel buttons ───────────────────────────────────────────────────────
document.getElementById('ph-refresh-btn').onclick=function(){
  mlog('refreshing fields...','info');
  var result=scanFields();
  setFieldStatus(result.label, result.color);
  mlog('fields: '+result.label,'ok');
};

document.getElementById('ph-inspect-btn').onclick=function(){
  mlog('--- INSPECT ---','info');
  var inp=getMathsInput();
  mlog('input: '+(inp?inp.tagName+' type='+inp.type+' val="'+inp.value+'"':'none'),'info');
  var mcq=getMathsMCQ();
  mlog('mcq: '+(mcq?mcq.options.join(' | '):'none'),'info');
  var apb=getAnswerProceedBtn();
  mlog('answer btn: '+(apb?'found':'none'),'info');
  var chk=getCheckBtn();
  mlog('submit btn: '+(chk?'enabled':'not found/disabled'),'info');
  mlog('ctx stored: '+storedMathsContext.length+' chars','info');
};

document.getElementById('ph-fill-btn').onclick=function(){
  var val=(document.getElementById('ph-value-input').value||'').trim();
  if(!val){mlog('no value to fill','warn');return;}
  mlog('manual fill: '+val,'info');
  manualFill(val);
};

document.getElementById('ph-clear-btn').onclick=function(){
  var el=document.getElementById('ph-mlog');
  if(el){el.innerHTML='<div style="font-size:11px;color:rgba(0,255,170,.35);">Log cleared</div>';}
};

// ── Draggable ─────────────────────────────────────────────────────────────────
(function(){
  var mx=0,my=0,dragging=false;
  var hdr=document.getElementById('ph-hdr');
  hdr.addEventListener('mousedown',function(e){
    if(e.target.tagName==='BUTTON'||e.target.tagName==='SELECT'||e.target.tagName==='INPUT')return;
    dragging=true;mx=e.clientX-panel.offsetLeft;my=e.clientY-panel.offsetTop;e.preventDefault();
  });
  document.addEventListener('mousemove',function(e){if(!dragging)return;panel.style.left=(e.clientX-mx)+'px';panel.style.top=(e.clientY-my)+'px';});
  document.addEventListener('mouseup',function(){dragging=false;});
})();

// ── UI helpers ────────────────────────────────────────────────────────────────
function stat(txt){var el=document.getElementById('ph-stxt');if(el)el.textContent=txt;}
function setPulse(s){var d=document.getElementById('ph-dot');if(d)d.className='ph-dot '+s;}
function updateStats(){
  // reader stats
  ['ph-ans','ph-cor','ph-str'].forEach(function(id,i){
    var el=document.getElementById(id);
    if(el)el.textContent=[stats.ans,stats.correct,stats.streak][i];
  });
  // maths stats (same counters)
  ['ph-m-ans','ph-m-cor','ph-m-str'].forEach(function(id,i){
    var el=document.getElementById(id);
    if(el)el.textContent=[stats.ans,stats.correct,stats.streak][i];
  });
}
function setMode(m){
  sparxMode=m;
  var b=document.getElementById('ph-mode');if(b)b.textContent=m?m.toUpperCase():'AUTO';
  if(m==='maths'){
    document.getElementById('ph-reader-ui').style.display='none';
    document.getElementById('ph-maths-ui').style.display='block';
  }else{
    document.getElementById('ph-reader-ui').style.display='block';
    document.getElementById('ph-maths-ui').style.display='none';
  }
}

// ── Mode detection ────────────────────────────────────────────────────────────
function detectMode(){
  var url=window.location.href;
  if(url.includes('/maths')||url.includes('/math')||document.title.toLowerCase().includes('maths'))return'maths';
  if(url.includes('/reader')||url.includes('/reading')||document.title.toLowerCase().includes('reader'))return'reader';
  if(document.querySelectorAll('[class*="passage"],[class*="reading"],[class*="extract"]').length)return'reader';
  if(document.querySelector('input[type="number"]'))return'maths';
  // Sparx homework landing page — default maths
  if(window.location.href.includes('homework'))return'maths';
  return'reader';
}

// ── Gemini API ────────────────────────────────────────────────────────────────
function tryModel(idx,prompt,cb){
  if(idx>=MODELS.length){cb('all models failed',null);return;}
  var model=idx===0?cfg.model:MODELS[idx];
  setPulse('thinking');
  fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+k,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{temperature:0.05,maxOutputTokens:512}
    })
  }).then(function(r){return r.json();}).then(function(d){
    setPulse('active');
    if(d.error){mlog('api: '+d.error.message,'err');tryModel(idx+1,prompt,cb);return;}
    var t=d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts&&d.candidates[0].content.parts[0]&&d.candidates[0].content.parts[0].text;
    if(!t){tryModel(idx+1,prompt,cb);return;}
    cb(null,t.trim());
  }).catch(function(){mlog('fetch err','err');tryModel(idx+1,prompt,cb);});
}

// ── Shared DOM helpers ────────────────────────────────────────────────────────
function isCookie(el){var t=(el.textContent||'').toLowerCase();return t.includes('cookie')||t.includes('accept');}
function hasDialog(){return!!(document.querySelector('[role="dialog"],[class*="modal"],[class*="dialog"]'));}
function clickKw(kws){
  var els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    if(!els[i].offsetParent||isInPanel(els[i])||isCookie(els[i]))continue;
    var t=(els[i].textContent||'').toLowerCase().trim();
    if(kws.some(function(kw){return t.includes(kw);})){els[i].click();return true;}
  }
  return false;
}
function clickMCQAnswer(buttons,answer){
  var ans=(answer||'').toLowerCase().trim();
  var best=null,bestScore=0;
  buttons.forEach(function(b){
    var t=(b.textContent||'').toLowerCase().trim();
    var score=0;
    if(t===ans)score=100;
    else if(t.includes(ans)||ans.includes(t))score=50;
    else{var wa=ans.split(/\s+/),wb=t.split(/\s+/);var hits=wa.filter(function(w){return wb.includes(w);}).length;score=hits/Math.max(wa.length,wb.length)*30;}
    if(score>bestScore){bestScore=score;best=b;}
  });
  if(best&&bestScore>10){best.click();return true;}
  return false;
}

// ── Reader helpers ────────────────────────────────────────────────────────────
function getPassageText(){
  var sel=['[class*="passage"]','[class*="extract"]','[class*="reading"]','[class*="text-content"]','article','[class*="stimulus"]'];
  for(var i=0;i<sel.length;i++){
    var el=document.querySelector(sel[i]);
    if(el&&el.offsetParent&&!isInPanel(el)){var t=(el.innerText||el.textContent||'').trim();if(t.length>100)return t.slice(0,3000);}
  }
  return null;
}
function getMCQ(){
  var divs=document.querySelectorAll('div,section,ul');
  var best=null,bestCount=0;
  for(var i=0;i<divs.length;i++){
    var c=divs[i];
    if(c.offsetParent===null||isInPanel(c))continue;
    var btns=Array.from(c.querySelectorAll('button,[role="button"],[class*="option"],[class*="choice"]')).filter(function(b){
      var t=(b.textContent||'').trim().toLowerCase();
      return b.offsetParent!==null&&!isCookie(b)&&!isInPanel(b)&&t.length>1&&t.length<200;
    });
    if(btns.length>=2&&btns.length<=6&&btns.length>bestCount){best=c;bestCount=btns.length;}
  }
  if(!best||bestCount<2)return null;
  var btns=Array.from(best.querySelectorAll('button,[role="button"],[class*="option"],[class*="choice"]')).filter(function(b){
    var t=(b.textContent||'').trim().toLowerCase();
    return b.offsetParent!==null&&!isCookie(b)&&!isInPanel(b)&&t.length>1&&t.length<200;
  });
  return{container:best,buttons:btns,options:btns.map(function(b){return b.textContent.trim();})};
}
function getQuestionText(){
  var sel=['[class*="question"]','[class*="prompt"]','h2','h3'];
  for(var i=0;i<sel.length;i++){
    var els=document.querySelectorAll(sel[i]);
    for(var j=0;j<els.length;j++){
      var el=els[j];
      if(el.offsetParent&&!isInPanel(el)){var t=(el.innerText||el.textContent||'').trim();if(t.length>5&&t.length<500)return t;}
    }
  }
  return null;
}

// ── Reader loop ───────────────────────────────────────────────────────────────
function readerLoop(){
  if(!running||busy)return;
  watchdog();
  if(hasDialog()){clickKw(['close','dismiss','cancel','got it','ok']);return;}
  if(postRead){
    var mcq=getMCQ(),qText=getQuestionText();
    if(!mcq||!qText||qText===lastQ)return;
    lastQ=qText;setBusy(true);stat('solving...');addLog('Q: '+qText.slice(0,40),'info');
    var passage=storedPassage||getPassageText()||'';
    tryModel(0,'Passage:\n'+passage+'\n\nQuestion: '+qText+'\n\nOptions:\n'+mcq.options.join('\n')+'\n\nOutput ONLY the exact correct option text, nothing else.',function(err,answer){
      if(err){stat('err');addLog(err,'err');setBusy(false);lastQ='';return;}
      addLog('ans: '+answer.slice(0,30),'ok');
      var clicked=clickMCQAnswer(mcq.buttons,answer);
      if(!clicked){
        tryModel(0,'Question: '+qText+'\nOptions:\n'+mcq.options.join('\n')+'\nOutput ONLY the exact correct option text.',function(err2,a2){
          if(!err2&&a2)clicked=clickMCQAnswer(mcq.buttons,a2);
          if(!clicked){addLog('forced #1','warn');mcq.buttons[0].click();}
          stats.ans++;stats.correct++;stats.streak++;updateStats();
          setTimeout(function(){if(cfg.autoAdvance)clickKw(['continue','next']);setTimeout(function(){postRead=false;storedPassage='';lastQ='';setBusy(false);},2500);},rnd(sp().cd[0],sp().cd[1]));
        });return;
      }
      stats.ans++;stats.correct++;stats.streak++;updateStats();
      setTimeout(function(){if(cfg.autoAdvance)clickKw(['continue','next']);setTimeout(function(){postRead=false;storedPassage='';lastQ='';setBusy(false);},2500);},rnd(sp().cd[0],sp().cd[1]));
    });return;
  }
  var readBtn=null,els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    if(!els[i].offsetParent||isInPanel(els[i])||isCookie(els[i]))continue;
    var t=(els[i].textContent||'').toLowerCase().trim();
    if(t==='read'||t==='start reading'||t==='read passage'||t==='begin'){readBtn=els[i];break;}
  }
  if(readBtn&&Date.now()-lastReadClick>3000){
    storedPassage=getPassageText()||'';
    readBtn.click();lastReadClick=Date.now();stat('reading...');addLog('read btn clicked','ok');
    var readTime=Math.min(Math.max((storedPassage.length||600)*sp().ss[0],4000),45000);
    setTimeout(function(){postRead=true;stat('answering...');},readTime);return;
  }
  var mcq2=getMCQ();
  if(mcq2&&!readBtn){if(!storedPassage)storedPassage=getPassageText()||'';postRead=true;}
}

// ── Maths DOM helpers ─────────────────────────────────────────────────────────
function getMathsInput(){
  var inputs=Array.from(document.querySelectorAll('input[type="number"],input[type="text"],input:not([type])'));
  return inputs.find(function(i){
    return i.offsetParent!==null&&!isCookie(i)&&!isInPanel(i)&&!i.readOnly&&
           i.style.display!=='none'&&getComputedStyle(i).display!=='none';
  });
}
var NAV_KW=['back','next','submit','check','continue','skip','hint','watch','got it','answer','zoom','video','save','config','status','log','refresh','inspect','fill field','clear'];
function getMathsMCQ(){
  var divs=document.querySelectorAll('div,section,ul');
  var best=null,bestCount=0;
  for(var i=0;i<divs.length;i++){
    var c=divs[i];
    if(c.offsetParent===null||isInPanel(c))continue;
    var btns=Array.from(c.querySelectorAll('button,[role="button"],[class*="option"],[class*="choice"]')).filter(function(b){
      var t=(b.textContent||'').trim().toLowerCase();
      return b.offsetParent!==null&&!isCookie(b)&&!isInPanel(b)&&
             t.length>0&&t.length<100&&!NAV_KW.some(function(kw){return t===kw;});
    });
    if(btns.length>=2&&btns.length<=6&&btns.length>bestCount){best=c;bestCount=btns.length;}
  }
  if(!best||bestCount<2)return null;
  var btns=Array.from(best.querySelectorAll('button,[role="button"],[class*="option"],[class*="choice"]')).filter(function(b){
    var t=(b.textContent||'').trim().toLowerCase();
    return b.offsetParent!==null&&!isCookie(b)&&!isInPanel(b)&&
           t.length>0&&t.length<100&&!NAV_KW.some(function(kw){return t===kw;});
  });
  return{container:best,buttons:btns,options:btns.map(function(b){return b.textContent.trim();})};
}
function captureFullMathsContext(){
  var chunks=[],seen=new Set();
  document.querySelectorAll('p,span,div,h1,h2,h3,h4,li').forEach(function(el){
    if(el.children.length>8||!el.offsetParent||isInPanel(el))return;
    var t=(el.innerText||el.textContent||'').trim();
    if(t.length<3||t.length>2000)return;
    var key=t.slice(0,60);if(!seen.has(key)){seen.add(key);chunks.push(t);}
  });
  document.querySelectorAll('.katex,.katex-display').forEach(function(kk){
    if(!kk.offsetParent||isInPanel(kk))return;
    var ann=kk.querySelector('annotation[encoding="application/x-tex"]');
    var t=ann?ann.textContent.trim():(kk.innerText||kk.textContent||'').trim();
    if(t&&!seen.has(t)){seen.add(t);chunks.push(t);}
  });
  return chunks.join('\n').slice(0,6000);
}
function getMathsQuestion(){
  var katex=document.querySelectorAll('.katex,.katex-display');
  if(katex.length){
    var parts=[];
    katex.forEach(function(kk){
      if(kk.offsetParent!==null&&!isInPanel(kk)){
        var ann=kk.querySelector('annotation[encoding="application/x-tex"]');
        var t=ann?ann.textContent.trim():(kk.innerText||kk.textContent||'').trim();
        if(t)parts.push(t);
      }
    });
    if(parts.length)return parts.join(' ');
  }
  var inp=getMathsInput();
  var el=inp?inp.parentElement:document.body;
  for(var i=0;i<9;i++){
    if(!el)break;
    var txt=(el.innerText||el.textContent||'').trim();
    var clean=txt.replace(/check|next|submit answer|got it|correct|incorrect|back|watch video|zoom|calculator allowed|enter number|save config|refresh fields|inspect|fill field|clear log/gi,'').replace(/\s+/g,' ').trim();
    if(clean.length>3&&clean.length<600)return clean;
    el=el.parentElement;
  }
  return null;
}

// Returns enabled Submit/Check only
function getCheckBtn(){
  var els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    if(!els[i].offsetParent||isInPanel(els[i]))continue;
    if(els[i].disabled)continue;
    var attr=els[i].getAttribute('disabled');if(attr!==null&&attr!=='false')continue;
    var cls=(els[i].className||'').toLowerCase();
    if(cls.includes('disabled')||cls.includes('inactive')||cls.includes('grey'))continue;
    var t=(els[i].textContent||'').toLowerCase().trim();
    if(t.includes('check')||t.includes('submit')||t==='enter')return els[i];
  }
  return null;
}
function getAnswerProceedBtn(){
  var els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    if(!els[i].offsetParent||isInPanel(els[i]))continue;
    if((els[i].textContent||'').trim().toLowerCase()==='answer')return els[i];
  }
  return null;
}
function getNextMathsBtn(){
  var els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    if(!els[i].offsetParent||isInPanel(els[i]))continue;
    var t=(els[i].textContent||'').toLowerCase().trim();
    if(t==='next'||t==='next question'||t.includes('got it')||t==='continue'||t==='try another')return els[i];
  }
  return null;
}

// Scan and return field status
function scanFields(){
  var inp=getMathsInput();
  var mcq=getMathsMCQ();
  var apb=getAnswerProceedBtn();
  if(apb)return{label:'Answer button found — click to reveal input',color:'#ffcc00'};
  if(inp&&mcq)return{label:'MCQ + number input detected\n'+mcq.options.join(' | '),color:'#00ffaa'};
  if(mcq)return{label:'MCQ only: '+mcq.options.join(' | '),color:'#00ffaa'};
  if(inp)return{label:'Number input detected ('+inp.type+')',color:'#00ffaa'};
  return{label:'No visible editable fields found',color:'#ff4466'};
}

function tryLocalSolve(q){
  if(!q)return null;
  var t=q.replace(/\s+/g,' '),m;
  m=t.match(/(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)/i);if(m)return String(Math.round(parseFloat(m[1])*parseFloat(m[2])*100)/100);
  m=t.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);if(m){var r=parseFloat(m[1])/parseFloat(m[2]);return String(Math.round(r*100)/100);}
  m=t.match(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)/);if(m)return String(Math.round((parseFloat(m[1])+parseFloat(m[2]))*100)/100);
  m=t.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);if(m)return String(Math.round((parseFloat(m[1])-parseFloat(m[2]))*100)/100);
  return null;
}

// Poll for numpad
function waitForNumpad(cb,tries){
  tries=tries||0;
  var numBtns=Array.from(document.querySelectorAll('button')).filter(function(b){
    return b.offsetParent!==null&&!isInPanel(b)&&/^[\d.]$/.test((b.textContent||'').trim());
  });
  if(numBtns.length>=3){cb(true,numBtns);return;}
  if(tries>=12){cb(false,null);return;}
  setTimeout(function(){waitForNumpad(cb,tries+1);},100);
}

// Core fill — tries numpad → InputEvent → execCommand
function doFill(inp,val,cb){
  inp.focus();inp.click();
  waitForNumpad(function(found,numBtns){
    var filled=false;
    if(found){
      var ok=true;
      String(val).split('').forEach(function(d){
        var btn=numBtns.find(function(b){return b.textContent.trim()===d;});
        if(btn)btn.click();else ok=false;
      });
      if(ok){filled=true;mlog('numpad fill: '+val,'ok');}
      else mlog('numpad partial','warn');
    }
    if(!filled){
      try{
        inp.focus();
        var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        setter.call(inp,'');
        inp.dispatchEvent(new Event('input',{bubbles:true}));
        setter.call(inp,String(val));
        inp.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,inputType:'insertText',data:String(val)}));
        inp.dispatchEvent(new Event('change',{bubbles:true}));
        filled=true;mlog('InputEvent fill: '+val,'ok');
      }catch(e){mlog('InputEvent err','err');}
    }
    if(!filled){
      try{inp.focus();document.execCommand('selectAll',false,null);document.execCommand('insertText',false,String(val));filled=true;mlog('execCommand fill: '+val,'ok');}
      catch(e){mlog('all fill methods failed','err');}
    }
    cb(filled);
  });
}

// Manual fill (FILL FIELD button)
function manualFill(val){
  var inp=getMathsInput();
  var mcq=getMathsMCQ();
  if(!inp&&!mcq){mlog('no fields to fill','warn');setFieldStatus('No fields found — refresh first','#ff4466');return;}
  if(mcq){
    var clicked=clickMCQAnswer(mcq.buttons,val);
    mlog('mcq click: '+(clicked?'hit':'miss'),'clicked'?'ok':'warn');
  }
  if(inp){
    doFill(inp,val,function(filled){
      if(!filled){mlog('fill failed','err');return;}
      setTimeout(function(){
        var chk=getCheckBtn();
        if(chk){chk.click();lastAdvance=Date.now();mlog('submitted ✓','ok');stats.ans++;stats.correct++;stats.streak++;updateStats();pendingMathsAnswer=null;currentPageKey='';}
        else mlog('submit greyed — try again','warn');
        setMathsBusy(false);lastMathsQ='';
      },rnd(sp().cd[0],sp().cd[1]));
    });
  }else if(mcq){
    setTimeout(function(){
      var chk=getCheckBtn();
      if(chk){chk.click();lastAdvance=Date.now();mlog('submitted ✓','ok');stats.ans++;stats.correct++;stats.streak++;updateStats();pendingMathsAnswer=null;currentPageKey='';}
      setMathsBusy(false);lastMathsQ='';
    },rnd(600,1000));
  }
}

// Auto fill+submit (called by AI loop)
function fillAndSubmit(val,mcqAnswer,delay){
  var ssp=sp();
  setTimeout(function(){
    var inp=getMathsInput();
    var mcq=getMathsMCQ();
    if(!inp&&!mcq){mlog('no input — retrying','warn');setMathsBusy(false);return;}

    // click MCQ part
    if(mcq&&mcqAnswer){
      var clicked=clickMCQAnswer(mcq.buttons,mcqAnswer);
      mlog('mcq: '+(clicked?'hit':'miss')+' "'+mcqAnswer+'"',clicked?'ok':'warn');
    }

    if(inp&&val){
      setValueInput(val); // show in panel
      doFill(inp,val,function(filled){
        if(!filled){
          mlog('fill failed — try FILL FIELD manually','err');
          setFieldStatus('Fill failed — enter manually and click FILL FIELD','#ff4466');
          setMathsBusy(false);
          return;
        }
        setTimeout(function(){
          var chk=getCheckBtn();
          if(chk){
            chk.click();lastAdvance=Date.now();mlog('submitted ✓','ok');
            setFieldStatus('Submitted ✓','#00ffaa');
            stats.ans++;stats.correct++;stats.streak++;updateStats();
            pendingMathsAnswer=null;currentPageKey='';
            setTimeout(function(){setMathsBusy(false);lastMathsQ='';},1000);
          }else{
            mlog('submit greyed — fill may have failed','warn');
            setFieldStatus('Fill done but submit greyed — click FILL FIELD or wait','#ffcc00');
            setMathsBusy(false);
          }
        },rnd(ssp.cd[0],ssp.cd[1]));
      });
    }else if(mcq&&!inp){
      // MCQ only, no number
      setTimeout(function(){
        var chk=getCheckBtn();
        if(chk){
          chk.click();lastAdvance=Date.now();mlog('submitted ✓','ok');
          stats.ans++;stats.correct++;stats.streak++;updateStats();
          pendingMathsAnswer=null;currentPageKey='';
        }
        setTimeout(function(){setMathsBusy(false);lastMathsQ='';},900);
      },rnd(ssp.cd[0],ssp.cd[1]));
    }else{
      setMathsBusy(false);
    }
  },delay||rnd(500,900));
}

// ── Maths loop ────────────────────────────────────────────────────────────────
function mathsLoop(){
  if(!running||mathsBusy)return;
  watchdog();
  if(hasDialog()){clickKw(['close','dismiss','cancel','got it','ok']);return;}

  // update field status display every loop
  var fs=scanFields();
  setFieldStatus(fs.label,fs.color);

  var nx=getNextMathsBtn();
  if(nx&&Date.now()-lastAdvance>1400){
    nx.click();lastAdvance=Date.now();lastMathsQ='';
    pendingMathsAnswer=null;currentPageKey='';
    mlog('next question','ok');
    setValueInput('');
    return;
  }

  // Answer button — capture context first
  if(Date.now()-lastAnswerClick>3000){
    var apb=getAnswerProceedBtn();
    if(apb){
      storedMathsContext=captureFullMathsContext();
      mlog('ctx captured: '+storedMathsContext.length+' chars','ok');
      apb.click();lastAnswerClick=Date.now();
      mlog('Answer btn clicked','info');
      return;
    }
  }

  var mathsMCQ=getMathsMCQ();
  var inp=getMathsInput();
  if(!mathsMCQ&&!inp)return;

  var qText=getMathsQuestion()||storedMathsContext.slice(0,200)||'unknown';
  var pageKey=(mathsMCQ?mathsMCQ.options.join('|'):'')+'__'+(inp?'inp':'');

  // Retry with cached answer
  if(pageKey===currentPageKey&&pendingMathsAnswer){
    mlog('retry fill (cached)','info');
    setMathsBusy(true);
    setValueInput(pendingMathsAnswer.b||pendingMathsAnswer.a||'');
    fillAndSubmit(pendingMathsAnswer.b,pendingMathsAnswer.a,rnd(400,700));
    return;
  }

  if(qText===lastMathsQ&&pageKey!==currentPageKey)lastMathsQ='';
  if(qText===lastMathsQ)return;

  lastMathsQ=qText;currentPageKey=pageKey;pendingMathsAnswer=null;
  setMathsBusy(true);

  var ticker=setInterval(function(){if(!mathsBusy){clearInterval(ticker);return;}mlog('solving '+(Math.round((Date.now()-mathsBusyAt)/1000))+'s','info');},2000);

  mlog('Q: '+qText.slice(0,50),'info');
  var ctx=storedMathsContext||qText;

  // ── Case 1: MCQ + number ─────────────────────────────────────────────────
  if(mathsMCQ&&inp){
    var prompt='MATHS CONTEXT:\n'+ctx+
      '\n\nPart a) choose one:\n'+mathsMCQ.options.join('\n')+
      '\n\nPart b) calculate the £ amount (integer if whole, 2dp if pence).'+
      '\n\nReturn ONLY valid JSON:\n{"a":"exact option text","b":"number"}';
    tryModel(0,prompt,function(err,answer){
      clearInterval(ticker);
      if(err){mlog(err,'err');setMathsBusy(false);lastMathsQ='';return;}
      mlog('raw: '+answer.slice(0,70),'info');
      var parsed=null;
      try{parsed=JSON.parse(answer.replace(/```json|```/g,'').trim());}catch(e){}
      var choiceVal=parsed&&parsed.a?String(parsed.a):'';
      var numVal='';
      if(parsed&&parsed.b!==undefined&&parsed.b!==null&&String(parsed.b).trim()!==''){
        var nm=String(parsed.b).match(/[-\d.]+/);numVal=nm?nm[0]:'';
      }
      if(!numVal){
        mlog('no number — retrying','warn');
        tryModel(0,'CONTEXT:\n'+ctx+'\n\nWhat is the £ answer for part b)? Output ONLY the number.',function(err2,ans2){
          var nm2=(ans2||'').match(/[-\d.]+/);numVal=nm2?nm2[0]:'';
          mlog('retry b: "'+numVal+'"',numVal?'ok':'warn');
          pendingMathsAnswer={a:choiceVal,b:numVal};
          setValueInput(numVal||choiceVal);
          fillAndSubmit(numVal,choiceVal,rnd(600,1000));
        });return;
      }
      pendingMathsAnswer={a:choiceVal,b:numVal};
      mlog('a: "'+choiceVal+'" b: "'+numVal+'"','ok');
      setValueInput(numVal);
      fillAndSubmit(numVal,choiceVal,rnd(600,1000));
    });return;
  }

  // ── Case 2: MCQ only ─────────────────────────────────────────────────────
  if(mathsMCQ&&!inp){
    tryModel(0,'Maths question:\n'+ctx+'\n\nOptions:\n'+mathsMCQ.options.join('\n')+'\n\nOutput ONLY the exact correct option text, nothing else.',function(err,answer){
      clearInterval(ticker);
      if(err){mlog(err,'err');setMathsBusy(false);lastMathsQ='';return;}
      pendingMathsAnswer={a:answer,b:''};
      mlog('mcq ans: '+answer.slice(0,30),'ok');
      setValueInput(answer);
      fillAndSubmit('',answer,rnd(400,700));
    });return;
  }

  // ── Case 3: number input only ─────────────────────────────────────────────
  if(inp&&!mathsMCQ){
    var local=tryLocalSolve(ctx);
    if(local!==null){
      clearInterval(ticker);
      mlog('local solve: '+local,'ok');
      pendingMathsAnswer={a:'',b:local};
      setValueInput(local);
      fillAndSubmit(local,'',rnd(300,600));return;
    }
    tryModel(0,'Maths question:\n'+ctx+'\n\nAnswer with ONLY the number, no units, no explanation.',function(err,answer){
      clearInterval(ticker);
      if(err){mlog(err,'err');setMathsBusy(false);lastMathsQ='';return;}
      var nm=answer.match(/[-\d.]+/);var val=nm?nm[0]:answer.trim();
      mlog('ans: '+val,'ok');
      pendingMathsAnswer={a:'',b:val};
      setValueInput(val);
      fillAndSubmit(val,'',rnd(400,700));
    });
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
sparxMode=detectMode();
setMode(sparxMode);
setPulse('active');
if(sparxMode==='maths'){
  mlog('phantom started — maths mode','ok');
  var initScan=scanFields();
  setFieldStatus(initScan.label,initScan.color);
}else{
  stat('running — reader mode');
  addLog('phantom started — reader','ok');
}

function loop(){if(!running)return;watchdog();if(sparxMode==='reader')readerLoop();else if(sparxMode==='maths')mathsLoop();}
setInterval(loop,sp().ms);
})();
