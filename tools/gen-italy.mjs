// Genera src/italy.json: sagoma SVG dell'Italia (Natural Earth 1:50m via world-atlas)
// usata per la mappa stilizzata delle boutique. Da rilanciare solo se serve
// rigenerare la sagoma:  node tools/gen-italy.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";
const topo = await (await fetch(SRC)).json();
const { scale, translate } = topo.transform;

// decodifica archi (delta + quantizzazione)
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
const ring = (idx) => {
  const pts = [];
  idx.forEach((i) => {
    const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    a.forEach((p, k) => { if (k || !pts.length) pts.push(p); });
  });
  return pts;
};

const it = topo.objects.countries.geometries.find((g) => g.properties.name === "Italy");
const polys = it.arcs.map((poly) => ring(poly[0]));

// proiezione equirettangolare corretta alla latitudine media
const LAT0 = 42, K = Math.cos((LAT0 * Math.PI) / 180);
const proj = ([lon, lat]) => [lon * K, -lat];
const all = polys.flat().map(proj);
const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1])), maxY = Math.max(...all.map((p) => p[1]));
const W = 500, S = W / (maxX - minX), H = Math.round((maxY - minY) * S);
const toXY = (lonlat) => { const [x, y] = proj(lonlat); return [+((x - minX) * S).toFixed(1), +((y - minY) * S).toFixed(1)]; };

const area = (pts) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const d = polys
  .map((p) => p.map(toXY))
  .filter((p) => area(p) > 6) // scarta isolotti invisibili
  .map((p) => "M" + p.map((q) => q.join(",")).join("L") + "Z")
  .join("");

fs.writeFileSync(path.join(ROOT, "src", "italy.json"), JSON.stringify({
  viewBox: `0 0 ${W} ${H}`, d,
  proj: { lat0: LAT0, k: K, minX, minY, s: S },
}));
console.log(`italy.json: ${W}x${H}, ${d.length} caratteri`);
