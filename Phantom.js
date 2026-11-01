(function(){
'use strict';

// ── Key / Config ─────────────────────────────────────────────────────────────
var K='ph_gemini_key';
var k=localStorage.getItem(K);
if(!k){k=prompt('Gemini API key:');if(!k)return;localStorage.setItem(K,k);}
var SKEY='phantom_v1';
var DEF={model:'gemini-2.5-flash',speed:'normal',autoAdvance:true};
var cfg=Object.assign({},DEF,JSON.parse(localStorage.getItem(SKEY)||'{}'));
var MODELS=['gemini-2.0-flash-lite','gemini-2.0-flash','gemini-2.5-flash-lite','gemini-2.5-flash','gemini-2.5-pro'];
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
    readTimer=null,scrollEl=null,
    storedPassage='',storedMathsContext='',
    sparxMode=null,
    lastMathsQ='',mathsBusy=false,mathsBusyAt=0,
    logs=[],stats={ans:0,correct:0,streak:0};
var panel,stopBtn;

// ── Watchdog ──────────────────────────────────────────────────────────────────
function watchdog(){
  if(busy&&Date.now()-busyAt>15000){busy=false;lastQ='';stat('watchdog reset');}
  if(mathsBusy&&Date.now()-mathsBusyAt>15000){mathsBusy=false;lastMathsQ='';addLog('maths watchdog','warn');}
}
function setBusy(v){busy=v;if(v)busyAt=Date.now();}
function setMathsBusy(v){mathsBusy=v;if(v)mathsBusyAt=Date.now();}
function isInPanel(el){var p=el;while(p){if(panel&&p===panel)return true;if(stopBtn&&p===stopBtn)return true;p=p.parentElement;}return false;}

// ── Logging ───────────────────────────────────────────────────────────────────
function addLog(msg,type){
  logs.unshift({msg:msg,type:type||'info',t:new Date().toLocaleTimeString()});
  if(logs.length>40)logs.pop();
  renderLog();
}
function renderLog(){
  var el=document.getElementById('ph-log');if(!el)return;
  el.innerHTML=logs.map(function(l){
    var c=l.type==='ok'?'#00ffaa':l.type==='warn'?'#ffcc00':l.type==='err'?'#ff4466':'#7799ee';
    return'<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:'+c+'">'+l.t+' '+l.msg+'</div>';
  }).join('');
}

// ── CSS ───────────────────────────────────────────────────────────────────────
var sty=document.createElement('style');
sty.textContent='@keyframes phGlow{0%,100%{box-shadow:0 0 0 1px rgba(0,255,170,.2),0 12px 48px rgba(0,0,0,.9)}50%{box-shadow:0 0 0 1px rgba(0,200,255,.35),0 0 40px rgba(0,200,255,.15),0 12px 48px rgba(0,0,0,.9)}}@keyframes phOrb{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.5);opacity:.85}}@keyframes phScan{0%{top:-2px}100%{top:100%}}@keyframes phPulse{0%,100%{opacity:1}50%{opacity:.2}}@keyframes phFast{0%,100%{opacity:1}50%{opacity:.1}}.ph-wrap{position:fixed;top:16px;left:16px;z-index:2147483647;width:340px;font-family:SF Mono,Fira Code,monospace;user-select:none}.ph-panel{background:rgba(4,6,18,.98);border-radius:18px;overflow:hidden;animation:phGlow 4s ease infinite;position:relative}.ph-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}.ph-orb{position:absolute;border-radius:50%;filter:blur(40px);animation:phOrb 6s ease infinite}.ph-orb1{width:160px;height:160px;background:rgba(0,255,170,.07);top:-40px;right:-20px}.ph-orb2{width:110px;height:110px;background:rgba(0,150,255,.08);bottom:10px;left:-10px;animation-delay:-3s}.ph-scan{position:absolute;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(0,255,170,.3),transparent);animation:phScan 3s linear infinite;pointer-events:none}.ph-inner{position:relative;z-index:1}.ph-header{padding:14px 16px 12px;border-bottom:1px solid rgba(0,255,170,.1);display:flex;align-items:center;justify-content:space-between;cursor:move}.ph-logo{display:flex;align-items:center;gap:10px}.ph-icon{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#00ffaa,#0066ff);display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 14px rgba(0,255,170,.5);color:#000;font-weight:900}.ph-name{font-size:15px;font-weight:800;letter-spacing:2px;background:linear-gradient(90deg,#00ffaa,#00ccff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}.ph-badge{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:3px 11px;border-radius:20px;background:rgba(0,255,170,.1);border:1px solid rgba(0,255,170,.3);color:rgba(0,255,170,.9)}.ph-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:10px 14px}.ph-stat{background:rgba(255,255,255,.03);border:1px solid rgba(0,255,170,.1);border-radius:10px;padding:7px 4px;text-align:center}.ph-stat-n{font-size:26px;font-weight:800;background:linear-gradient(135deg,#00ffaa,#00aaff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.1}.ph-stat-l{font-size:10px;color:rgba(100,200,160,.6);letter-spacing:1px;text-transform:uppercase;margin-top:2px}.ph-status{display:flex;align-items:center;gap:9px;padding:8px 14px;background:rgba(0,0,0,.4);border-top:1px solid rgba(0,255,170,.06);border-bottom:1px solid rgba(0,255,170,.06)}.ph-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.ph-dot.idle{background:#444}.ph-dot.active{background:#00ffaa;animation:phPulse 1.5s ease infinite}.ph-dot.thinking{background:#ffcc00;animation:phFast .4s ease infinite}.ph-dot.err{background:#ff4466}.ph-stxt{font-size:13px;color:rgba(200,240,220,.9);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.ph-tabs{display:flex;border-bottom:1px solid rgba(0,255,170,.08)}.ph-tab{flex:1;text-align:center;padding:8px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(120,160,140,.5);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;transition:all .2s;font-family:inherit}.ph-tab.on{color:#00ffaa;border-bottom-color:#00ffaa}.ph-body{padding:12px 14px 14px}.ph-lbl{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:rgba(100,200,160,.5);display:block;margin-top:10px}.ph-sel{width:100%;background:rgba(4,14,10,.95);border:1px solid rgba(0,255,170,.2);color:#cceedc;border-radius:8px;padding:6px 9px;font:12px SF Mono,monospace;outline:none;margin-top:4px}.ph-btn{width:100%;margin-top:10px;padding:8px;background:linear-gradient(135deg,rgba(0,255,170,.12),rgba(0,150,255,.1));border:1px solid rgba(0,255,170,.25);color:#00ffaa;border-radius:10px;font:700 12px SF Mono,monospace;cursor:pointer;letter-spacing:1px;font-family:inherit}.ph-tog{position:relative;display:inline-block;width:38px;height:20px}.ph-tog input{opacity:0;width:0;height:0}.ph-sl{position:absolute;cursor:pointer;inset:0;background:rgba(255,255,255,.07);border-radius:20px;transition:.3s;border:1px solid rgba(0,255,170,.15)}.ph-sl:before{position:absolute;content:"";height:14px;width:14px;left:2px;bottom:2px;background:#555;border-radius:50%;transition:.3s}input:checked+.ph-sl{background:rgba(0,255,170,.3);border-color:rgba(0,255,170,.5)}input:checked+.ph-sl:before{transform:translateX(18px);background:#00ffaa}.ph-log-wrap{max-height:140px;overflow-y:auto}.ph-log-wrap::-webkit-scrollbar{width:3px}.ph-log-wrap::-webkit-scrollbar-thumb{background:rgba(0,255,170,.25);border-radius:2px}.ph-passage{font-size:10px;color:rgba(80,130,100,.7);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ph-adv-row{display:flex;align-items:center;justify-content:space-between;margin-top:12px}.ph-adv-lbl{font-size:11px;color:rgba(0,255,170,.6)}';
document.head.appendChild(sty);

// ── Stop button ───────────────────────────────────────────────────────────────
stopBtn=document.createElement('div');
stopBtn.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;background:rgba(20,0,10,.97);color:#ff4466;padding:8px 20px;border-radius:20px;font:700 13px monospace;cursor:pointer;border:1px solid rgba(255,68,102,.4);letter-spacing:1px;';
stopBtn.textContent='◼ STOP';
stopBtn.onclick=function(){running=false;if(readTimer)clearInterval(readTimer);if(panel)panel.remove();stopBtn.remove();};
document.body.appendChild(stopBtn);

// ── Panel ─────────────────────────────────────────────────────────────────────
panel=document.createElement('div');
panel.className='ph-wrap';
panel.innerHTML='<div class="ph-panel"><div class="ph-bg"><div class="ph-orb ph-orb1"></div><div class="ph-orb ph-orb2"></div><div class="ph-scan"></div></div><div class="ph-inner"><div class="ph-header" id="ph-hdr"><div class="ph-logo"><div class="ph-icon">⚡</div><div class="ph-name">PHANTOM</div></div><div class="ph-badge" id="ph-mode">INIT</div></div><div class="ph-stats"><div class="ph-stat"><div class="ph-stat-n" id="ph-ans">0</div><div class="ph-stat-l">Answered</div></div><div class="ph-stat"><div class="ph-stat-n" id="ph-cor">0</div><div class="ph-stat-l">Correct</div></div><div class="ph-stat"><div class="ph-stat-n" id="ph-str">0</div><div class="ph-stat-l">Streak</div></div></div><div class="ph-status"><div class="ph-dot idle" id="ph-dot"></div><div class="ph-stxt" id="ph-stxt">initialising...</div></div><div class="ph-tabs"><button class="ph-tab on" id="ph-t1" onclick="document.getElementById(\'ph-s\').style.display=\'block\';document.getElementById(\'ph-l\').style.display=\'none\';document.getElementById(\'ph-t1\').className=\'ph-tab on\';document.getElementById(\'ph-t2\').className=\'ph-tab\';">SETTINGS</button><button class="ph-tab" id="ph-t2" onclick="document.getElementById(\'ph-s\').style.display=\'none\';document.getElementById(\'ph-l\').style.display=\'block\';document.getElementById(\'ph-t2\').className=\'ph-tab on\';document.getElementById(\'ph-t1\').className=\'ph-tab\';">LOG</button></div><div class="ph-body"><div id="ph-s"><span class="ph-lbl">Model</span><select class="ph-sel" id="ph-model"></select><span class="ph-lbl">Speed</span><select class="ph-sel" id="ph-speed"><option value="slow">Slow (safer)</option><option value="normal">Normal</option><option value="fast">Fast</option></select><div class="ph-adv-row"><span class="ph-adv-lbl">Auto-advance</span><label class="ph-tog"><input type="checkbox" id="ph-adv"><span class="ph-sl"></span></label></div><button class="ph-btn" id="ph-save">SAVE CONFIG</button><div class="ph-passage" id="ph-psg"></div></div><div id="ph-l" style="display:none"><div class="ph-log-wrap"><div id="ph-log"></div></div></div></div></div></div>';
document.body.appendChild(panel);

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

// draggable
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
  var a=document.getElementById('ph-ans');var c=document.getElementById('ph-cor');var st=document.getElementById('ph-str');
  if(a)a.textContent=stats.ans;if(c)c.textContent=stats.correct;if(st)st.textContent=stats.streak;
}
function setMode(m){sparxMode=m;var b=document.getElementById('ph-mode');if(b)b.textContent=m?m.toUpperCase():'AUTO';}

// ── Mode detection ────────────────────────────────────────────────────────────
function detectMode(){
  var url=window.location.href;
  if(url.includes('/maths')||url.includes('/math')||document.title.toLowerCase().includes('maths'))return'maths';
  if(url.includes('/reader')||url.includes('/reading')||document.title.toLowerCase().includes('reader'))return'reader';
  if(document.querySelectorAll('[class*="passage"],[class*="reading"],[class*="extract"]').length)return'reader';
  if(document.querySelector('input[type="number"]'))return'maths';
  return'reader';
}

// ── Gemini API ────────────────────────────────────────────────────────────────
function tryModel(idx,prompt,cb){
  if(idx>=MODELS.length){cb('all models failed',null);return;}
  var model=cfg.model;
  // on retry, walk the list
  if(idx>0){
    var list=MODELS.filter(function(m){return m!==cfg.model;});
    model=list[idx-1]||MODELS[idx];
  }
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
    if(d.error){addLog('api: '+d.error.message,'err');tryModel(idx+1,prompt,cb);return;}
    var t=d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts&&d.candidates[0].content.parts[0]&&d.candidates[0].content.parts[0].text;
    if(!t){tryModel(idx+1,prompt,cb);return;}
    cb(null,t.trim());
  }).catch(function(){addLog('fetch err','err');tryModel(idx+1,prompt,cb);});
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
    else{
      var wa=ans.split(/\s+/),wb=t.split(/\s+/);
      var hits=wa.filter(function(w){return wb.includes(w);}).length;
      score=hits/Math.max(wa.length,wb.length)*30;
    }
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
    if(el&&el.offsetParent&&!isInPanel(el)){
      var t=(el.innerText||el.textContent||'').trim();
      if(t.length>100)return t.slice(0,3000);
    }
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
      if(el.offsetParent&&!isInPanel(el)){
        var t=(el.innerText||el.textContent||'').trim();
        if(t.length>5&&t.length<500)return t;
      }
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
    var mcq=getMCQ();
    var qText=getQuestionText();
    if(!mcq||!qText)return;
    if(qText===lastQ)return;
    lastQ=qText;
    setBusy(true);
    stat('solving...');
    addLog('Q: '+qText.slice(0,40),'info');
    var passage=storedPassage||getPassageText()||'';
    var prompt='Passage:\n'+passage+'\n\nQuestion: '+qText+'\n\nOptions:\n'+mcq.options.join('\n')+'\n\nOutput ONLY the exact correct option text, nothing else.';
    tryModel(0,prompt,function(err,answer){
      if(err){stat('err');addLog(err,'err');setBusy(false);lastQ='';return;}
      addLog('ans: '+answer.slice(0,30),'ok');
      var clicked=clickMCQAnswer(mcq.buttons,answer);
      if(!clicked){
        tryModel(0,'Question: '+qText+'\nOptions:\n'+mcq.options.join('\n')+'\nOutput ONLY the exact correct option text.',function(err2,answer2){
          if(!err2&&answer2)clicked=clickMCQAnswer(mcq.buttons,answer2);
          if(!clicked){addLog('forced pick #1','warn');mcq.buttons[0].click();}
          stats.ans++;stats.correct++;stats.streak++;updateStats();
          setTimeout(function(){
            if(cfg.autoAdvance)clickKw(['continue','next']);
            setTimeout(function(){postRead=false;storedPassage='';lastQ='';setBusy(false);},2500);
          },rnd(sp().cd[0],sp().cd[1]));
        });
        return;
      }
      stats.ans++;stats.correct++;stats.streak++;updateStats();
      setTimeout(function(){
        if(cfg.autoAdvance)clickKw(['continue','next']);
        setTimeout(function(){postRead=false;storedPassage='';lastQ='';setBusy(false);},2500);
      },rnd(sp().cd[0],sp().cd[1]));
    });
    return;
  }

  var readBtn=null;
  var els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    if(!els[i].offsetParent||isInPanel(els[i])||isCookie(els[i]))continue;
    var t=(els[i].textContent||'').toLowerCase().trim();
    if(t==='read'||t==='start reading'||t==='read passage'||t==='begin'){readBtn=els[i];break;}
  }
  if(readBtn&&Date.now()-lastReadClick>3000){
    storedPassage=getPassageText()||'';
    var psgEl=document.getElementById('ph-psg');if(psgEl)psgEl.textContent=storedPassage.slice(0,60)+'...';
    readBtn.click();lastReadClick=Date.now();stat('reading...');addLog('read btn clicked','ok');
    var ssp=sp();
    var charCount=storedPassage.length||600;
    var readTime=Math.min(Math.max(charCount*ssp.ss[0],4000),45000);
    setTimeout(function(){postRead=true;stat('answering...');addLog('read done','ok');},readTime);
    return;
  }

  var mcq2=getMCQ();
  if(mcq2&&!readBtn){
    if(!storedPassage)storedPassage=getPassageText()||'';
    postRead=true;
  }
}

