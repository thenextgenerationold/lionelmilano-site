// Lionel Milano — generatore del sito vetrina statico.
//
// Scarica il catalogo PUBBLICO del negozio Shopify (products.json, nessun token
// necessario), scarta i prodotti senza foto (e, se configurato, quelli esauriti)
// e genera un sito statico in site/dist/ pronto da pubblicare su qualunque
// hosting statico (Netlify, Cloudflare Pages, Vercel, GitHub Pages...).
//
// Il carrello e locale al browser; "Procedi al checkout" apre il checkout
// ufficiale Shopify tramite cart permalink (/cart/VARIANTE:QTA,...).
// Nessun pagamento passa da questo sito.
//
// Uso:  node site/build.mjs          (dalla radice del repo)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "src");
const DIST = path.join(HERE, "dist");
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, "site.config.json"), "utf8"));

// versione dei file statici: cambia quando cambia il contenuto (niente cache vecchie)
const ver = (f) => createHash("sha1").update(fs.readFileSync(path.join(SRC, f))).digest("hex").slice(0, 10);

const SHOP = `https://${CFG.shopifyDomain}`;
const STORE = CFG.storeUrl.replace(/\/$/, "");
const UA = { "User-Agent": "LionelBoutiqueSiteBuilder/1.0" };

// ── 1. fetch catalogo ──────────────────────────────────────────────────────
async function getJson(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: "manual" });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) throw new Error(`risposta non JSON (${ct})`);
      return await r.json();
    } catch (e) {
      if (i === tries) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1500 * i));
    }
  }
}

async function fetchAllProducts() {
  const all = [];
  for (let page = 1; page < 40; page++) {
    const j = await getJson(`${SHOP}/products.json?limit=250&page=${page}`);
    all.push(...j.products);
    if (j.products.length < 250) break;
  }
  return all;
}

async function fetchCollections() {
  const j = await getJson(`${SHOP}/collections.json?limit=250`);
  const map = {};
  for (const c of j.collections) {
    const handles = [];
    for (let page = 1; page < 20; page++) {
      const pj = await getJson(`${SHOP}/collections/${c.handle}/products.json?limit=250&page=${page}`);
      handles.push(...pj.products.map((p) => p.handle));
      if (pj.products.length < 250) break;
    }
    map[c.handle] = handles;
  }
  return map;
}

// ── 2. categorie ───────────────────────────────────────────────────────────
// Collezione Shopify -> categoria mostrata. L'ordine conta: vince la prima.
// Le collezioni trasversali (saldi, frontpage, brands) non definiscono una categoria.
const COL_CATEGORY = [
  ["abiti", "Abiti"],
  ["jacket-limited", "Giacche & Cappotti"],
  ["air-force-supreme", "Scarpe"],
  ["jeans", "Jeans"],
  ["denim", "Denim"],
  ["cargo", "Cargo"],
  ["pantalaccio", "Pantaloni"],
  ["tuta", "Coordinati"],
  ["felpe", "Felpe & Tute"],
  ["t-shirt", "T-shirt"],
  ["polo", "Camicie & Polo"],
  ["maglieria", "Camicie & Polo"],
];
// Per i prodotti fuori da ogni collezione: parole chiave nel titolo (vince la prima).
const TITLE_CATEGORY = [
  [/\babit[oi]\b/, "Abiti"],
  [/\bcoordinat/, "Coordinati"],
  [/\b(giacc|giubb|cappott|blazer|jacket)/, "Giacche & Cappotti"],
  [/\bcargo\b/, "Cargo"],
  [/\bjeans\b/, "Jeans"],
  [/\b(bermuda|short)/, "Short & Bermuda"],
  [/\b(camici\w*|polo)\b/, "Camicie & Polo"],
  [/\b(t-?shirt|tee)\b/, "T-shirt"],
  [/\b(felp|hoodie)/, "Felpe & Tute"],
  [/\b(sneaker|scarp)/, "Scarpe"],
  [/\b(pantal\w*|pants?)\b/, "Pantaloni"],
];
const TYPE_CATEGORY = { PANTALONI: "Pantaloni", JEANS: "Jeans", GIACCA: "Giacche & Cappotti", COORDINATI: "Coordinati" };
const titleCategory = (t) => TITLE_CATEGORY.find(([re]) => re.test(t.toLowerCase()))?.[1];

