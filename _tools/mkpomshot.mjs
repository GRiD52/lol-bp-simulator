import fs from "fs";
let h = fs.readFileSync("index.html", "utf8");
const drv = `<script>
(function(){
  function q(s){ return document.querySelector(s); }
  function run(){
    try{
      var S = window.__bp, D = window.Draft, T = window.__bpTest;
      if (!T) { document.title = 'no-hook'; return; }
      var A = 'T1', B = 'Gen.G Esports';
      var s = D.newSeries({ mode: 'BO5', fearless: true, banCarry: false, timer: 0 });
      S.series = s;
      var plan = [
        { no: 1, blue: A, red: B, winner: 'blue', kills: { blue: 18, red: 9 } },
        { no: 2, blue: B, red: A, winner: 'red', kills: { blue: 10, red: 14 } },
        { no: 3, blue: A, red: B, winner: 'blue', kills: { blue: 16, red: 8 } },
        { no: 4, blue: B, red: A, winner: 'red', kills: { blue: 12, red: 15 } },
        { no: 5, blue: A, red: B, winner: 'blue', kills: { blue: 19, red: 11 } }
      ];
      plan.forEach(function(g){ g.step = 20; s.games.push(g); });
      s.score[A] = 3; s.score[B] = 2;
      s.over = true; s.winner = A; s.cur = s.games[s.games.length - 1];
      S.playMode = 'pve'; S.mySide = 'blue';
      s.aiMoves = [
        { game: 1, no: 1, side: 'blue', type: 'ban', name: 'Ahri', team: A, why: 'w' },
        { game: 1, no: 2, side: 'red', type: 'pick', name: 'Jinx', team: B, why: 'w' },
        { game: 2, no: 3, side: 'blue', type: 'pick', name: 'LeeSin', team: B, why: 'w' },
        { game: 3, no: 4, side: 'red', type: 'ban', name: 'Gnar', team: A, why: 'w' },
        { game: 5, no: 5, side: 'blue', type: 'pick', name: 'Leona', team: A, why: 'w' }
      ];
      var roles = ['top','jg','mid','bot','sup'];
      var champs = ['Gnar','LeeSin','Ahri','Jinx','Leona'];
      function mkStats(team, seed){
        var roster = window.PLAYERS.filter(function(p){ return p.t === team && !p.sub; });
        if (!roster.length) roster = window.PLAYERS.filter(function(p){ return p.t === A && !p.sub; });
        return roles.map(function(r, i){
          var p = roster.filter(function(x){ return x.r === r; })[0] || { n: 'P' + i };
          var k = 3 + ((seed + i) % 7), d = 1 + ((seed + i) % 4), a = 4 + ((seed + i * 2) % 9);
          return { n: p.n, role: r, champ: champs[i], cid: ['Gnar','LeeSin','Ahri','Jinx','Leona'][i],
            k: k, d: d, a: a, dmgPct: 16 + ((seed * 3 + i * 5) % 18), kp: 55 + ((seed * 7 + i * 6) % 40),
            rating: 6 + ((seed + i) % 4) * 0.7, grade: ['A','A','B','S','B'][i], dmg: 8000 + i * 1200 };
        });
      }
      S.results = plan.map(function(g, gi){
        return { winner: g.winner, blueTeam: g.blue, redTeam: g.red, gameNo: g.no,
          kills: g.kills, duration: (28 + gi) + ':10',
          bpq: { blue: 78 + gi * 0.6, red: 80 + gi * 0.4 },
          stats: { blue: mkStats(g.blue, gi + 1), red: mkStats(g.red, gi + 2) },
          mvp: { n: mkStats(g.winner === 'blue' ? g.blue : g.red, gi + 1)[gi % 5].n, side: g.winner },
          comments: [], summary: 'x' };
      });
      var screens = document.querySelectorAll('.screen');
      for (var si = 0; si < screens.length; si++) screens[si].classList.remove('active');
      document.getElementById('screen-sim').classList.add('active');
      T.showSeriesEnd();
      document.title = 'pom-shot ok pom=' + document.querySelectorAll('.series-pom').length + ' pk=' + document.querySelectorAll('.pk-card').length;
      setTimeout(function(){ document.title += ' recap=' + document.querySelectorAll('.ai-recap').length; }, 100);
    } catch (e) { document.title = 'THROW ' + (e && e.message); }
  }
  setTimeout(run, 250);
})();
<\/script>
`;
h = h.replace("</body>", drv + "</body>");
fs.writeFileSync("_pomshot.html", h, "utf8");
console.log("built", h.length);