// ── Maths helpers ─────────────────────────────────────────────────────────────
function getMathsInput(){
  var inputs=Array.from(document.querySelectorAll('input[type="number"],input[type="text"],input:not([type])'));
  return inputs.find(function(i){
    return i.offsetParent!==null&&!isCookie(i)&&!isInPanel(i)&&!i.readOnly&&i.style.display!=='none'&&getComputedStyle(i).display!=='none';
  });
}

var NAV_KW=['back','next','submit','check','continue','skip','hint','watch','got it','answer','zoom','video','save','config','status','log'];

function getMathsMCQ(){
  var divs=document.querySelectorAll('div,section,ul');
  var best=null,bestCount=0;
  for(var i=0;i<divs.length;i++){
    var c=divs[i];
    if(c.offsetParent===null||isInPanel(c))continue;
    var btns=Array.from(c.querySelectorAll('button,[role="button"],[class*="option"],[class*="choice"]')).filter(function(b){
      var t=(b.textContent||'').trim().toLowerCase();
      return b.offsetParent!==null&&!isCookie(b)&&!isInPanel(b)&&t.length>0&&t.length<100&&!NAV_KW.some(function(kw){return t===kw;});
    });
    if(btns.length>=2&&btns.length<=6&&btns.length>bestCount){best=c;bestCount=btns.length;}
  }
  if(!best||bestCount<2)return null;
  var btns=Array.from(best.querySelectorAll('button,[role="button"],[class*="option"],[class*="choice"]')).filter(function(b){
    var t=(b.textContent||'').trim().toLowerCase();
    return b.offsetParent!==null&&!isCookie(b)&&!isInPanel(b)&&t.length>0&&t.length<100&&!NAV_KW.some(function(kw){return t===kw;});
  });
  return{container:best,buttons:btns,options:btns.map(function(b){return b.textContent.trim();})};
}