// ── 3. normalizzazione ─────────────────────────────────────────────────────
const decodeEntities = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const stripHtml = (h) =>
  decodeEntities((h || "").replace(/<(br|\/p|\/li|\/div)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).trim();
const variantLabel = (v) => (v.title === "Default Title" ? "Taglia unica" : v.title);

function normalize(products, colMap) {
  const handleToCols = {};
  for (const [col, hs] of Object.entries(colMap)) for (const h of hs) (handleToCols[h] ??= new Set()).add(col);

  const excluded = { noImage: [], soldOut: [] };
  const items = [];
  for (const p of products) {
    if (!p.images?.length) { excluded.noImage.push(p.title); continue; }
    const anyAvail = p.variants.some((v) => v.available);
    if (CFG.excludeSoldOut && !anyAvail) { excluded.soldOut.push(p.title); continue; }

    const cols = handleToCols[p.handle] || new Set();
    const cat = COL_CATEGORY.find(([c]) => cols.has(c))?.[1]
      ?? titleCategory(p.title)
      ?? TYPE_CATEGORY[(p.product_type || "").toUpperCase()]
      ?? "Altro";

    const item = {
      h: p.handle,
      t: titleCase(p.title),
      c: cat,
      img: p.images.map((i) => i.src),
      d: stripHtml(p.body_html).slice(0, 1500),
      cr: p.created_at,
      v: p.variants.map((v) => {
        const price = +v.price;
        const cmp = v.compare_at_price ? +v.compare_at_price : null;
        return { id: v.id, s: variantLabel(v), p: price, cp: cmp && cmp > price ? cmp : null, a: !!v.available };
      }),
    };
    // dimensioni delle foto: servono solo in build (non finiscono nel JSON della pagina)
    Object.defineProperty(item, "dims", { value: p.images.map((i) => ({ w: i.width, h: i.height })), enumerable: false });
    items.push(item);
  }
  return { items, excluded };
}

// ── 4. html ────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sized = (src, w) => src + (src.includes("?") ? "&" : "?") + "width=" + w;

function buildHtml(items) {
  const counts = {};
  items.forEach((i) => (counts[i.c] = (counts[i.c] || 0) + 1));
  const cats = Object.keys(counts).filter((c) => c !== "Altro").sort((a, b) => counts[b] - counts[a]);
  if (counts.Altro) cats.push("Altro");

  const first = (...cs) => { for (const c of cs) { const f = items.find((i) => i.c === c); if (f) return f; } return items[0]; };
  // Foto d'apertura: quella indicata in config, altrimenti la foto verticale a più
  // alta risoluzione tra giacche e abiti (mai sotto i 1600px: niente ingrandimenti sgranati).
  let hero = null, heroImg = null;
  if (CFG.hero?.handle) {
    hero = items.find((i) => i.h === CFG.hero.handle) || null;
    if (hero) heroImg = hero.img[CFG.hero.image || 0] || hero.img[0];
  }
  if (!hero) {
    const cand = items.flatMap((i) => (i.dims || []).map((d, k) => ({ i, k, ...d })))
      .filter((x) => x.w >= 1600 && x.h > x.w && ["Giacche & Cappotti", "Abiti"].includes(x.i.c))
      .sort((a, b) => b.w * b.h - a.w * a.h)[0];
    hero = cand ? cand.i : first("Abiti", "Giacche & Cappotti");
    heroImg = cand ? hero.img[cand.k] : hero.img[0];
  }
  const custom = items.filter((i) => /realizzat[ao] a mano|customi[sz]ed/i.test(i.t));
  const italy = JSON.parse(fs.readFileSync(path.join(SRC, "italy.json"), "utf8"));
  const bannerA = first("Giacche & Cappotti", "Abiti");
  const bannerB = first("Scarpe", "Jeans", "Denim");
  const tiles = cats.filter((c) => c !== "Altro").slice(0, 4).map((c) => ({ c, img: first(c).img[0], n: counts[c] }));

  const discounts = items.flatMap((i) => i.v.filter((v) => v.cp).map((v) => 1 - v.p / v.cp));
  const maxDisc = discounts.length ? Math.floor((Math.max(...discounts) * 100) / 5) * 5 : 0;
  const hasSale = discounts.length > 0;
  const bestDisc = (i) => Math.max(0, ...i.v.filter((v) => v.cp).map((v) => 1 - v.p / v.cp));
  const saleItem = hasSale ? [...items].sort((a, b) => bestDisc(b) - bestDisc(a))[0] : items[0];

  const ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.9-10-9.2C.4 8.9 1.6 5.4 4.9 5.1 7.1 4.9 9 6.1 12 9.1c3-3 4.9-4.2 7.1-4 3.3.3 4.5 3.8 2.9 6.7C19.5 16.1 12 21 12 21z"/></svg>',
    bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l1 12H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  };
  const SOCIAL_ICON = {
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 22v-8h2.7l.4-3H13V9c0-.9.3-1.5 1.6-1.5H16V4.8C15.7 4.8 14.8 4.7 13.8 4.7c-2.1 0-3.6 1.3-3.6 3.7V11H7.5v3H10.2v8H13z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2 1.6 3.6 3.6 3.9v2.6c-1.3 0-2.5-.4-3.6-1.1v6.1c0 3-2.4 5.5-5.4 5.5S5.2 17.5 5.2 14.5 7.6 9 10.6 9c.3 0 .6 0 .9.1v2.7c-.3-.1-.6-.2-.9-.2-1.5 0-2.7 1.2-2.7 2.9s1.2 2.9 2.7 2.9 2.7-1.2 2.7-2.9V3H16z"/></svg>',
  };
  const socials = Object.entries(CFG.social || {}).filter(([, u]) => u);
  const name = esc(CFG.brandName);
  const [logoA, ...logoRest] = CFG.brandName.split(" ");
  const desc = `${CFG.brandName} — ${CFG.tagline}. ${items.length} capi uomo: abiti, giacche, denim, scarpe.`;
  const canonical = CFG.siteUrl ? `<link rel="canonical" href="${esc(CFG.siteUrl)}">\n<meta property="og:url" content="${esc(CFG.siteUrl)}">` : "";
  const stores = (CFG.stores || []).filter((s) => s.name && s.address);
  // WhatsApp: solo cifre, prefisso internazionale incluso (es. 393331234567)
  const wa = String(CFG.whatsapp?.number || "").replace(/\D/g, "");
  const phone = CFG.phone || CFG.whatsapp?.number || "";
  const waMsg = CFG.whatsapp?.message || "Ciao Lionel, ti scrivo dal sito: vorrei qualche informazione.";
  const data = JSON.stringify({
    items, cats, store: STORE,
    wa: wa ? { n: wa, m: waMsg, mp: CFG.whatsapp?.productMessage || "Ciao Lionel, mi interessa questo capo: {titolo} {link}" } : null,
    site: CFG.siteUrl || "",
    stores: stores.map((s, i) => ({ i, n: s.name, c: s.city, a: s.address, lat: s.lat, lng: s.lng })).filter((s) => s.lat != null && s.lng != null),
  }).replace(/</g, "\\u003c");
  const pol = (p) => `${STORE}/policies/${p}`;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} — ${esc(CFG.tagline)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(sized(heroImg, 1200))}">
