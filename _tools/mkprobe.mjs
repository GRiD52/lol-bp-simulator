import fs from "fs";
let h = fs.readFileSync("index.html", "utf8");
const mode = process.env.PROBE === "custom" ? "custom" : "std";
const drv = `<script>
(function(){
  var MODE = '${mode}';
  function fin(t){ document.title = t; }
  window.addEventListener('error', function(e){ fin('PROBE ERR: ' + (e.message||'') + ' @@ ' + ((e.error && e.error.stack) || '').replace(/\\s+/g,' ').slice(0, 400)); });
  function run(){
    try{
      var S = window.__bp, D = window.Draft, T = window.__bpTest;
      if (!T) { fin('PROBE ERR no hook'); return; }
      var teamB = MODE === 'custom' ? 'SMKTEST1' : 'T1';
      var teamR = MODE === 'custom' ? 'SMKTEST2' : 'Gen.G Esports';
      var s = D.newSeries({ mode: 'BO5', fearless: true, banCarry: false, timer: 0 });
      S.series = s;
      s.games.push({ no: 1, blue: teamB, red: teamR, winner: 'blue', kills: { blue: 18, red: 9 }, step: 20 });
      s.games.push({ no: 2, blue: teamR, red: teamB, winner: 'red', kills: { blue: 10, red: 14 }, step: 20 });
      s.games.push({ no: 3, blue: teamB, red: teamR, winner: 'blue', kills: { blue: 16, red: 8 }, step: 20 });
      s.score[teamB] = 2; s.score[teamR] = 1;
      s.over = true; s.winner = teamB; s.cur = s.games[s.games.length - 1];
      if (MODE === 'custom') {
        S.playMode = 'pve'; S.mySide = 'blue';
        s.aiMoves = [
          { game: 1, no: 1, side: 'blue', type: 'ban', name: 'Ahri', team: teamB, why: 'w1' },
          { game: 1, no: 2, side: 'red', type: 'pick', name: 'Jinx', team: teamR, why: 'w2' }
        ];
      }
      var roles = ['top','jg','mid','bot','sup'];
      function mkStats(team, fb){
        var roster = window.PLAYERS.filter(function(p){ return p.t === team && !p.sub; });
        if (!roster.length) roster = window.PLAYERS.filter(function(p){ return p.t === fb && !p.sub; });
        return roles.map(function(r, i){
          var p = roster.filter(function(x){ return x.r === r; })[0] || { n: 'P' + i, r: r };
          var ch = ['Ahri','LeeSin','Jinx','Leona','Gnar'][i];
          return { n: p.n, role: r, champ: ch, cid: ch, k: 5 + i, d: 2, a: 7 + i,
            dmgPct: 20 + i, kp: 60 + i * 5, rating: 7 + i * 0.3, grade: 'A', dmg: 9000 + i * 800 };
        });
      }
      var res = { winner: 'blue', blueTeam: teamB, redTeam: teamR, gameNo: 1,
        kills: { blue: 18, red: 9 }, duration: '31:20',
        stats: { blue: mkStats(teamB, 'T1'), red: mkStats(teamR, 'Gen.G Esports') },
        mvp: { n: 'Faker', side: 'blue' },
        comments: [], summary: 'probe' };
      if (MODE === 'custom') res.bpq = { blue: 78.4, red: 80.1 };
      S.results = [res];
      var t0 = (window.performance && performance.now) ? performance.now() : 0;
      T.showSeriesEnd();
      var ms = ((window.performance && performance.now) ? (performance.now() - t0) : 0).toFixed(1);
      var out = [];
      out.push('mode=' + MODE + ' ms=' + ms);
      out.push('hero=' + document.querySelectorAll('.series-hero').length);
      out.push('pom=' + document.querySelectorAll('.series-pom').length);
      out.push('pk=' + document.querySelectorAll('.pk-card').length);
      out.push('recap=' + document.querySelectorAll('.ai-recap').length);
      out.push('rows=' + document.querySelectorAll('.sg-row').length);
      var pomName = document.querySelector('.pom-info h3');
      out.push('pomName=' + (pomName ? pomName.textContent : 'none'));
      fin('PROBE ' + out.join(' '));
    } catch (e) { fin('PROBE THROW: ' + (e && e.message) + ' @@ ' + ((e && e.stack) || '').replace(/\\s+/g,' ').slice(0, 500)); }
  }
  setTimeout(run, 200);
})();
<\/script>
`;
h = h.replace("</body>", drv + "</body>");
fs.writeFileSync("_probe.html", h, "utf8");
console.log("built", mode, h.length);
