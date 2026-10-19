import fs from "fs";
let h = fs.readFileSync("index.html", "utf8");
const head = `<script>
window.__errs=[];
function __logErr(e){ try{ window.__errs.push((e && (e.stack || e.message)) || String(e)); }catch(_){} }
window.addEventListener('error', function(ev){ __logErr(ev.error || ev.message); });
window.addEventListener('unhandledrejection', function(ev){ __logErr(ev.reason); });
(function(){
  var st=window.setTimeout, si=window.setInterval;
  window.setTimeout=function(fn,d){ return st(function(){ try{ if(typeof fn==='function'){fn();}else{eval(fn);} }catch(e){ __logErr(e); } }, d); };
  window.setInterval=function(fn,d){ return si(function(){ try{ if(typeof fn==='function'){fn();}else{eval(fn);} }catch(e){ __logErr(e); } }, d); };
})();
<\/script>
`;
h = h.replace("</head>", head + "</head>");
const drv = `<script>
(function(){
  window.__bpFastSim = 1; window.__bpShotSkipMvp = 1;
  var games=0, guard=0, last='boot', phase='custom', clicks=0;
  var answers=[]; var TG='' + Date.now(); var TN='SMK'+TG.slice(-6); var PN='Guy'+TG.slice(-6); var SN='Star'+TG.slice(-6); var QN='Pool'+TG.slice(-6);
  var checks={log:false, chart:false, objcap:false, cm:false, grade:false, pom:false, pk:false, recap:false, eve:false};
  window.prompt=function(msg, def){ var a=answers.shift(); return a===undefined ? def : a; };
  window.confirm=function(){ return true; };
  window.alert=function(){};
  function vis(id){ var e=document.getElementById(id); return e && e.classList.contains('active'); }
  function q(s){ return document.querySelector(s); }
  function qa(s){ return document.querySelectorAll(s); }
  var trace=[];
  function mark(t){ last=t; trace.push(t.replace(/^(home|draft|assign|analysis|sim|series)[^|]*/,'$1')); if (trace.length>10) trace.shift(); document.title=t+' || '+trace.join(' > '); }
  function setVal(el,v){ el.value=v; el.dispatchEvent(new Event('change')); }
  var fatal=null;
  function fail(t){ fatal=t; mark('SMOKE FAIL ' + t); }
  function tick(){
    if (fatal) { mark('SMOKE FAIL ' + fatal + ' || last=' + last); return; }
    if (++guard > 90000) { mark('SMOKE TIMEOUT ' + last); return; }
    try{
      if (phase==='custom') {
        phase='custom-run';
        document.getElementById('btn-editor').click();
        answers=[TN,'SMK','#e23b3b','#1b2333'];
        document.getElementById('btn-add-team').click();
        var es=document.getElementById('editor-team');
        if (es.value!==TN) { fail('team='+es.value); return; }

        q('#np-name').value=PN;
        setVal(q('#np-team'),TN);
        setVal(q('#np-role'),'mid');
        q('#np-champs').value='Ahri, 阿狸, DefNotAChamp';
        document.getElementById('btn-create-player').click();
        var made=false;
        qa('#editor-list .editor-row[data-key]').forEach(function(r){ if (r.dataset.key.indexOf(PN)>=0) made=true; });
        if (!made) { fail('create-player'); return; }

        var row=null;
        qa('#editor-list .editor-row[data-key]').forEach(function(r){ if (r.dataset.key===TN+'|'+PN) row=r; });
        if (!row) { fail('no-row'); return; }
        row.querySelector('button[data-act="transfer"]').click();
        if (!q('#modal-transfer').classList.contains('open')) { fail('transfer-modal'); return; }
        q('#transfer-team').value='T1';
        document.getElementById('btn-transfer-ok').click();
        setVal(q('#editor-team'),'T1');
        var moved=false;
        qa('#editor-list .editor-row[data-key]').forEach(function(r){ if (r.dataset.key==='T1|'+PN) moved=true; });
        if (!moved) { fail('transfer-not-applied'); return; }

        setVal(q('#editor-team'),TN);
        answers=[SN,'mid'];
        document.getElementById('btn-add-player').click();
        setVal(q('#editor-team'),'__pool__');
        answers=[QN,'jg'];
        document.getElementById('btn-add-player').click();
        setVal(q('#editor-team'),TN);
        var prow=null;
        qa('#editor-list .editor-row[data-key]').forEach(function(r){ if (r.dataset.key===TN+'|'+SN) prow=r; });
        if (!prow) { fail('no-star-row'); return; }
        var pbtn=prow.querySelector('button[data-act="pool"]');
        if (!pbtn) { fail('no-pool-btn'); return; }
        var saveBtn=document.getElementById('btn-save-all');
        var stateEl=document.getElementById('save-state');
        if (!saveBtn || !stateEl) { fail('save-btn-missing'); return; }
        var inp=prow.querySelector('input[data-f="a"]');
        if (!inp) { fail('no-editor-input'); return; }
        inp.value='88';
        inp.dispatchEvent(new Event('change', {bubbles:true}));
        var dirty=stateEl.className.indexOf('is-dirty')>=0;
        saveBtn.click();
        var saved=stateEl.className.indexOf('is-saved')>=0;
        checks.save = dirty && saved;
        if (!checks.save) { fail('save-state dirty='+dirty+' saved='+saved+' cls='+stateEl.className); return; }
        pbtn.click();
        var close=q('#modal-editor .close-btn');
        if (close) close.click();

        var opts=document.getElementById('home-blue-team').options;
        var hasTeam=false; for (var i=0;i<opts.length;i++) if (opts[i].value===TN) hasTeam=true;
        var roster=document.getElementById('home-blue-roster').innerHTML;
        checks.team = hasTeam;
        checks.player = true; checks.create = true; checks.transfer = true; checks.pool = roster.indexOf('自由') >= 0;        mark('CUSTOM OK team='+hasTeam+' poolInRoster='+(roster.indexOf('自由')>=0));

        document.getElementById('playmode-switch').querySelector('[data-pm="pve"]').click();
        // 执红方队伍：整场跟着这支队伍，换边后也不能变成执边
        var myTeam=document.getElementById('home-red-team').value;
        setVal(document.getElementById('myside-team'), myTeam);
        document.getElementById('prof-switch').querySelector('[data-prof="control"]').click();
        phase='pve';
        setTimeout(tick, 30);
        return;
      }

      if (vis('screen-home')) {
        mark('home phase=' + phase + ' ->start');
        document.getElementById('btn-start').click();
      } else if (vis('screen-draft')) {
        var s=window.__bp.series;
        var banner=document.getElementById('turn-banner').textContent;
        var curStep=window.Draft.curStep(s);
        var mine=window.__bpTest.mySideNow();
        mark('draft phase=' + phase + ' step=' + (curStep && curStep.side) + '/' + (curStep && curStep.type) + ' mine=' + mine + ' b=' + banner.slice(0, 12));
        if (phase==='pve' && curStep) checks.follow = (window.__bpTest.isMySide(mine) && window.__bp.myTeam &&
          (window.__bp.myTeam === (s.cur[mine])));
        if (phase==='eve') checks.follow = true; // AI 对 AI 不涉及执队
        // 解说席：出现的第一手要有评价标签，开关能生效
        var cbox=document.getElementById('caster');
        if ((phase==='pve'||phase==='eve') && cbox && !cbox.hidden && qa('#caster .cs-tag').length) {
          checks.caster=true;
          var cbtn=document.getElementById('btn-caster');
          if (cbtn && !cbtn.dataset.t3) { cbtn.dataset.t3='1'; cbtn.click();
            checks.casterOff=(document.getElementById('caster').hidden===true);
            cbtn.click();
          }
        }
        if (banner.indexOf('BP 结束')<0 && phase==='pve' && curStep && curStep.side===mine) {
          var cell=q('#champ-grid .champ-cell:not(.dead)');
          if (cell) cell.click();
        }
        var log=document.getElementById('ai-log');
        if (log && !log.hidden && qa('#ai-log .ail-item').length && qa('#ai-log .ail-why li').length) checks.log=true;
        if (phase==='eve') {
          var sp=q('#ai-log [data-ail="speed"]');
          var pa=q('#ai-log [data-ail="pause"]');
          if (pa && !pa.dataset.t1) { pa.dataset.t1='1'; pa.click(); setTimeout(function(){ try{ pa.click(); }catch(e){} }, 80); }
          if (sp && !sp.dataset.t2) { sp.dataset.t2='1'; sp.click(); }
        }
      } else if (vis('screen-assign')) {
        mark('assign phase=' + phase);
        document.getElementById('btn-confirm-assign').click();
      } else if (vis('screen-analysis')) {
        mark('analysis phase=' + phase);
        var bpq=document.getElementById('panel-bpq');
        if (!bpq || bpq.innerHTML.length<50) { fail('bpq-panel'); return; }
        if (!q('#panel-bpq .bpq-style')) { fail('bpq-style-missing'); return; }
        checks.style = q('#panel-bpq .bpq-style em').textContent.indexOf('契合') >= 0;
        if (!checks.style) { fail('bpq-style-text'); return; }
        document.getElementById('btn-sim').click();
      } else if (vis('screen-sim')) {
        mark('sim phase=' + phase + ' games=' + games + ' actions=' + document.getElementById('sim-actions').children.length +
          ' se=' + !!document.getElementById('btn-series-end') + ' nb=' + !!q('#sim-actions button[data-next]') + ' pom=' + !!q('.series-pom') +
          ' seRuns=' + (window.__seRuns || 0) + ' err=' + window.__errs.length);
        var acts=document.getElementById('sim-actions');
        if (acts && acts.children.length>0) {
          if (!q('#sim-chart svg.gchart')) { fail('chart-missing'); return; }
          if (!qa('#sim-objs .obj-chip').length) { fail('objectives-missing'); return; }
          if (!document.getElementById('sim-objcap').textContent) { fail('objcap-empty'); return; }
          if (qa('#comments-card .cm-item').length<10) { fail('comments-few'); return; }
          if (!qa('#comments-card .grade').length) { fail('grade-missing'); return; }
          checks.chart=true; checks.cm=true; checks.grade=true; checks.objcap=true;
          var mm=document.getElementById('modal-mvp');
          if (mm && !window.__mvpChecked && window.__bp.results && window.__bp.results.length) {
            window.__mvpChecked = 1;
            var lastRes=window.__bp.results[window.__bp.results.length-1];
            try { window.__bpTest.openMvp(lastRes); } catch(e) { fail('mvp-throw ' + (e && e.message)); return; }
            if (!mm.classList.contains('open')) { fail('mvp-not-open'); return; }
            checks.mvp = qa('#mvp-team-row .mtr-card').length === 5;
            checks.badge = qa('#mvp-badges .mvp-badge').length >= 1;
            checks.nick = (document.getElementById('mvp-tagline').textContent || '').length > 0;
            if (!checks.mvp || !checks.badge || !checks.nick) { fail('mvp mvp='+checks.mvp+' badge='+checks.badge+' nick='+checks.nick); return; }
            var closeMvp=document.getElementById('mvp-close'); if (closeMvp) closeMvp.click();
          }
        }
        var se=document.getElementById('btn-series-end');
        if (se && !q('.series-pom')) {
          checks.seBtn = typeof se.onclick === 'function';
          if (!window.__seDone) {
            window.__seDone = 1;
            try { window.__bpTest.showSeriesEnd(); }
            catch (e) { fail('series-end-throw ' + (e && e.message)); return; }
            mark('POST pom=' + !!q('.series-pom') + ' pk=' + !!q('.pk-card') + ' recap=' + !!q('.ai-recap') +
              ' rows=' + qa('.sg-row').length + ' seRuns=' + (window.__seRuns || 0));
            checks.pom = !!q('.series-pom'); checks.pk = !!q('.pk-card'); checks.recap = !!q('.ai-recap');
            checks.done = true;
            var miss = ['team','player','create','transfer','pool','log','chart','cm','grade','objcap','pom','pk','recap','seBtn','save','style','follow','caster','casterOff']
              .filter(function(k){ return !checks[k]; });
            mark(miss.length ? 'SMOKE FAIL missing=' + miss.join(',') : 'SMOKE OK pve-games=' + (games + 1) + ' steps=' + guard);
          }
          return;
        }
        if (se && q('.series-pom')) {
          checks.pom=true; checks.pk=!!q('.pk-card'); checks.recap=!!q('.ai-recap');
          mark('chk series phase=' + phase + ' pom=' + checks.pom + ' pk=' + checks.pk + ' recap=' + checks.recap +
            ' seRuns=' + (window.__seRuns || 0) + ' games=' + (games+1) + ' log=' + checks.log + ' err=' + window.__errs.length);
          if (!checks.recap) { fail('recap-missing ' + phase); return; }
          if (phase==='pve') {
            if (!window.__toEve) {
              window.__toEve=1;
              var rb=document.getElementById('btn-restart'); if (rb) rb.click();
              setTimeout(function(){ var ev=document.querySelector('#playmode-switch [data-pm="eve"]'); if (ev) { ev.click(); phase='eve'; window.__seAt=0; games=0; } }, 80);
            }
            return;
          }
          if (!checks.done) {
            checks.done=true;
            var missing=['team','player','create','transfer','pool','log','chart','cm','grade','objcap','pom','pk','recap','eve','save','style','follow','caster','casterOff']
              .filter(function(k){ return !checks[k]; });
            mark(missing.length ? 'SMOKE FAIL missing=' + missing.join(',') : 'SMOKE OK games=' + (games+1) + ' pom=' + checks.pom + ' eve=' + checks.eve);
          }
          return;
        }
        var nb=q('#sim-actions button[data-next]');
        if (nb) { games++; nb.click(); }
      }
    } catch(e){ __logErr(e); }
    setTimeout(tick, 25);
  }
  setTimeout(tick, 300);
  var pre=document.createElement('pre'); pre.id='__errbox'; pre.style.display='none'; pre.textContent='NOERR';
  document.body.appendChild(pre);
  setInterval(function(){ pre.textContent = window.__errs.length ? window.__errs.slice(0,4).join('\\n@@\\n') : 'NOERR'; }, 200);
})();
<\/script>
`;
h = h.replace("</body>", drv + "</body>");
fs.writeFileSync("_smoke.html", h, "utf8");
console.log("built", h.length);