${canonical}
<meta name="theme-color" content="#141414">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<link rel="preconnect" href="https://cdn.shopify.com">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css?v=${ver("style.css")}">
</head>
<body>
${CFG.topbar ? `<div class="topbar">${esc(CFG.topbar)}</div>` : ""}
<header>
  <div class="nav">
    <nav class="nav-links" aria-label="Principale">
      <button data-filter="Tutti" data-scroll>Shop</button>
      ${cats.slice(0, 3).map((c) => `<button data-filter="${esc(c)}" data-scroll>${esc(c)}</button>`).join("")}
      ${hasSale ? `<button data-filter="__sale" data-scroll class="sale-link">Saldi</button>` : ""}
    </nav>
    <a class="logo" href="./" aria-label="${name} — home">${esc(logoA.toUpperCase())}${logoRest.length ? `<small>${esc(logoRest.join(" ").toUpperCase())}</small>` : ""}</a>
    <div class="nav-ico">
      <button class="icobtn" data-open="search" aria-label="Cerca">${ICON.search}</button>
      <a class="icobtn hidem" href="${STORE}/account" aria-label="Account" rel="noopener">${ICON.user}</a>
      <button class="icobtn" data-open="wish" aria-label="Preferiti">${ICON.heart}<em id="wishN"></em></button>
      <button class="icobtn" data-open="cart" aria-label="Carrello">${ICON.bag}<em id="cartN"></em></button>
    </div>
  </div>
