// Build champion dataset + download champion art from Data Dragon.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:/deepseek/bp';
const OUT_CHAMP = path.join(ROOT, 'assets', 'champ');
const OUT_SPLASH = path.join(ROOT, 'assets', 'champ', 'splash');
const OUT_TILE = path.join(ROOT, 'assets', 'champ', 'tile');
fs.mkdirSync(OUT_CHAMP, { recursive: true });
fs.mkdirSync(OUT_SPLASH, { recursive: true });
fs.mkdirSync(OUT_TILE, { recursive: true });

const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
const ver = versions[0];
console.log('version', ver);

const zh = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/zh_CN/champion.json`)).json();
const en = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`)).json();

const list = [];
for (const [id, c] of Object.entries(en.data)) {
  const z = zh.data[id] || {};
  list.push({
    i: id,
    k: +c.key,
    c: z.name || c.name,
    t: z.title || c.title,
    g: c.tags,
    img: c.image.full,
  });
}
list.sort((a, b) => a.c.localeCompare(b.c, 'zh-Hans-CN'));
console.log('champions', list.length);

fs.writeFileSync(path.join(ROOT, 'js', 'data', 'champions.js'),
  `// 数据来源：Data Dragon ${ver}（${list.length} 位英雄）\nwindow.PATCH_VERSION = '${ver}';\nwindow.CHAMPIONS = ${JSON.stringify(list)};\n`);

async function dl(url, dest) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return false;
}

let done = 0, fail = 0;
const queue = [];
for (const c of list) {
  queue.push([`https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${c.img}`, path.join(OUT_TILE, `${c.i}.png`)]);
  queue.push([`https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${c.i}_0.jpg`, path.join(OUT_SPLASH, `${c.i}.jpg`)]);
}
const CONC = 8;
let idx = 0;
async function worker() {
  while (idx < queue.length) {
    const [url, dest] = queue[idx++];
    const ok = await dl(url, dest);
    if (ok) done++; else { fail++; process.stderr.write('FAIL ' + url + '\r\n'); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log('art done', done, 'fail', fail);
