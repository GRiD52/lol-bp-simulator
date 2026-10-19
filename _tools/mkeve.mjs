import fs from "fs";
let h = fs.readFileSync("index.html", "utf8");
const head = `<script>
(function(){
  window.__errs=[]; window.__bpFastSim=1; window.__bpShotSkipMvp=1;
  function __logErr(e){ try{ window.__errs.push(String((e&&e.stack)||e)); }catch(_){} }
  window.addEventListener('error', function(e){ __logErr(e.message + ' @' + e.lineno); });
  var st=window.setTimeout, si=window.setInterval;
  window.setTimeout=function(fn,d){ return st(function(){ try{ if(typeof fn==='function'){fn();}else{eval(fn);} }catch(e){ __logErr(e); } }, d); };
  window.setInterval=function(fn,d){ return si(function(){ try{ if(typeof fn==='function'){fn();}else{eval(fn);} }catch(e){ __logErr(e); } }, d); };
})();
<\/script>
`;
h = h.replace("</head>", head + "</head>");
const drv = `<script>
(function(){
  var guard=0, phase='home', pausedAt=-1, pausedOk=false, resumeOk=false;
  function q(s){ return document.querySelector(s); }
  function qa(s){ return document.querySelectorAll(s); }
  function vis(id){ var e=document.getElementById(id); return e && e.classList.contains('active'); }
  function fin(t){ document.title = t; }
  function step(){ var s=window.__bp.series; return s && s.cur ? s.cur.step : -1; }
  function tick(){
    if (++guard > 4000) { fin('EVE TIMEOUT phase=' + phase + ' step=' + step() + ' moves=' + qa('#ai-log .ail-item').length); return; }
    if (window.__errs.length) { fin('EVE FAIL err=' + window.__errs[0].slice(0, 200)); return; }
    if (phase === 'home') {
      var pm=document.querySelector('#playmode-switch [data-pm="eve"]');
      if (pm) pm.click();
      var bs=document.getElementById('btn-start');
      if (bs) { bs.click(); phase='draft'; }
      return setTimeout(tick, 25);
    }
    if (phase === 'draft') {
      if (!vis('screen-draft')) { phase = vis('screen-assign') ? 'assign' : 'wait'; return setTimeout(tick, 25); }
      var log=document.getElementById('ai-log');
      var moves=qa('#ai-log .ail-item').length;
      var whys=qa('#ai-log .ail-why li').length;
      if (log && !log.hidden && moves >= 2 && whys >= 1 && step() >= 3 && pausedAt < 0) {
        var pause=q('#ai-log [data-ail="pause"]');
        if (!pause) { fin('EVE FAIL no-pause'); return; }
        pause.click();
        pausedAt = step();
        setTimeout(function(){
          if (step() !== pausedAt) { fin('EVE FAIL pause-not-hold ' + pausedAt + '->' + step()); return; }
          pausedOk = true;
          var p2=q('#ai-log [data-ail="pause"]');
          if (p2) p2.click();
          setTimeout(function(){
            if (step() <= pausedAt) { fin('EVE FAIL resume-not-move ' + pausedAt + '->' + step()); return; }
            resumeOk = true;
            fin('EVE OK moves=' + qa('#ai-log .ail-item').length + ' step=' + step() + ' paused=' + pausedOk + ' resumed=' + resumeOk + ' log=' + (qa('#ai-log .ail-why li').length > 0));
          }, 2800);
        }, 600);
        phase='done';
        return;
      }
      return setTimeout(tick, 25);
    }
    return setTimeout(tick, 25);
  }
  setTimeout(tick, 300);
})();
<\/script>
`;
h = h.replace("</body>", drv + "</body>");
fs.writeFileSync("_eve.html", h, "utf8");
console.log("built", h.length);