</header>

<div class="filterbar" id="filterBar"><div class="inner">
  <span class="fb-title">Shop</span>
  <div class="chips" id="chips" role="tablist"></div>
  <div class="tools-right"><span id="showing"></span>
    <select id="sort" aria-label="Ordina"><option value="new">Novità</option><option value="asc">Prezzo crescente</option><option value="desc">Prezzo decrescente</option></select>
  </div>
</div></div>

<main>
  <section class="hero">
    <div class="hero-txt">
      <div class="kicker">${stores.map((s) => esc(s.city)).join(" · ") || "Collezione Uomo"}</div>
      <h1>Eleganza<br>senza tempo</h1>
      <p>Sartoria contemporanea, denim e pezzi unici dipinti a mano. Selezionati in boutique, spediti a casa tua.</p>
      <div class="hero-cta">
        <button class="cta dark" data-filter="Tutti" data-scroll>Scopri la collezione</button>
        ${custom.length ? `<a class="link" href="#unici">Pezzi unici</a>` : ""}
      </div>
    </div>
    <a class="hero-img" href="#/p/${encodeURIComponent(hero.h)}" aria-label="${esc(hero.t)}">
      <img src="${esc(sized(heroImg, 1200))}" srcset="${[800, 1200, 1600, 2000].map((w) => `${esc(sized(heroImg, w))} ${w}w`).join(", ")}" sizes="(max-width:760px) 100vw, 50vw" alt="${esc(hero.t)}" fetchpriority="high">
      <span class="hero-tag">${esc(hero.t)}</span>
    </a>
  </section>

  ${custom.length ? `<section class="unici" id="unici">
    <div class="unici-head">
      <div class="kicker">Lionel Sidieu · Custom</div>
      <h2>Pezzi unici, dipinti a mano</h2>
      <p>Giacche e denim personalizzati a mano, uno per uno. Quando un pezzo è venduto, non torna.</p>
    </div>
    <div class="unici-row">
      ${custom.map((p) => `<a class="unico" href="#/p/${encodeURIComponent(p.h)}"><img loading="lazy" src="${esc(sized(p.img[0], 700))}" srcset="${esc(sized(p.img[0], 700))} 1x, ${esc(sized(p.img[0], 1400))} 2x" alt="${esc(p.t)}"><span>${esc(p.t)}</span></a>`).join("\n      ")}
    </div>
  </section>` : ""}

  <div class="sec"><h2>Nuovi arrivi</h2><p>Gli ultimi capi arrivati in boutique</p></div>
  <div class="row" id="rowNew"></div>
  <div class="center"><button class="link" data-sort="new" data-filter="Tutti" data-scroll>Vedi tutto</button></div>

  <div class="split">
    <button class="banner" data-filter="${esc(bannerA.c)}" data-scroll><img loading="lazy" src="${esc(sized(bannerA.img[0], 1200))}" alt=""><div class="cap"><h3>${esc(bannerA.c)}</h3><span class="cta">Acquista ora</span></div></button>
    <button class="banner" data-filter="${esc(bannerB.c)}" data-scroll><img loading="lazy" src="${esc(sized(bannerB.img[0], 1200))}" alt=""><div class="cap"><h3>${esc(bannerB.c)}</h3><span class="cta">Acquista ora</span></div></button>
  </div>

  <div class="sec"><h2>Esplora per categoria</h2><p>Trova il tuo stile</p></div>
  <div class="tiles">
    ${tiles.map((t) => `<button class="tile" data-filter="${esc(t.c)}" data-scroll><img loading="lazy" src="${esc(sized(t.img, 800))}" alt=""><div class="lab"><b>${esc(t.c)}</b><span>${t.n} capi</span></div></button>`).join("\n    ")}
  </div>

  ${hasSale ? `<section class="full" id="saleBanner">
    <img loading="lazy" src="${esc(sized(saleItem.img[0], 1800))}" alt="">
    <div class="cap"><h3>In Saldo</h3><p>${maxDisc >= 10 ? `Fino al ${maxDisc}% su una selezione` : "Una selezione a prezzo speciale"}</p><button class="cta" data-filter="__sale" data-scroll>Scopri i saldi</button></div>
  </section>
  <div class="sec"><h2>I migliori sconti</h2><p>Disponibilità limitata alle taglie in stock</p></div>
  <div class="row" id="rowSale"></div>` : ""}

  <div class="sec" id="shop"><h2 id="shopTitle">Tutto l'Uomo</h2><p id="count"></p></div>
  <div class="grid" id="grid"></div>

  ${stores.length ? `<section class="stores" id="negozi">
    <div class="sec"><h2>Le Boutique</h2><p>${stores.length > 1 ? "Da Milano all'Adriatico: vieni a provare i capi di persona" : "Vieni a provare i capi di persona"}</p></div>
    <div class="stores-in">
      <div class="store-list">
        ${stores.length > 1 ? `<button class="near" id="nearBtn" type="button"><span class="near-dot"></span><span id="nearTxt">Trova la boutique più vicina a te</span></button>` : ""}
        ${stores.map((s, i) => `<article class="store" data-store="${i}">
          <div class="store-idx">${String(i + 1).padStart(2, "0")}</div>
          <div class="store-body">
            <h3 class="store-city">${esc(s.city)}</h3>
            <div class="store-addr">${esc(s.address)}</div>
            ${s.hours ? `<div class="store-addr">${esc(s.hours)}</div>` : ""}
            ${s.phone ? `<a class="store-addr" href="tel:${esc(s.phone.replace(/\s+/g, ""))}">${esc(s.phone)}</a>` : ""}
            <div class="store-dist" id="dist${i}" aria-live="polite"></div>
            <div class="store-act">
              <a class="link" href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">Indicazioni</a>
            </div>
          </div>
        </article>`).join("")}
      </div>
      <div class="italy" role="img" aria-label="Le boutique in Italia: ${stores.map((s) => esc(s.city)).join(" e ")}">
        <svg viewBox="${italy.viewBox}" preserveAspectRatio="xMidYMid meet">
          <path class="italy-shape" d="${italy.d}"/>
          ${(() => {
            const p = italy.proj;
            const xy = (s) => [((s.lng * p.k - p.minX) * p.s).toFixed(1), ((-s.lat - p.minY) * p.s).toFixed(1)];
            const pts = stores.filter((s) => s.lat != null).map((s) => ({ s, i: stores.indexOf(s), xy: xy(s) }));
            const line = pts.length > 1 ? (() => {
              const [a, b] = [pts[0].xy.map(Number), pts[1].xy.map(Number)];
              const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.18, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.18;
              return `<path class="italy-arc" d="M${a[0]},${a[1]} Q${mx.toFixed(1)},${my.toFixed(1)} ${b[0]},${b[1]}"/>`;
            })() : "";
            return line + pts.map(({ s, i, xy: [x, y] }) => {
              const right = Number(x) < 260;
              return `<g class="italy-pt" data-store="${i}" tabindex="0" role="button" aria-label="${esc(s.city)}">
            <circle class="pulse" cx="${x}" cy="${y}" r="7"/><circle class="dot" cx="${x}" cy="${y}" r="6"/>
            <text x="${right ? Number(x) + 14 : Number(x) - 14}" y="${Number(y) + 5}" text-anchor="${right ? "start" : "end"}">${esc(s.city)}</text>
          </g>`;
            }).join("");
          })()}
        </svg>
      </div>
    </div>
  </section>` : ""}
