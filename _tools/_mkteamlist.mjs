import fs from 'fs';
const src = fs.readFileSync('js/data/teams.js', 'utf8');
const out = [];
src.replace(/\{ t: (['"])(.*?)\1, tag: (['"])(.*?)\3/g, (_, q1, t, q2, tag) => { out.push({ t, tag }); });
fs.writeFileSync('_tools/teamlist.json', JSON.stringify(out, null, 1));
console.log(out.length, out.map((x) => x.tag).join(','));
