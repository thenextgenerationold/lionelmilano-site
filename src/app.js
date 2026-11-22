/* Lionel Boutique — vetrina statica.
 * Dati: window.__LB__ generato da site/build.mjs dal catalogo Shopify.
 * Carrello e preferiti: localStorage (solo comodità per il visitatore).
 * Checkout: cart permalink Shopify -> checkout ufficiale.
 */
(() => {
  "use strict";
  const D = window.__LB__;
  const MAX_QTY = 10;

  // ── dati ──────────────────────────────────────────────────────────────
  const ITEMS = D.items.map((p) => {
    const avail = p.v.filter((v) => v.a);
    const base = avail.length ? avail : p.v;
    const prices = base.map((v) => v.p);
    const pmin = Math.min(...prices);
    const cheapest = base.find((v) => v.p === pmin);
    const disc = Math.max(0, ...p.v.filter((v) => v.cp && v.a).map((v) => 1 - v.p / v.cp));
    return {
      ...p,
      pmin, pmax: Math.max(...prices),
      cmp: cheapest.cp,
      sale: p.v.some((v) => v.cp && v.a),
      disc,
      avail: avail.length > 0,
      key: norm(p.t + " " + p.c),
      ts: Date.parse(p.cr) || 0,
    };
  });
  const BY_H = new Map(ITEMS.map((p) => [p.h, p]));
  const VAR = new Map();
  ITEMS.forEach((p) => p.v.forEach((v) => VAR.set(String(v.id), { p, v })));

  // ── utilità ───────────────────────────────────────────────────────────
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
  const eur = (n) => fmt.format(n);
  const img = (src, w) => src + (src.includes("?") ? "&" : "?") + "width=" + w;
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.9-10-9.2C.4 8.9 1.6 5.4 4.9 5.1 7.1 4.9 9 6.1 12 9.1c3-3 4.9-4.2 7.1-4 3.3.3 4.5 3.8 2.9 6.7C19.5 16.1 12 21 12 21z"/></svg>';
  const NEW_DAYS = 45;
  const newest = Math.max(...ITEMS.map((p) => p.ts));
  const isNew = (p) => newest - p.ts < NEW_DAYS * 864e5;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ } },
  };

  // ── stato ─────────────────────────────────────────────────────────────
  // Le righe di carrello con varianti non più in catalogo o esaurite vengono scartate.
  let cart = (Array.isArray(store.get("lb_cart", [])) ? store.get("lb_cart", []) : [])
    .filter((l) => l && VAR.has(String(l.id)) && VAR.get(String(l.id)).v.a)
    .map((l) => ({ id: String(l.id), q: Math.min(MAX_QTY, Math.max(1, parseInt(l.q, 10) || 1)) }));
  let wish = new Set((store.get("lb_wish", []) || []).filter((h) => BY_H.has(h)));
  let filter = "Tutti";
  let sort = "new";
  const saveCart = () => store.set("lb_cart", cart);
  const saveWish = () => store.set("lb_wish", [...wish]);

  // ── rendering card ────────────────────────────────────────────────────
  function priceHtml(p) {
    const range = p.pmax > p.pmin ? "da " : "";
    if (p.cmp && p.cmp > p.pmin) return `<span class="old">${eur(p.cmp)}</span><span class="new">${range}${eur(p.pmin)}</span>`;
    return range + eur(p.pmin);
  }
  function cardHtml(p, opts = {}) {
    const href = "#/p/" + encodeURIComponent(p.h);
    const badge = !p.avail ? '<span class="badge out">Esaurito</span>'
      : p.sale ? `<span class="badge sale">${p.disc >= 0.1 ? "-" + Math.round(p.disc * 100) + "%" : "Saldo"}</span>`
      : isNew(p) ? '<span class="badge">New</span>' : "";
    const sizes = p.v.filter((v) => v.a).map((v) => v.s);
    const w = opts.small ? 300 : 500;
    return `<article class="card">
      <a class="imgwrap" href="${href}" aria-label="${esc(p.t)}">${badge}
        <img class="i1" loading="lazy" src="${esc(img(p.img[0], w))}" srcset="${esc(img(p.img[0], w))} 1x, ${esc(img(p.img[0], w * 2))} 2x" alt="${esc(p.t)}">
        ${p.img[1] && !opts.small ? `<img class="i2" loading="lazy" src="${esc(img(p.img[1], w))}" alt="">` : ""}
      </a>
      <button class="wish${wish.has(p.h) ? " on" : ""}" data-wish="${esc(p.h)}" aria-label="Aggiungi ai preferiti" aria-pressed="${wish.has(p.h)}">${HEART}</button>
      <a class="meta" href="${href}">
        <div class="cat">${esc(p.c)}</div><div class="name">${esc(p.t)}</div>
        <div class="price">${priceHtml(p)}</div>
        ${opts.small ? "" : `<div class="sizes">${esc(sizes.slice(0, 9).join("  "))}</div>`}
      </a>
    </article>`;
  }

  // ── home ──────────────────────────────────────────────────────────────
  function renderHome() {
    $("#rowNew").innerHTML = [...ITEMS].filter((p) => p.avail).sort((a, b) => b.ts - a.ts).slice(0, 4).map((p) => cardHtml(p)).join("");
    const rs = $("#rowSale");
    if (rs) rs.innerHTML = ITEMS.filter((p) => p.sale).sort((a, b) => b.disc - a.disc).slice(0, 4).map((p) => cardHtml(p)).join("");
  }

  // ── shop ──────────────────────────────────────────────────────────────
  const chips = $("#chips");
  function buildChips() {
    const list = [["Tutti", "Tutti"], ...(ITEMS.some((p) => p.sale) ? [["__sale", "Saldi"]] : []), ...D.cats.map((c) => [c, c])];
    chips.innerHTML = list.map(([k, l]) => `<button class="chip${k === "__sale" ? " sale" : ""}" role="tab" data-filter="${esc(k)}">${esc(l)}</button>`).join("");
  }
  function renderShop() {
    let list = ITEMS.filter((p) => (filter === "Tutti" ? true : filter === "__sale" ? p.sale : p.c === filter));
    const cmp = { new: (a, b) => b.ts - a.ts, asc: (a, b) => a.pmin - b.pmin, desc: (a, b) => b.pmin - a.pmin }[sort];
    list = [...list].sort((a, b) => (b.avail - a.avail) || cmp(a, b));
    const n = list.length;
    $("#count").textContent = n === 1 ? "1 capo" : n + " capi";
    $("#showing").textContent = n === 1 ? "1 prodotto" : n + " prodotti";
    $("#shopTitle").textContent = filter === "Tutti" ? "Tutto l'Uomo" : filter === "__sale" ? "Saldi" : filter;
    $("#grid").innerHTML = n ? list.map((p) => cardHtml(p)).join("") : '<p class="empty">Nessun capo in questa categoria.</p>';
    [...chips.children].forEach((c) => {
      const on = c.dataset.filter === filter;
      c.classList.toggle("active", on);
      c.setAttribute("aria-selected", on);
      if (on) c.scrollIntoView({ block: "nearest", inline: "center" });
    });
    $("#sort").value = sort;
  }
  function setFilter(f, scroll) {
    if (f !== "Tutti" && f !== "__sale" && !D.cats.includes(f)) f = "Tutti";
    filter = f;
    renderShop();
    if (scroll) $("#shop").scrollIntoView({ behavior: "smooth" });
  }

  // ── layer (scheda, carrello, preferiti, ricerca) ──────────────────────
  const open = new Set();
  let lastFocus = null;
  function layer(id, on) {
    const el = document.getElementById(id);
    if (on) {
      if (!open.size) lastFocus = document.activeElement;
      open.add(id);
      el.hidden = false;
    } else {
      open.delete(id);
      el.hidden = true;
    }
    document.body.style.overflow = open.size ? "hidden" : "";
    $("#backdrop").classList.toggle("show", open.size > 0);
    if (!open.size && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function closeAll() {
    ["cart", "wish", "search"].forEach((id) => open.has(id) && layer(id, false));
    if (open.has("pdp")) closePdp();
  }

  // ── scheda prodotto ───────────────────────────────────────────────────
  let pdp = null;      // prodotto aperto
  let selected = null; // variante scelta
  let pdpFromNav = false;

  function showPdp(p) {
    pdp = p;
    const avail = p.v.filter((v) => v.a);
    selected = p.v.length === 1 && p.v[0].a ? p.v[0] : null;
    $("#pdpGallery").innerHTML = p.img.map((s, i) => `<img ${i ? 'loading="lazy"' : ""} src="${esc(img(s, 1000))}" alt="${esc(p.t)} — foto ${i + 1}">`).join("");
    $("#pdpGallery").scrollTop = 0;
    $("#pdpCrumb").textContent = p.c;
    $("#pdpTitle").textContent = p.t;
    $("#pdpSizeBlock").hidden = p.v.length === 1;
    $("#pdpSizes").innerHTML = p.v.map((v) => `<button data-var="${v.id}" ${v.a ? "" : "disabled"} aria-label="Taglia ${esc(v.s)}${v.a ? "" : " esaurita"}">${esc(v.s)}</button>`).join("");
    $("#pdpDesc").textContent = p.d || "";
    $("#pdpDesc").hidden = !p.d;
    updatePdp();
    document.title = p.t + " — " + BASE_TITLE;
    layer("pdp", true);
    $("#pdp .pdp-side").scrollTop = 0;
    $("#pdp").scrollTop = 0;
    $("#pdp .pdp-close").focus({ preventScroll: true });
    if (!avail.length) toast("Questo capo è esaurito");
  }
  function updatePdp() {
    const p = pdp;
    const v = selected;
    if (v) {
      $("#pdpPrice").innerHTML = v.cp ? `<span class="old">${eur(v.cp)}</span><span class="new">${eur(v.p)}</span>` : eur(v.p);
    } else {
      $("#pdpPrice").innerHTML = priceHtml(p);
    }
    [...$("#pdpSizes").children].forEach((b) => b.classList.toggle("sel", v && b.dataset.var === String(v.id)));
    const add = $("#pdpAdd");
    if (!p.avail) { add.disabled = true; add.textContent = "Esaurito"; }
    else if (!v) { add.disabled = false; add.textContent = "Seleziona la taglia"; }
    else { add.disabled = false; add.textContent = "Aggiungi al carrello"; }
    const wb = $("#pdpWish");
    wb.classList.toggle("on", wish.has(p.h));
    wb.setAttribute("aria-pressed", wish.has(p.h));
    wb.querySelector("span").textContent = wish.has(p.h) ? "Nei preferiti" : "Aggiungi ai preferiti";
  }
  function hidePdp() {
    if (!open.has("pdp")) return;
    pdp = null; selected = null;
    document.title = BASE_TITLE;
    layer("pdp", false);
  }
  function closePdp() {
    if (location.hash.startsWith("#/p/")) {
      if (pdpFromNav) { pdpFromNav = false; history.back(); return; }
      history.replaceState(null, "", location.pathname + location.search);
    }
    hidePdp();
  }

  // ── carrello ──────────────────────────────────────────────────────────
  function cartCount() { return cart.reduce((s, l) => s + l.q, 0); }
  function addToCart(v) {
    const id = String(v.id);
    const line = cart.find((l) => l.id === id);
    if (line) {
      if (line.q >= MAX_QTY) { toast(`Massimo ${MAX_QTY} pezzi per articolo`); return; }
      line.q++;
    } else cart.push({ id, q: 1 });
    saveCart(); updateBadges(); renderCart();
  }
  function renderCart() {
    const body = $("#cartBody"), foot = $("#cartFoot");
    if (!cart.length) {
      body.innerHTML = '<p class="dempty">Il carrello è vuoto.</p>';
      foot.innerHTML = '<button class="checkout" data-close="cart" data-filter="Tutti" data-scroll>Continua lo shopping</button>';
      return;
    }
    let tot = 0;
    body.innerHTML = cart.map((l) => {
      const { p, v } = VAR.get(l.id);
      tot += v.p * l.q;
      return `<div class="line">
        <a href="#/p/${encodeURIComponent(p.h)}" data-close="cart"><img src="${esc(img(p.img[0], 200))}" alt=""></a>
        <div><div class="lt">${esc(p.t)}</div>
          <div class="ls">${p.v.length > 1 ? "Taglia " + esc(v.s) + " · " : ""}${eur(v.p)}</div>
          <div class="lrow">
            <span class="qty"><button data-qty="${l.id}" data-d="-1" aria-label="Diminuisci">−</button><span>${l.q}</span><button data-qty="${l.id}" data-d="1" aria-label="Aumenta">+</button></span>
            <span>${eur(v.p * l.q)}</span>
          </div>
          <button class="rm" data-remove="${l.id}">Rimuovi</button>
        </div></div>`;
    }).join("");
    foot.innerHTML = `<div class="tot"><span>Subtotale</span><b>${eur(tot)}</b></div>
      <small>Spedizione, eventuali sconti e imposte vengono calcolati nel checkout Shopify.</small>
      <a class="checkout" id="checkoutBtn" href="${esc(checkoutUrl())}" rel="noopener">Procedi al checkout</a>`;
  }
  function checkoutUrl() {
    return D.store + "/cart/" + cart.map((l) => l.id + ":" + l.q).join(",");
  }

  // ── preferiti ─────────────────────────────────────────────────────────
  function toggleWish(h) {
    if (wish.has(h)) wish.delete(h); else wish.add(h);
    saveWish(); updateBadges();
    document.querySelectorAll(`[data-wish="${CSS.escape(h)}"]`).forEach((b) => {
      b.classList.toggle("on", wish.has(h)); b.setAttribute("aria-pressed", wish.has(h));
    });
    if (pdp && pdp.h === h) updatePdp();
    if (open.has("wish")) renderWish();
  }
  function renderWish() {
    const list = [...wish].map((h) => BY_H.get(h)).filter(Boolean);
    $("#wishBody").innerHTML = list.length
      ? list.map((p) => `<div class="line">
          <a href="#/p/${encodeURIComponent(p.h)}" data-close="wish"><img src="${esc(img(p.img[0], 200))}" alt=""></a>
          <div><a href="#/p/${encodeURIComponent(p.h)}" data-close="wish" class="lt">${esc(p.t)}</a>
            <div class="ls">${priceHtml(p)}${p.avail ? "" : " · Esaurito"}</div>
            <button class="rm" data-wish="${esc(p.h)}">Rimuovi</button></div></div>`).join("")
      : '<p class="dempty">Non hai ancora salvato nessun capo.<br>Tocca il cuore su un prodotto per aggiungerlo.</p>';
  }

  function updateBadges() {
    const w = $("#wishN"), c = $("#cartN"), n = cartCount();
    w.textContent = wish.size; w.classList.toggle("show", wish.size > 0);
    c.textContent = n; c.classList.toggle("show", n > 0);
  }

  // ── ricerca ───────────────────────────────────────────────────────────
  function renderSearch() {
    const q = norm($("#q").value.trim());
    const res = $("#searchRes");
    if (!q) { res.innerHTML = ""; return; }
    const words = q.split(/\s+/);
    const hits = ITEMS.filter((p) => words.every((w) => p.key.includes(w))).sort((a, b) => (b.avail - a.avail) || b.ts - a.ts);
    res.innerHTML = hits.length
      ? hits.slice(0, 24).map((p) => cardHtml(p, { small: true })).join("")
      : '<p class="dempty">Nessun risultato. Prova con un altro termine.</p>';
  }

  // ── toast ─────────────────────────────────────────────────────────────
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400);
  }

  // ── routing (solo scheda prodotto: #/p/handle, link condivisibile) ────
  function route(fromNav) {
    const h = location.hash;
    if (h.startsWith("#/p/")) {
      const p = BY_H.get(decodeURIComponent(h.slice(4)));
      if (p) { pdpFromNav = !!fromNav; ["cart", "wish", "search"].forEach((id) => open.has(id) && layer(id, false)); showPdp(p); return; }
      history.replaceState(null, "", location.pathname + location.search);
      toast("Questo capo non è più disponibile");
    }
    hidePdp();
  }

  // ── eventi ────────────────────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const ds = t.dataset;

    if (ds.wish !== undefined) { e.preventDefault(); toggleWish(ds.wish); return; }
    if (ds.var) { const v = pdp && pdp.v.find((x) => String(x.id) === ds.var); if (v && v.a) { selected = v; updatePdp(); } return; }
    if (ds.qty) {
      const l = cart.find((x) => x.id === ds.qty); if (!l) return;
      l.q = Math.min(MAX_QTY, l.q + Number(ds.d));
      if (l.q <= 0) cart = cart.filter((x) => x !== l);
      saveCart(); updateBadges(); renderCart(); return;
    }
    if (ds.remove) { cart = cart.filter((x) => x.id !== ds.remove); saveCart(); updateBadges(); renderCart(); return; }
    if (ds.open) {
      ["cart", "wish", "search"].forEach((id) => id !== ds.open && open.has(id) && layer(id, false));
      if (ds.open === "cart") renderCart();
      if (ds.open === "wish") renderWish();
      layer(ds.open, true);
      if (ds.open === "search") { $("#q").focus(); renderSearch(); }
      return;
    }
    if (ds.close) {
      if (ds.close === "pdp") closePdp(); else layer(ds.close, false);
      if (ds.filter === undefined) return; // altrimenti prosegue col filtro
    }
    if (ds.sort) sort = ds.sort;
    if (ds.filter !== undefined) { e.preventDefault(); setFilter(ds.filter, ds.scroll !== undefined); }
  });

  $("#pdpAdd").addEventListener("click", () => {
    if (!pdp || !pdp.avail) return;
    if (!selected) { toast("Seleziona una taglia"); $("#pdpSizes").querySelector("button:not(:disabled)")?.focus(); return; }
    addToCart(selected);
    toast("Aggiunto al carrello");
    closePdp();
    renderCart();
    setTimeout(() => layer("cart", true), pdpFromNav ? 60 : 0);
  });
  $("#pdpWish").addEventListener("click", () => pdp && toggleWish(pdp.h));
  $("#backdrop").addEventListener("click", closeAll);
  $("#sort").addEventListener("change", (e) => { sort = e.target.value; renderShop(); });
  $("#q").addEventListener("input", renderSearch);
  $("#q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = $("#searchRes a.imgwrap"); if (first) first.click(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open.size) closeAll(); });
  window.addEventListener("hashchange", () => route(true));
  // Sincronizza carrello/preferiti tra più schede aperte.
  window.addEventListener("storage", (e) => {
    if (e.key === "lb_cart") { cart = (store.get("lb_cart", []) || []).filter((l) => VAR.has(String(l.id))); updateBadges(); renderCart(); }
    if (e.key === "lb_wish") { wish = new Set((store.get("lb_wish", []) || []).filter((h) => BY_H.has(h))); updateBadges(); }
  });

  // barra filtri: compare dopo aver iniziato a scrollare
  const fb = $("#filterBar");
  const fbToggle = () => fb.classList.toggle("show", window.scrollY > 140 && !open.size);
  window.addEventListener("scroll", fbToggle, { passive: true });

  // ── avvio ─────────────────────────────────────────────────────────────
  const BASE_TITLE = document.title;
  saveCart();
  buildChips();
  renderHome();
  renderShop();
  updateBadges();
  fbToggle();
  route(false);
})();
