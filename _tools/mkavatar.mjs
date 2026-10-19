import fs from "fs";
import path from "path";
import vm from "vm";

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["js/data/champions.js", "js/data/teams.js", "js/data/players.js", "js/data/photos.js"]) {
  vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
}
const { PLAYERS, TEAMS, PHOTOS, TEAM_LOGOS } = ctx;

const dir = "assets/players/auto";
fs.mkdirSync(dir, { recursive: true });

const colorOf = (team) => {
  const t = TEAMS.find((x) => x.t === team);
  return t ? { c1: t.c1, c2: t.c2, tag: t.tag } : { c1: "#3a4b6a", c2: "#0d1220", tag: team.slice(0, 3).toUpperCase() };
};

const initialsOf = (name) => {
  const s = String(name).trim();
  if (/^[A-Za-z]/.test(s)) return s.slice(0, 2).toUpperCase();
  const cjk = s.match(/[\u4e00-\u9fa5]/g);
  if (cjk && cjk.length) return cjk.slice(0, 2).join("");
  return s.slice(0, 2).toUpperCase();
};

let added = 0;
const used = new Map();
PLAYERS.forEach((p) => {
  const key = p.t + "|" + p.n;
  if (PHOTOS[key]) return;
  const col = colorOf(p.t);
  const init = initialsOf(p.n);
  const size = init.length >= 3 ? 58 : 76;
  const file = path.join(dir, col.tag.toLowerCase().replace(/[^a-z0-9]/g, "") + "-" + (used.get(p.t) || 0) + ".svg");
  used.set(p.t, (used.get(p.t) || 0) + 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${col.c1}"/>
      <stop offset="1" stop-color="${col.c2}"/>
    </linearGradient>
    <radialGradient id="r" cx="0.28" cy="0.22" r="0.9">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <pattern id="p" width="18" height="18" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="18" stroke="#ffffff" stroke-opacity="0.055" stroke-width="7"/>
    </pattern>
  </defs>
  <rect width="240" height="240" fill="url(#g)"/>
  <rect width="240" height="240" fill="url(#p)"/>
  <rect width="240" height="240" fill="url(#r)"/>
  <g fill="#ffffff" fill-opacity="0.1">
    <circle cx="120" cy="106" r="30"/>
    <path d="M120 148c-34 0-58 16-64 44h128c-6-28-30-44-64-44z"/>
  </g>
  <text x="120" y="126" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Microsoft YaHei, sans-serif" font-size="${size}" font-weight="800" fill="#ffffff" fill-opacity="0.96" letter-spacing="2">${init}</text>
  <text x="120" y="210" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="16" font-weight="700" fill="#ffffff" fill-opacity="0.5" letter-spacing="3">${col.tag}</text>
</svg>
`;
  fs.writeFileSync(file, svg, "utf8");
  PHOTOS[key] = file.replace(/\\/g, "/");
  added++;
});

fs.writeFileSync("js/data/photos.js",
  "window.PHOTOS=" + JSON.stringify(PHOTOS) + ";\nwindow.TEAM_LOGOS=" + JSON.stringify(TEAM_LOGOS) + ";\n",
  "utf8");

const missing = PLAYERS.filter((p) => !PHOTOS[p.t + "|" + p.n]);
console.log("generated", added, "avatars; players", PLAYERS.length, "photos", Object.keys(PHOTOS).length, "still missing", missing.length);
