import fs from "fs";
let h = fs.readFileSync("index.html", "utf8");
const drv = `<script>
(function(){
  var target=(location.hash||'').replace('#',''), guard=0, stop=false, mvpClosed=false;
  function vis(id){ var e=document.getElementById(id); return e && e.classList.contains('active'); }
  function q(s){ return document.querySelector(s); }
  function fin(){ stop=true; }
  function tick(){
    if (stop || ++guard > 40000) return;
    try{
      if (target==='home') { fin(); return; }
      if (target==='editor') { var be=document.getElementById('btn-editor'); if(be) be.click(); if (q('#modal-editor.open')) { fin(); return; } return; }
      if (vis('screen-home')) {
        if (target==='ai' && !window.__pmSet) {
          var pv=document.querySelector('#playmode-switch [data-pm="pve"]'); if (pv) pv.click();
          var sel=document.getElementById('myside-team');
          var red=document.getElementById('home-red-team');
          if (sel && red) { sel.value = red.value; sel.dispatchEvent(new Event('change', {bubbles:true})); }
          window.__pmSet=1;
        }
        document.getElementById('btn-start').click();
      }
      else if (vis('screen-draft')) {
        if (target==='ai') {
          var lg=document.getElementById('ai-log');
          var nwhy=document.querySelectorAll('#ai-log .ail-why li').length;
          var nlog=document.querySelectorAll('#ai-log .ail-item').length;
          if (lg && !lg.hidden && nwhy>0 && nlog>=2) { fin(); return; }
          var cs=window.Draft.curStep(window.__bp.series);
          if (cs && cs.side===window.__bp.mySide) { var cell0=document.querySelector('#champ-grid .champ-cell:not(.dead)'); if (cell0) cell0.click(); }
          return;
        }
        var banner = document.getElementById('turn-banner').textContent;
        if (target==='hover') {
          if (!window.__hov) {
            var cells = [].slice.call(document.querySelectorAll('#champ-grid .champ-cell:not(.dead)'));
            var pick = cells[7] || cells[0];
            if (pick) { pick.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); window.__hov = 1; }
            return;
          }
          fin(); return;
        }
        var isG2 = (document.getElementById('draft-game-no').textContent||'').indexOf('第 2 局')>=0;
        var dead = document.querySelectorAll('#champ-grid .champ-cell.dead').length;
        if (target==='caster') {
          var nc = document.querySelectorAll('#caster .caster-item').length;
          if (!document.getElementById('caster').hidden && nc >= 3) { fin(); return; }
        }
        if (target==='picks') {
          var np = document.querySelectorAll('#pick-blue .pick-splash, #pick-red .pick-splash').length;
          if (np >= 5) { fin(); return; }
        }
        if (target==='draft' && dead>=6) { fin(); return; }
        if (target==='draft2' && isG2 && dead>=4) { fin(); return; }
        if (banner.indexOf('BP 结束') < 0) { var ai=document.getElementById('btn-ai'); if(ai) ai.click(); }
      }
      else if (vis('screen-assign')) { if(target==='assign'){ fin(); return; } document.getElementById('btn-confirm-assign').click(); }
      else if (vis('screen-analysis')) {
        if (target==='analysis') {
          // 页面有淡入动画，等几帧再截，否则抓到半透明的暗画面
          window.__anT = (window.__anT || 0) + 1;
          if (window.__anT > 45) fin();
          return;
        }
        document.getElementById('btn-sim').click();
      }
      else if (vis('screen-sim')) {
        if (target==='mvp') {
          if (q('#modal-mvp.open')) {
            if (!window.__mvpKill) {
              window.__mvpKill = 1;
              var st = document.createElement('style');
              st.textContent = '.mvp-modal,.mvp-modal *{animation:none!important;transition:none!important}' +
                '.mvp-modal.open{opacity:1!important}.mvp-modal.open .mvp-stage{opacity:1!important}';
              document.head.appendChild(st);
            }
            window.__mvpT = (window.__mvpT || 0) + 1;
            if (window.__mvpT > 40) fin();
          }
          return;
        }
        if (target==='sim') {
          if (q('#modal-mvp.open')) { var mc=q('#mvp-close'); if(mc){ mvpClosed=true; mc.click(); } return; }
          if (mvpClosed) { fin(); return; }
          return;
        }
        var eb=document.getElementById('btn-series-end');
        if (target==='pom') {
          if (q('.series-pom')) { window.__pomT=(window.__pomT||0)+1; if (window.__pomT>25) { fin(); } return; }
          if (eb && !window.__hookDone) { window.__hookDone=1; window.__bpTest.showSeriesEnd(); return; }
          var nb2=q('#sim-actions button[data-next]');
          if (nb2) { nb2.click(); }
          return;
        }
        if (target==='series') { if (eb) { eb.click(); } if (document.body.textContent.indexOf('SERIES WINNER')>=0) { fin(); } return; }
        if (eb) { eb.click(); return; }
        var nb = q('#sim-actions button[data-next]');
        if (nb) { nb.click(); }
        return;
      }
    } catch(e){}
    setTimeout(tick, 20);
  }
  if (target !== 'mvp') window.__bpShotSkipMvp = true;
  window.__bpFastSim = (target === 'series' || target === 'pom' || target === 'sim');
  window.addEventListener('error', function(e){ document.title = 'ERR: ' + (e.message || '') + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno; });
  setTimeout(tick, 150);
})();
<\/script>
`;
h = h.replace("</body>", drv + "</body>");
fs.writeFileSync("_shot.html", h, "utf8");
console.log("built", h.length);