// Captures everything visible on the current page — used before clicking Answer
function captureFullMathsContext(){
  var chunks=[],seen=new Set();
  document.querySelectorAll('p,span,div,h1,h2,h3,h4,li').forEach(function(el){
    if(el.children.length>8||!el.offsetParent||isInPanel(el))return;
    var t=(el.innerText||el.textContent||'').trim();
    if(t.length<3||t.length>2000)return;
    var key=t.slice(0,60);
    if(!seen.has(key)){seen.add(key);chunks.push(t);}
  });
  // KaTeX math expressions
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
    var clean=txt.replace(/check|next|submit answer|got it|correct|incorrect|back|watch video|zoom|calculator allowed|enter number|save config/gi,'').replace(/\s+/g,' ').trim();
    if(clean.length>3&&clean.length<600)return clean;
    el=el.parentElement;
  }
  return null;
}

function getCheckBtn(){
  var els=document.querySelectorAll('button,a,[role="button"]');
  for(var i=0;i<els.length;i++){
    if(!els[i].offsetParent||isInPanel(els[i]))continue;
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

function setInputNative(inp,val){
  try{
    inp.focus();
    var setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    // clear first
    setter.call(inp,'');
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    // set value
    setter.call(inp,String(val));
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    inp.dispatchEvent(new Event('change',{bubbles:true}));
    // per-character keyboard events for React controlled inputs
    String(val).split('').forEach(function(ch){
      inp.dispatchEvent(new KeyboardEvent('keydown',{key:ch,code:'Key'+ch.toUpperCase(),bubbles:true}));
      inp.dispatchEvent(new KeyboardEvent('keypress',{key:ch,bubbles:true}));
      inp.dispatchEvent(new KeyboardEvent('keyup',{key:ch,code:'Key'+ch.toUpperCase(),bubbles:true}));
    });
    return true;
  }catch(e){
    try{inp.value=String(val);return true;}catch(e2){return false;}
  }
}

function clickNumpad(val){
  var numBtns=Array.from(document.querySelectorAll('button')).filter(function(b){
    return b.offsetParent!==null&&!isInPanel(b)&&/^[\d.]$/.test((b.textContent||'').trim());
  });
  if(numBtns.length<3)return false;
  var success=true;
  String(val).split('').forEach(function(d){
    var btn=numBtns.find(function(b){return b.textContent.trim()===d;});
    if(btn)btn.click();else success=false;
  });
  return success;
}

function tryLocalSolve(q){
  if(!q)return null;
  var t=q.replace(/\s+/g,' ');
  var m;
  m=t.match(/(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)/i);
  if(m)return String(Math.round(parseFloat(m[1])*parseFloat(m[2])*100)/100);
  m=t.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if(m){var r=parseFloat(m[1])/parseFloat(m[2]);return String(Math.round(r*100)/100);}
  m=t.match(/(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)/);
  if(m)return String(Math.round((parseFloat(m[1])+parseFloat(m[2]))*100)/100);
  m=t.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if(m)return String(Math.round((parseFloat(m[1])-parseFloat(m[2]))*100)/100);
  return null;
}

// Focus input → wait for numpad to render → click numpad digits → fallback to native setter → submit
function fillAndSubmit(val,delay){
  var ssp=sp();
  setTimeout(function(){
    var i2=getMathsInput();
    if(!i2){setMathsBusy(false);lastMathsQ='';addLog('no input found','warn');return;}
    // Step 1: focus so numpad renders
    i2.focus();
    i2.click();
    setTimeout(function(){
      // Step 2: try numpad (now visible after focus)
      var usedNumpad=clickNumpad(val);
      addLog('numpad: '+(usedNumpad?'ok':'miss — using native'),'info');
      if(!usedNumpad){
        setInputNative(i2,val);
      }
      // Step 3: submit
      setTimeout(function(){
        var chk=getCheckBtn();
        if(!chk){
          // scroll down in case Submit is below viewport
          window.scrollBy(0,300);
          setTimeout(function(){
            chk=getCheckBtn();
            if(chk){chk.click();lastAdvance=Date.now();addLog('submit','ok');}
            setTimeout(function(){setMathsBusy(false);lastMathsQ='';},900);
          },400);
        }else{
          chk.click();lastAdvance=Date.now();addLog('submit','ok');
          setTimeout(function(){setMathsBusy(false);lastMathsQ='';},900);
        }
      },rnd(ssp.cd[0],ssp.cd[1]));
    },450); // wait for numpad to appear after focus
  },delay||rnd(500,900));
}

// ── Maths loop ────────────────────────────────────────────────────────────────
function mathsLoop(){
  if(!running||mathsBusy)return;
  watchdog();
  if(hasDialog()){clickKw(['close','dismiss','cancel','got it','ok']);return;}

  // advance after correct answer
  var nx=getNextMathsBtn();
  if(nx&&Date.now()-lastAdvance>1400){nx.click();lastAdvance=Date.now();lastMathsQ='';addLog('next','ok');return;}

  // click Answer button to get to input page — capture context first
  if(Date.now()-lastAnswerClick>3000){
    var apb=getAnswerProceedBtn();
    if(apb){
      storedMathsContext=captureFullMathsContext();
      addLog('ctx: '+storedMathsContext.length+' chars','ok');
      apb.click();
      lastAnswerClick=Date.now();
      stat('opening input...');
      addLog('answer btn clicked','ok');
      return;
    }
  }

  var mathsMCQ=getMathsMCQ();
  var inp=getMathsInput();
  var qText=getMathsQuestion()||storedMathsContext.slice(0,200);
  if(!qText||qText===lastMathsQ)return;
  if(!mathsMCQ&&!inp)return;

  lastMathsQ=qText;
  setMathsBusy(true);

  var ticker=setInterval(function(){
    if(!mathsBusy){clearInterval(ticker);return;}
    stat('solving '+(Math.round((Date.now()-mathsBusyAt)/1000))+'s');
  },1000);

  addLog('Q: '+qText.slice(0,40),'info');

  // Full context to send Gemini — prefer stored (has the numbers from question page)
  var ctx=storedMathsContext||qText;

  // ── Case 1: MCQ select + number input (multi-part) ────────────────────────
  if(mathsMCQ&&inp){
    var prompt='MATHS QUESTION CONTEXT:\n'+ctx+'\n\nPart a) choose one of these options:\n'+mathsMCQ.options.join('\n')+'\n\nPart b) calculate the £ amount (use 2 decimal places only if there are pence, otherwise integer).\n\nReturn ONLY valid JSON, no other text:\n{"a":"exact option text","b":"number"}';
    tryModel(0,prompt,function(err,answer){
      clearInterval(ticker);
      if(err){stat('err');addLog(err,'err');setMathsBusy(false);lastMathsQ='';return;}
      addLog('raw: '+answer.slice(0,70),'info');

      var parsed=null;
      try{parsed=JSON.parse(answer.replace(/```json|```/g,'').trim());}catch(e){}

      // click part a
      if(parsed&&parsed.a){
        var clicked=clickMCQAnswer(mathsMCQ.buttons,String(parsed.a));
        addLog('a: '+(clicked?'hit':'miss')+' "'+String(parsed.a).slice(0,20)+'"',clicked?'ok':'warn');
      }

      // extract part b number — handle string or numeric from Gemini
      var numVal='';
      if(parsed&&parsed.b!==undefined&&parsed.b!==null&&String(parsed.b).trim()!==''){
        var raw=String(parsed.b);
        var nm=raw.match(/[-\d.]+/);
        numVal=nm?nm[0]:'';
      }
      addLog('b: "'+numVal+'"',numVal?'ok':'warn');

      stats.ans++;stats.correct++;stats.streak++;updateStats();

      if(numVal){
        fillAndSubmit(numVal,rnd(600,1000));
      }else{
        // Gemini didn't give a number — retry with a number-only prompt
        addLog('retrying for number...','warn');
        tryModel(0,'CONTEXT:\n'+ctx+'\n\nBased on the above, what is the £ amount for part b)? Output ONLY the number, nothing else.',function(err2,ans2){
          var nm2=(ans2||'').match(/[-\d.]+/);
          var v=nm2?nm2[0]:'';
          addLog('retry b: "'+v+'"',v?'ok':'warn');
          if(v){
            fillAndSubmit(v,rnd(400,700));
          }else{
            var chk=getCheckBtn();
            if(chk){chk.click();lastAdvance=Date.now();}
            setTimeout(function(){setMathsBusy(false);lastMathsQ='';},900);
          }
        });
      }
    });
    return;
  }

  // ── Case 2: MCQ only ──────────────────────────────────────────────────────
  if(mathsMCQ&&!inp){
    tryModel(0,'Maths question:\n'+ctx+'\n\nOptions:\n'+mathsMCQ.options.join('\n')+'\n\nOutput ONLY the exact correct option text, nothing else.',function(err,answer){
      clearInterval(ticker);
      if(err){stat('err');addLog(err,'err');setMathsBusy(false);lastMathsQ='';return;}
      var clicked=clickMCQAnswer(mathsMCQ.buttons,answer);
      addLog('mcq: '+(clicked?'hit':'miss')+' '+answer.slice(0,20),clicked?'ok':'warn');
      if(clicked){
        stats.ans++;stats.correct++;stats.streak++;updateStats();
        lastAdvance=Date.now();
        setTimeout(function(){
          var chk=getCheckBtn();
          if(chk){chk.click();addLog('submit','ok');}
          setTimeout(function(){setMathsBusy(false);lastMathsQ='';},900);
        },rnd(sp().cd[0],sp().cd[1]));
      }else{
        setMathsBusy(false);lastMathsQ='';
      }
    });
    return;
  }

  // ── Case 3: number input only ─────────────────────────────────────────────
  if(inp&&!mathsMCQ){
    var local=tryLocalSolve(ctx);
    if(local!==null){
      clearInterval(ticker);
      stat(local);addLog('local: '+local,'ok');
      stats.ans++;stats.correct++;stats.streak++;updateStats();
      fillAndSubmit(local,rnd(300,600));
      return;
    }
    tryModel(0,'Maths question:\n'+ctx+'\n\nAnswer with ONLY the number, no units, no explanation.',function(err,answer){
      clearInterval(ticker);
      if(err){stat('err');addLog(err,'err');setMathsBusy(false);lastMathsQ='';return;}
      var nm=answer.match(/[-\d.]+/);
      var val=nm?nm[0]:answer.trim();
      stat(val);addLog('ans: '+val,'ok');
      stats.ans++;stats.correct++;stats.streak++;updateStats();
      fillAndSubmit(val,rnd(400,700));
    });
  }
}

// ── Init + loop ───────────────────────────────────────────────────────────────
sparxMode=detectMode();
setMode(sparxMode);
stat('running — '+sparxMode+' mode');
setPulse('active');
addLog('phantom started — '+sparxMode,'ok');

function loop(){if(!running)return;watchdog();if(sparxMode==='reader')readerLoop();else if(sparxMode==='maths')mathsLoop();}
setInterval(loop,sp().ms);
})();
