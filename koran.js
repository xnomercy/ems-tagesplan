// Koran lesen: arabischer Mushaf mit 604 Seiten, aufschlagen nach Seite, Sure, Ayet oder Juz, Suche, Lesezeichen.
// Text: King-Fahd-Komplex, Uthmani Hafs v13 (koran/quran-1.json, wird erst beim Öffnen geladen und bleibt offline).
// Schrift: Amiri Quran (Naskh im osmanisch-türkischen Stil) oder Scheherazade New, beide SIL Open Font License.
// Lesestand, Schrift und Lesezeichen liegen nur auf dem Gerät (localStorage).
export const KORAN_DATA = "koran/quran-1.json";
export const KORAN_FILES = [KORAN_DATA, "fonts/amiri-quran.woff2", "fonts/scheherazade-new.woff2"];
const KEY = "tagesplan-koran";
export const PAGES = 604;
// Zuletzt aufgeschlagene Seite (für den Weiterlesen-Knopf), null wenn noch nie geöffnet
export const lastPage = () => { try { return JSON.parse(localStorage.getItem(KEY))?.page ?? null; } catch { return null; } };

// Türkische Surennamen (so stehen sie auch im Diyanet-Mushaf)
export const SURA_TR = ["Fâtiha", "Bakara", "Âl-i İmrân", "Nisâ", "Mâide", "En'âm", "A'râf", "Enfâl", "Tevbe", "Yûnus", "Hûd", "Yûsuf", "Ra'd", "İbrâhîm", "Hicr", "Nahl", "İsrâ", "Kehf", "Meryem", "Tâhâ",
  "Enbiyâ", "Hac", "Mü'minûn", "Nûr", "Furkân", "Şuarâ", "Neml", "Kasas", "Ankebût", "Rûm", "Lokmân", "Secde", "Ahzâb", "Sebe'", "Fâtır", "Yâsîn", "Sâffât", "Sâd", "Zümer", "Mü'min",
  "Fussilet", "Şûrâ", "Zuhruf", "Duhân", "Câsiye", "Ahkâf", "Muhammed", "Fetih", "Hucurât", "Kâf", "Zâriyât", "Tûr", "Necm", "Kamer", "Rahmân", "Vâkıa", "Hadîd", "Mücâdele", "Haşr", "Mümtehine",
  "Saf", "Cuma", "Münâfikûn", "Tegâbün", "Talâk", "Tahrîm", "Mülk", "Kalem", "Hâkka", "Meâric", "Nûh", "Cin", "Müzzemmil", "Müddessir", "Kıyâme", "İnsân", "Mürselât", "Nebe'", "Nâziât", "Abese",
  "Tekvîr", "İnfitâr", "Mutaffifîn", "İnşikâk", "Bürûc", "Târık", "A'lâ", "Gâşiye", "Fecr", "Beled", "Şems", "Leyl", "Duhâ", "İnşirâh", "Tîn", "Alak", "Kadir", "Beyyine", "Zilzâl", "Âdiyât",
  "Kâria", "Tekâsür", "Asr", "Hümeze", "Fîl", "Kureyş", "Mâûn", "Kevser", "Kâfirûn", "Nasr", "Tebbet", "İhlâs", "Felak", "Nâs"];