</main>

<div class="backdrop" id="backdrop"></div>

<div class="pdp" id="pdp" role="dialog" aria-modal="true" aria-labelledby="pdpTitle" hidden>
  <div class="pdp-gallery" id="pdpGallery"></div>
  <div class="pdp-side">
    <button class="x pdp-close" data-close="pdp" aria-label="Chiudi">✕</button>
    <div class="pdp-crumb" id="pdpCrumb"></div>
    <h2 class="pdp-title" id="pdpTitle"></h2>
    <div class="pdp-price" id="pdpPrice"></div>
    <div id="pdpSizeBlock"><div class="pdp-lab">Seleziona la taglia</div><div class="pdp-sizes" id="pdpSizes"></div></div>
    <button class="pdp-add" id="pdpAdd">Aggiungi al carrello</button>
    <button class="pdp-wish" id="pdpWish">${ICON.heart}<span>Aggiungi ai preferiti</span></button>
    ${wa ? `<a class="pdp-wa" id="pdpWa" href="https://wa.me/${wa}" target="_blank" rel="noopener">Chiedi info su WhatsApp</a>` : ""}
    <p class="pdp-note">Spedizione e imposte calcolate al checkout.</p>
    <div class="pdp-desc" id="pdpDesc"></div>
  </div>
</div>

