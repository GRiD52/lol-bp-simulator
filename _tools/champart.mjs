// 下载英雄原画（Data Dragon 官方 splash，1215x717）
import fs from 'fs';
import path from 'path';

const VER = '16.20.1';
const ROOT = path.resolve('.');
const DIR = path.join(ROOT, 'assets/champ/art');
fs.mkdirSync(DIR, { recursive: true });

const win = {};
new Function('window', fs.readFileSync('js/data/champions.js', 'utf8'))(win);
const CHAMPS = win.CHAMPIONS;

const UA = 'LoLBPBuilder/1.0 (personal offline project)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grab(id) {
  const dest = path.join(DIR, id + '.jpg');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 30000) return 'skip';
  const url = 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/' + id + '_0.jpg';
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 429) { await sleep(4000); continue; }
      if (!r.ok) return 'HTTP ' + r.status;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 30000) return 'small ' + buf.length;
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) { await sleep(1500); }
  }
  return 'fail';
}

const list = CHAMPS.map((c) => c.i);
const queue = list.slice();
let ok = 0, skip = 0; const bad = [];

async function worker() {
  while (queue.length) {
    const id = queue.shift();
    const r = await grab(id);
    if (r === 'skip') { skip++; }
    else if (typeof r === 'number') { ok++; console.log('OK  ', id, (r / 1024).toFixed(0) + 'KB'); }
    else { bad.push(id + ':' + r); console.log('BAD ', id, r); }
  }
}
await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
console.log('done ok=' + ok + ' skip=' + skip + ' bad=' + bad.length);
if (bad.length) console.log(bad.join('\n'));