// Weitere übliche Schreibweisen (Deutsch/Englisch), damit „Sure Yaseen“ oder „Al-Baqara“ auch passt
const SURA_ALT = { 1: ["fatiha", "fatihah", "faatiha"], 2: ["baqara", "baqarah", "bakarah"], 3: ["imran", "aliimran", "alimran"], 9: ["tawba", "tauba", "taubah"], 10: ["yunus", "jonas"], 12: ["yusuf", "josef"], 14: ["ibrahim", "abraham"],
  18: ["kahf"], 19: ["maryam", "maria"], 20: ["taha"], 36: ["yasin", "yaseen", "jasin"], 55: ["rahman", "rahmaan"], 56: ["waqia", "waqiah", "vakia"], 67: ["mulk"], 112: ["ikhlas", "ihlas"], 113: ["falaq"], 114: ["nas", "naas"] };

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const arNum = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
const latin = (x) => x.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().replace(/ı/g, "i").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/g, "");
const noArticle = (x) => x.replace(/^(?:a|e)(?:l|n|r|s|t|z|d|sh|ş)[-\s'’]/iu, "");
const skel = (x) => x.replace(/[aeiou]/g, "").replace(/(.)\1+/g, "$1");

// Surenname aus freiem Text: erst exakte Schreibweise, dann Konsonantengerüst (nur wenn eindeutig)
export function findSura(text) {
  const q = latin(noArticle(text.trim()));
  if (q.length < 2) return null;
  const names = SURA_TR.map((n, i) => [i + 1, [latin(noArticle(n)), latin(n), ...(SURA_ALT[i + 1] ?? [])]]);
  const exact = names.find(([, ns]) => ns.includes(q));
  if (exact) return exact[0];
  const hits = names.filter(([, ns]) => ns.some((n) => skel(n) === skel(q)));
  return hits.length === 1 ? hits[0][0] : null;
}

// Sprachbefehl / Suche: „Sure 2 Ayet 255“, „2:255“, „Yasin suresi“, „36. sure“, „Seite 250“, „Juz 30“, „Ayetel Kürsi“
export function parseKoranRef(raw) {
  const s = raw.replace(/İ/g, "i").toLowerCase().replace(/\s+/g, " ").trim();
  if (/ayat(?:ul|al|el|ül)?[ -]?kurs|ayet(?:-?el|ül)?[ -]?k[uü]rs|thronvers/u.test(s)) return { s: 2, a: 255 };
  let m = s.match(/(?<!\d)(\d{1,3})\s*[:/]\s*(\d{1,3})(?!\d)/);
  if (m) return { s: Number(m[1]), a: Number(m[2]) };
  const ayah = s.match(/(?:ayet|ayat|aya|vers|verse)\p{L}*\s+(\d{1,3})/u) ?? s.match(/(\d{1,3})\.?\s*(?:ayet|ayat|aya|vers)/u);
  let a = ayah ? Number(ayah[1]) : null;
  m = s.match(/(?:^|\s)(?:sure|sura|surah|suren)\s+(\d{1,3})(?!\d)(?:\s+(\d{1,3})(?!\d))?|(?<!\d)(\d{1,3})\.?\s*(?:sure|sura|surah)\p{L}*/u);
  if (m) return { s: Number(m[1] ?? m[3]), a: a ?? (m[2] ? Number(m[2]) : null) };
  // Name vor „suresi“ oder nach „Sure“
  m = s.match(/((?:\p{L}+[-' ])?\p{L}+)\s+sures[iı]/u) ?? s.match(/(?:^|\s)(?:sure|sura|surah)\s+((?:\p{L}+[-' ])?\p{L}+)/u);
  if (m) {
    const words = m[1].split(/\s+/);
    const n = findSura(m[1]) ?? findSura(words[words.length - 1]) ?? findSura(words[0]);
    // „Sure Kahf 10“: Zahl direkt nach dem Namen ist die Ayet
    a ??= Number(s.slice(m.index + m[0].length).match(/^\s+(\d{1,3})(?!\d)/)?.[1]) || null;
    if (n) return { s: n, a };
  }
  m = s.match(/(?:seite|sayfa)\p{L}*\s+(\d{1,3})(?!\d)|(?<!\d)(\d{1,3})\.?\s*(?:seite|sayfa)/u);
  if (m) return { page: Number(m[1] ?? m[2]) };
  m = s.match(/(?:juz|cüz)\p{L}*\s+(\d{1,2})(?!\d)|(?<!\d)(\d{1,2})\.?\s*(?:juz|cüz)/u);
  if (m) return { juz: Number(m[1] ?? m[2]) };
  return null;
}

// Für die Suche: Zeichen ohne Vokale, Lesezeichen und Alif, Hamza-Formen vereinheitlicht
export function arNorm(x) {
  return x.normalize("NFC").replace(/[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ‏۞۩]/g, "")
    .replace(/[ٱأإآا]/g, "").replace(/[ىیئ]/g, "ي").replace(/ؤ/g, "و").replace(/ة/g, "ه").replace(/ء/g, "").replace(/\s+/g, " ").trim();
}

// Seiten- und Juz-Zuordnung aus den Daten
export function buildIndex(d) {
  const off = [];
  let n = 0;
  for (const ay of d.a) { off.push(n); n += ay.length; }
  const flat = (s, a) => off[s - 1] + a - 1;
  const pageStart = d.p.map(([s, a]) => flat(s, a));
  const juzStart = d.j.map(([s, a]) => flat(s, a));
  const find = (starts, i) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= i) lo = mid; else hi = mid - 1; } return lo + 1; };
  const ref = (i) => { let s = 1; while (s < d.a.length && off[s] <= i) s++; return { s, a: i - off[s - 1] + 1 }; };
  return {
    total: n, flat, ref,
    pageOf: (s, a) => find(pageStart, flat(s, a)),
    juzOf: (s, a) => find(juzStart, flat(s, a)),
    juzPage: (j) => find(pageStart, juzStart[j - 1]),
    // Ayets einer Seite als [s, a, text]
    page(p) {
      const from = pageStart[p - 1], to = p < PAGES ? pageStart[p] : n;
      const out = [];
      for (let i = from; i < to; i++) { const r = ref(i); out.push([r.s, r.a, d.a[r.s - 1][r.a - 1]]); }
      return out;
    },
  };
}