<aside class="drawer" id="cart" role="dialog" aria-modal="true" aria-label="Carrello" hidden>
  <div class="dh"><b>Carrello</b><button class="x" data-close="cart" aria-label="Chiudi">✕</button></div>
  <div class="dbody" id="cartBody"></div>
  <div class="dfoot" id="cartFoot"></div>
</aside>

<aside class="drawer" id="wish" role="dialog" aria-modal="true" aria-label="Preferiti" hidden>
  <div class="dh"><b>Preferiti</b><button class="x" data-close="wish" aria-label="Chiudi">✕</button></div>
  <div class="dbody" id="wishBody"></div>
</aside>

<div class="search" id="search" role="dialog" aria-modal="true" aria-label="Cerca" hidden>
  <div class="search-in"><input id="q" type="search" placeholder="Cerca un capo, es. giacca, jeans, abito blu…" autocomplete="off"><button class="x" data-close="search" aria-label="Chiudi">✕</button></div>
  <div class="search-res" id="searchRes"></div>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>

${wa ? `<a class="wa" id="waBtn" href="https://wa.me/${wa}?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener" aria-label="Scrivici su WhatsApp">
  <svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16.04 3C9.0 3 3.3 8.7 3.3 15.7c0 2.2.6 4.4 1.7 6.3L3.2 29l7.2-1.9c1.8 1 3.9 1.5 5.9 1.5h.1c7 0 12.7-5.7 12.7-12.7 0-3.4-1.3-6.6-3.7-9C22.9 4.3 19.6 3 16.04 3zm0 23.4h-.1c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.3 1.1 1.1-4.2-.2-.4c-1-1.7-1.6-3.6-1.6-5.6 0-5.8 4.7-10.5 10.6-10.5 2.8 0 5.5 1.1 7.4 3.1 2 2 3.1 4.6 3.1 7.4-.1 5.9-4.8 10.7-10.3 10.7zm5.8-7.9c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.3.3-.5.1-.2.1-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.3 3.4c.2.2 2.3 3.5 5.6 4.9.8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.3-.6-.4z"/></svg>
  <span class="wa-label">Scrivici</span>
</a>` : ""}