export function createKoran(ctx) {
  const { t, esc, toast, openSheet, closeSheet, sheet, form, LOCALE, glaube } = ctx;
  let data = null, idx = null, loading = null, norm = null, hl = null, host = null;
  const st = (() => { try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; } })();
  st.page ||= 1; st.font ||= "amiri"; st.size ||= 26; st.marks ||= [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
  const suraName = (s) => SURA_TR[s - 1];

  function load() {
    loading ??= fetch(KORAN_DATA).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { data = d; idx = buildIndex(d); })
      .catch((e) => { loading = null; throw e; });
    return loading;
  }

  function render(h) {
    host = h;
    if (!data) {
      h.innerHTML = `<div class="empty">${t("Koran wird geladen …")}</div>`;
      load().then(() => render(h)).catch(() => {
        h.innerHTML = `<div class="empty">${t("Koran konnte nicht geladen werden.")}<br><button type="button" class="link-btn" id="kr-retry">${t("Nochmal")}</button></div>`;
        h.querySelector("#kr-retry").onclick = () => render(h);
      });
      return;
    }
    const p = Math.min(PAGES, Math.max(1, st.page));
    const ayahs = idx.page(p);
    const [s0, a0] = ayahs[0];
    const suras = [...new Set(ayahs.map((x) => x[0]))];
    const marked = st.marks.some((m) => m.p === p);
    let body = "";
    for (const [s, a, text] of ayahs) {
      if (a === 1) {
        body += `<div class="kr-sura"><span>${esc(data.s[s - 1][1])}</span></div>`;
        if (s !== 1 && s !== 9) body += `<div class="kr-basmala">${esc(data.a[0][0])}</div>`;
      }
      body += `<span class="kr-ay${hl === `${s}:${a}` ? " hl" : ""}" data-ay="${s}:${a}">${esc(text)}&nbsp;<span class="kr-end">۝${arNum(a)}</span></span> `;
    }
    const q = glaube?.quran();
    h.innerHTML = `<div class="kr-head">
        <div class="kr-title"><b>${suras.map((s) => esc(suraName(s))).join(" · ")}</b><span class="muted small">${t("Juz {n}", { n: idx.juzOf(s0, a0) })} · ${t("Seite {p}", { p })}</span></div>
        <div class="kr-tools">
          <button type="button" class="round-btn" id="kr-search" aria-label="${t("Suchen")}"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button>
          <button type="button" class="round-btn" id="kr-jump" aria-label="${t("Aufschlagen")}"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>
          <button type="button" class="round-btn ${marked ? "on" : ""}" id="kr-mark" aria-label="${t("Lesezeichen")}"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg></button>
          <button type="button" class="round-btn" id="kr-font" aria-label="${t("Schrift")}"><svg viewBox="0 0 24 24"><path d="M4 19 9 5l5 14M5.8 14h6.4M15 19l3-8 3 8M15.8 17h4.4"/></svg></button>
        </div>
      </div>
      <div class="kr-page font-${st.font}" dir="rtl" lang="ar" style="--kr-size:${st.size}px">${body}<div class="kr-num">${arNum(p)}</div></div>
      <div class="kr-nav">
        <button type="button" class="btn" id="kr-next" ${p >= PAGES ? "disabled" : ""}>‹ ${t("Weiter")}</button>
        <button type="button" class="kr-pnum" id="kr-pnum">${p} / ${PAGES}</button>
        <button type="button" class="btn" id="kr-prev" ${p <= 1 ? "disabled" : ""}>${t("Zurück")} ›</button>
      </div>
      ${q && !q.done ? `<button type="button" class="btn kr-read ${q.page >= p ? "" : "fill"}" id="kr-read">${q.page >= p ? t("Gelesen bis Seite {p}", { p: q.page }) : t("Bis Seite {p} gelesen", { p })}</button>` : ""}`;

    h.querySelector("#kr-next").onclick = () => go(p + 1);
    h.querySelector("#kr-prev").onclick = () => go(p - 1);
    h.querySelector("#kr-pnum").onclick = openJump;
    h.querySelector("#kr-jump").onclick = openJump;
    h.querySelector("#kr-search").onclick = openSearch;
    h.querySelector("#kr-font").onclick = openFont;
    h.querySelector("#kr-mark").onclick = () => toggleMark(p, s0, a0);
    h.querySelector("#kr-read")?.addEventListener("click", async () => {
      if (q.page >= p) return;
      const r = await glaube.setPage(p);
      toast(r.msg);
      render(h);
    });
    h.querySelectorAll("[data-ay]").forEach((el) => (el.onclick = () => openAyah(...el.dataset.ay.split(":").map(Number))));
    // Wischen wie im Buch: nach rechts = nächste Seite (Arabisch liest man von rechts nach links)
    const pg = h.querySelector(".kr-page");
    let x0 = null, y0 = 0;
    pg.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    pg.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 60) go(p + (dx > 0 ? 1 : -1));
    });
    if (hl) requestAnimationFrame(() => h.querySelector(".kr-ay.hl")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  function go(p, mark = null) {
    if (p < 1 || p > PAGES) return;
    const turned = p !== st.page;
    st.page = p; hl = mark; save();
    if (host?.isConnected) { render(host); if (turned && !mark) window.scrollTo(0, 0); }
  }
  const goAyah = (s, a) => go(idx.pageOf(s, a), `${s}:${a}`);

  function toggleMark(p, s, a) {
    const i = st.marks.findIndex((m) => m.p === p);
    if (i >= 0) st.marks.splice(i, 1); else st.marks.unshift({ p, s, a, at: Date.now() });
    st.marks = st.marks.slice(0, 50);
    save();
    toast(i >= 0 ? t("Lesezeichen entfernt") : t("Lesezeichen: Seite {p}", { p }));
    render(host);
  }

  function openAyah(s, a) {
    const p = idx.pageOf(s, a), text = data.a[s - 1][a - 1];
    hl = `${s}:${a}`;
    host.querySelectorAll(".kr-ay.hl").forEach((x) => x.classList.remove("hl"));
    host.querySelector(`[data-ay="${s}:${a}"]`)?.classList.add("hl");
    const marked = st.marks.some((m) => m.s === s && m.a === a);
    form.innerHTML = `<h3>${esc(suraName(s))} ${s}:${a}</h3><p class="small muted">${t("Seite {p}", { p })} · ${t("Juz {n}", { n: idx.juzOf(s, a) })}</p>
      <p class="kr-quote font-${st.font}" dir="rtl" lang="ar">${esc(text)}</p>
      <div class="sheet-actions kr-acts">
        <button type="button" class="primary" id="kr-a-mark">${marked ? t("Lesezeichen entfernen") : t("Lesezeichen hier")}</button>
        <button type="button" class="ghost" id="kr-a-copy">${t("Text kopieren")}</button>
      </div>`;
    form.onsubmit = (e) => e.preventDefault();
    form.querySelector("#kr-a-mark").onclick = () => {
      const i = st.marks.findIndex((m) => m.s === s && m.a === a);
      if (i >= 0) st.marks.splice(i, 1); else st.marks.unshift({ p, s, a, at: Date.now() });
      save(); closeSheet(sheet); render(host);
      toast(i >= 0 ? t("Lesezeichen entfernt") : t("Lesezeichen: {s} {r}", { s: suraName(s), r: `${s}:${a}` }));
    };
    form.querySelector("#kr-a-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(`${text} (${suraName(s)} ${s}:${a})`); toast(t("Kopiert")); } catch { toast(t("Kopieren nicht möglich")); }
      closeSheet(sheet);
    };
    openSheet(sheet);
  }

  function openJump() {
    if (!data) return;
    const cur = idx.page(st.page)[0];
    const opts = SURA_TR.map((n, i) => `<option value="${i + 1}" ${i + 1 === cur[0] ? "selected" : ""}>${i + 1}. ${esc(n)} · ${data.a[i].length}</option>`).join("");
    const marks = st.marks.map((m) => `<button type="button" class="kr-res" data-go="${m.s}:${m.a}"><b>${esc(suraName(m.s))} ${m.s}:${m.a}</b><span class="muted small">${t("Seite {p}", { p: m.p })}</span></button>`).join("");
    form.innerHTML = `<h3>${t("Aufschlagen")}</h3>
      <label>${t("Seite")}</label>
      <div class="shop-add"><input id="kr-j-page" inputmode="numeric" pattern="[0-9]*" placeholder="1–604" autocomplete="off"><button type="button" class="primary" id="kr-j-pgo" aria-label="${t("Öffnen")}">→</button></div>
      <label>${t("Sure und Ayet")}</label>
      <select id="kr-j-sura">${opts}</select>
      <div class="shop-add"><input id="kr-j-ayah" inputmode="numeric" pattern="[0-9]*" placeholder="${t("Ayet (optional)")}" autocomplete="off"><button type="button" class="primary" id="kr-j-sgo" aria-label="${t("Öffnen")}">→</button></div>
      <label>${t("Juz")}</label>
      <div class="kr-juz">${Array.from({ length: 30 }, (_, i) => `<button type="button" class="chip ${idx.juzOf(cur[0], cur[1]) === i + 1 ? "on" : ""}" data-juz="${i + 1}">${i + 1}</button>`).join("")}</div>
      ${marks ? `<label>${t("Lesezeichen")}</label><div class="kr-results">${marks}</div>` : ""}`;
    form.onsubmit = (e) => e.preventDefault();
    const done = (fn) => { closeSheet(sheet); fn(); };
    form.querySelector("#kr-j-pgo").onclick = () => { const p = Number(form.querySelector("#kr-j-page").value); if (p >= 1 && p <= PAGES) done(() => go(p)); };
    form.querySelector("#kr-j-page").onkeydown = (e) => { if (e.key === "Enter") form.querySelector("#kr-j-pgo").click(); };
    form.querySelector("#kr-j-sgo").onclick = () => {
      const s = Number(form.querySelector("#kr-j-sura").value), max = data.a[s - 1].length;
      const a = Math.min(max, Math.max(1, Number(form.querySelector("#kr-j-ayah").value) || 1));
      done(() => goAyah(s, a));
    };
    form.querySelector("#kr-j-ayah").onkeydown = (e) => { if (e.key === "Enter") form.querySelector("#kr-j-sgo").click(); };
    form.querySelectorAll("[data-juz]").forEach((b) => (b.onclick = () => done(() => go(idx.juzPage(Number(b.dataset.juz))))));
    form.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => done(() => goAyah(...b.dataset.go.split(":").map(Number)))));
    openSheet(sheet);
  }

  // Suche: Stelle („2:255“, „Yasin“) oder arabische Wörter im ganzen Koran
  function search(q) {
    const out = [];
    const ref = parseKoranRef(q) ?? (/^\p{Script=Latin}/u.test(q.trim()) ? (findSura(q) ? { s: findSura(q) } : null) : null);
    if (ref?.s && ref.s <= 114) {
      const a = Math.min(data.a[ref.s - 1].length, Math.max(1, ref.a ?? 1));
      out.push({ s: ref.s, a, text: data.a[ref.s - 1][a - 1], label: ref.a ? `${suraName(ref.s)} ${ref.s}:${a}` : `${ref.s}. ${suraName(ref.s)}` });
    } else if (ref?.page >= 1 && ref.page <= PAGES) {
      const [s, a, text] = idx.page(ref.page)[0];
      out.push({ s, a, text, label: t("Seite {p}", { p: ref.page }) });
    }
    const nq = arNorm(q);
    if (!/[؀-ۿ]/.test(q) || nq.length < 2) return { list: out, total: out.length };
    norm ??= data.a.map((ay) => ay.map(arNorm));
    let total = 0;
    norm.forEach((ay, si) => ay.forEach((x, ai) => {
      if (!x.includes(nq)) return;
      total++;
      if (out.length < 100) out.push({ s: si + 1, a: ai + 1, text: data.a[si][ai], label: `${suraName(si + 1)} ${si + 1}:${ai + 1}` });
    }));
    return { list: out, total };
  }

  function openSearch() {
    if (!data) return;
    form.innerHTML = `<h3>${t("Im Koran suchen")}</h3>
      <input id="kr-q" dir="auto" placeholder="${t("Arabisch, Sure oder 2:255")}" autocomplete="off" enterkeyhint="search">
      <p class="small muted" id="kr-count"></p>
      <div class="kr-results" id="kr-res"></div>`;
    form.onsubmit = (e) => e.preventDefault();
    const inp = form.querySelector("#kr-q"), res = form.querySelector("#kr-res"), cnt = form.querySelector("#kr-count");
    let timer;
    inp.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = inp.value.trim();
        if (!q) { res.innerHTML = ""; cnt.textContent = ""; return; }
        const { list, total } = search(q);
        cnt.textContent = total ? (total > list.length ? t("{n} Treffer, die ersten {m}", { n: total, m: list.length }) : t("{n} Treffer", { n: total })) : t("Nichts gefunden");
        res.innerHTML = list.map((r) => `<button type="button" class="kr-res" data-go="${r.s}:${r.a}"><b>${esc(r.label)}</b><span class="muted small">${t("Seite {p}", { p: idx.pageOf(r.s, r.a) })}</span><span class="kr-snip font-${st.font}" dir="rtl" lang="ar">${esc(r.text)}</span></button>`).join("");
        res.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => { closeSheet(sheet); goAyah(...b.dataset.go.split(":").map(Number)); }));
      }, 180);
    };
    openSheet(sheet);
    setTimeout(() => inp.focus(), 250);
  }

  function openFont() {
    const fonts = [["amiri", "Amiri", "Naskh, türkischer Stil"], ["scheherazade", "Scheherazade", "klassisch, etwas breiter"]];
    const draw = () => {
      form.innerHTML = `<h3>${t("Schrift")}</h3>
        ${fonts.map(([k, n, d]) => `<button type="button" class="kr-fopt ${st.font === k ? "on" : ""}" data-font="${k}"><span class="font-${k}" dir="rtl" lang="ar">${esc(data?.a[0][1] ?? "ٱلۡحَمۡدُ لِلَّهِ")}</span><small>${n} · ${t(d)}</small></button>`).join("")}
        <label>${t("Größe")}</label>
        <div class="seg"><button type="button" data-size="-2">A−</button><button type="button" disabled>${st.size}</button><button type="button" data-size="2">A+</button></div>`;
      form.onsubmit = (e) => e.preventDefault();
      form.querySelectorAll("[data-font]").forEach((b) => (b.onclick = () => { st.font = b.dataset.font; save(); draw(); render(host); }));
      form.querySelectorAll("[data-size]").forEach((b) => (b.onclick = () => { st.size = Math.min(44, Math.max(18, st.size + Number(b.dataset.size))); save(); draw(); render(host); }));
    };
    draw();
    openSheet(sheet);
  }

  // Sprachbefehl: { page } | { s, a } | { juz } | {} (= weiterlesen)
  async function open(ref = {}) {
    try { await load(); } catch { return { msg: t("Koran konnte nicht geladen werden.") }; }
    if (ref.s >= 1 && ref.s <= 114) {
      const a = Math.min(data.a[ref.s - 1].length, Math.max(1, ref.a ?? 1));
      st.page = idx.pageOf(ref.s, a); hl = ref.a ? `${ref.s}:${a}` : null; save();
      return { msg: `${suraName(ref.s)}${ref.a ? ` ${ref.s}:${a}` : ""} · ${t("Seite {p}", { p: st.page })}` };
    }
    if (ref.juz >= 1 && ref.juz <= 30) { st.page = idx.juzPage(ref.juz); hl = null; save(); return { msg: t("Juz {n}", { n: ref.juz }) + " · " + t("Seite {p}", { p: st.page }) }; }
    if (ref.page >= 1 && ref.page <= PAGES) { st.page = ref.page; hl = null; save(); return { msg: t("Seite {p}", { p: ref.page }) }; }
    if (ref.page) return { msg: t("Der Koran hat {n} Seiten.", { n: PAGES }) };
    return { msg: null };
  }

  // Pfeiltasten blättern (Tastatur am iPad/Mac)
  document.addEventListener("keydown", (e) => {
    if (!host?.isConnected || host.hidden || !data || document.querySelector("dialog[open]") || e.target.closest?.("input,textarea,select")) return;
    if (e.key === "ArrowLeft") go(st.page + 1);
    if (e.key === "ArrowRight") go(st.page - 1);
  });

  return { render, open, openSearch, openJump, page: () => st.page };
}