<footer>
  <div class="fcols">
    <div class="fcol fcontact"><h4>Contatti</h4>
      ${phone ? `<a href="tel:${esc(phone.replace(/[^\d+]/g, ""))}"><span class="fk">Telefono</span>${esc(phone)}</a>` : ""}
      ${wa ? `<a href="https://wa.me/${wa}?text=${encodeURIComponent(waMsg)}" target="_blank" rel="noopener"><span class="fk">WhatsApp</span>${esc(phone || "+" + wa)}</a>` : ""}
      ${CFG.contactEmail ? `<a href="mailto:${esc(CFG.contactEmail)}"><span class="fk">Email</span>${esc(CFG.contactEmail)}</a>` : ""}
      ${socials.length ? `<div class="social">${socials.map(([k, u]) => `<a href="${esc(u)}" aria-label="${k}" rel="noopener" target="_blank">${SOCIAL_ICON[k] || k}</a>`).join("")}</div>` : ""}
    </div>
    ${stores.length ? `<div class="fcol fstores"><h4>Le Boutique</h4>
      ${stores.map((s) => `<a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(s.address)}" target="_blank" rel="noopener"><span class="fk">${esc(s.city)}</span>${esc(s.address)}${s.phone ? `<br>${esc(s.phone)}` : ""}${s.hours ? `<br>${esc(s.hours)}` : ""}</a>`).join("")}
    </div>` : ""}
    <div class="fcol"><h4>Assistenza</h4>
      <a href="${pol("shipping-policy")}" rel="noopener">Spedizioni</a>
      <a href="${pol("refund-policy")}" rel="noopener">Resi e rimborsi</a>
      <a href="${STORE}/account" rel="noopener">Il mio account</a>
      <a href="${pol("privacy-policy")}" rel="noopener">Privacy Policy</a>
      <a href="${pol("terms-of-service")}" rel="noopener">Termini e Condizioni</a>
    </div>
    <div class="fcol"><h4>Categorie</h4>
      ${cats.slice(0, 6).map((c) => `<button data-filter="${esc(c)}" data-scroll>${esc(c)}</button>`).join("")}
      ${hasSale ? `<button data-filter="__sale" data-scroll>Saldi</button>` : ""}
    </div>
  </div>
  <p class="fsecure">Pagamenti sicuri sul checkout ufficiale Shopify: questo sito non tratta i dati della tua carta.</p>
  <div class="fcopy">© ${new Date().getFullYear()} ${name}${CFG.companyLine ? ` · ${esc(CFG.companyLine)}` : ""}${CFG.vatNumber ? ` · P.IVA ${esc(CFG.vatNumber)}` : ""}</div>
</footer>

<noscript><p class="noscript">Per navigare il catalogo e acquistare è necessario JavaScript.</p></noscript>
<script>window.__LB__=${data};</script>
<script src="app.js?v=${ver("app.js")}" defer></script>
</body>
</html>`;
}


// ── 5. main ────────────────────────────────────────────────────────────────
console.log(`Catalogo da ${SHOP} ...`);
const [products, colMap] = await Promise.all([fetchAllProducts(), fetchCollections()]);
const { items, excluded } = normalize(products, colMap);
if (!items.length) throw new Error("Nessun prodotto pubblicabile: build interrotta per non pubblicare un sito vuoto.");

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "index.html"), buildHtml(items));
fs.copyFileSync(path.join(SRC, "style.css"), path.join(DIST, "style.css"));
fs.copyFileSync(path.join(SRC, "app.js"), path.join(DIST, "app.js"));
// icone (L nel font del logo) e manifest
for (const f of fs.readdirSync(path.join(HERE, "static"))) fs.copyFileSync(path.join(HERE, "static", f), path.join(DIST, f));
fs.writeFileSync(path.join(DIST, "site.webmanifest"), JSON.stringify({
  name: CFG.brandName, short_name: CFG.brandName, start_url: "./", display: "standalone",
  background_color: "#ffffff", theme_color: "#141414",
  icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }],
}));
fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n${CFG.siteUrl ? `Sitemap: ${CFG.siteUrl.replace(/\/$/, "")}/sitemap.xml\n` : ""}`);
if (CFG.siteUrl) fs.writeFileSync(path.join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(CFG.siteUrl)}</loc></url></urlset>\n`);

const byCat = {};
items.forEach((i) => (byCat[i.c] = (byCat[i.c] || 0) + 1));
console.log(`\nProdotti nel negozio: ${products.length}`);
console.log(`Pubblicati:           ${items.length}`);
console.log(`Esclusi senza foto:   ${excluded.noImage.length}${excluded.noImage.length ? " → " + excluded.noImage.join(", ") : ""}`);
console.log(`Esclusi esauriti:     ${excluded.soldOut.length}${excluded.soldOut.length ? " → " + excluded.soldOut.join(", ") : ""}`);
console.log("Categorie:", Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log(`Checkout verso:       ${STORE}/cart/...`);
console.log(`\nSito generato in ${DIST}`);
