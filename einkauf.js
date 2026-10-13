// Einkaufsliste: Artikel nach Laden und Gang sortiert, Halal-Prüfung, Vorschläge aus dem eigenen Kaufrhythmus.
// Alles regelbasiert. Daten hängen an einer Liste (shopping_lists), damit später Familienmitglieder mitlesen können.

// Gänge in der Reihenfolge, in der man sie im Laden meist abläuft
export const CATS = {
  obst: "Obst & Gemüse",
  brot: "Brot & Backwaren",
  kuehl: "Milch, Eier & Kühlregal",
  fleisch: "Fleisch (halal)",
  trocken: "Reis, Nudeln & Vorrat",
  gewuerz: "Öl, Gewürze & Saucen",
  snacks: "Süßes & Snacks",
  tk: "Tiefkühl",
  getraenke: "Getränke",
  drogerie: "Drogerie & Haushalt",
  gesundheit: "Supplements & Apotheke",
  sonstiges: "Sonstiges",
};
const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export const STORES = { supermarkt: "Supermarkt", tuerk: "Türkischer Markt", drogerie: "Drogerie", sonst: "Sonstiges" };

// Stichwörter DE + TR; das längste passende Wort gewinnt ("Erdnussbutter" → Vorrat, nicht Kühlregal)
const KW = {
  obst: "obst gemüse apfel äpfel banane birne orange mandarine zitrone limette beeren erdbeer heidelbeer himbeer traube trauben kiwi mango avocado melone tomate tomaten gurke paprika zwiebel knoblauch kartoffel süßkartoffel karotte möhre brokkoli zucchini spinat salat rucola pilze champignon lauch frühlingszwiebel petersilie minze dill koriander aubergine kohl blumenkohl rotkohl ingwer sellerie meyve sebze elma muz armut portakal mandalina limon çilek üzüm domates salatalık biber soğan sarımsak patates havuç brokoli kabak ıspanak marul maydanoz nane dereotu patlıcan lahana zencefil mantar",
  brot: "brot brötchen toast toastbrot fladenbrot pide simit wrap wraps tortilla knäckebrot vollkornbrot dinkelbrot glutenfrei ekmek lavaş yufka bazlama",
  kuehl: "milch hafermilch skyr quark magerquark joghurt jogurt käse feta hirtenkäse butter sahne eier frischkäse ayran mozzarella halloumi kefir süt yoğurt peynir beyaz tereyağı yumurta kaymak krema hellim",
  fleisch: "fleisch hähnchen hähnchenbrust hühnchen huhn pute puten putenbrust rind rinder rinderhack hack hackfleisch kalb lamm sucuk wurst aufschnitt köfte steak döner hähnchenschenkel et tavuk göğsü kıyma dana kuzu hindi pastırma kavurma",
  trocken: "reis basmati nudeln nudel pasta spaghetti bulgur couscous linsen kichererbsen bohnen haferflocken hafer mehl zucker müsli granola cornflakes konserve dose tomatenmark passata honig marmelade erdnussbutter nüsse mandeln walnüsse cashews oliven salz datteln reiswaffeln pirinç makarna şehriye mercimek nohut fasulye yulaf un şeker bal reçel zeytin fındık ceviz badem salça hurma tuz",
  gewuerz: "öl olivenöl rapsöl kokosöl essig gewürz gewürze pfeffer paprikapulver kreuzkümmel kurkuma chili chiliflocken zimt oregano ketchup senf mayo mayonnaise sauce soße sojasauce brühe yağ zeytinyağı sirke baharat karabiber kimyon pul biber tarçın kekik sos ketçap hardal",
  snacks: "schokolade chips kekse keks gummibärchen fruchtgummi riegel proteinriegel popcorn kuchen waffeln çikolata cips bisküvi kraker gofret",
  tk: "tiefkühl tiefkühlgemüse tk gefroren pizza eis pommes beerenmix dondurulmuş dondurma",
  getraenke: "wasser mineralwasser sprudel saft apfelsaft orangensaft cola tee kaffee limo eistee energy su maden soda meyve suyu çay kahve kola gazoz",
  drogerie: "zahnpasta zahnbürste zahnseide shampoo spülung duschgel seife deo deodorant rasierer rasierschaum klopapier toilettenpapier küchenrolle taschentücher spülmittel waschmittel weichspüler müllbeutel schwamm creme sonnencreme bodylotion haargel wattepads diş macunu fırçası şampuan sabun deodorant tuvalet kağıdı peçete havlu deterjan çöp poşeti",
  gesundheit: "vitamin vitamine magnesium zink omega kreatin proteinpulver whey ashwagandha d3 b12 eisen tabletten kapseln pflaster ibuprofen paracetamol nasenspray elektrolyte ilaç protein tozu",
};
const KW_LIST = Object.entries(KW).flatMap(([c, s]) => s.split(" ").map((k) => [k, c]));
const low = (s) => s.toLocaleLowerCase("de-DE");
const KW_WORDS = new Set(KW_LIST.map(([k]) => k));

export function classify(name) {
  const n = low(name);
  const words = n.split(/[^\p{L}\d]+/u).filter(Boolean);
  let best = null, len = 0;
  for (const [k, c] of KW_LIST) {
    // kurze Wörter nur exakt ("ei", "su", "tk"), längere auch in Zusammensetzungen ("Hähnchenbrust", "Rinderhack")
    const hit = k.length <= 3 ? words.includes(k) : k.includes(" ") ? n.includes(k) : words.some((w) => w.startsWith(k) || w.endsWith(k));
    if (hit && k.length > len) { best = c; len = k.length; }
  }
  // "…öl" und "…saft" als Wortende
  if (!best && words.some((w) => w.endsWith("öl"))) best = "gewuerz";
  if (words.some((w) => w.endsWith("saft"))) best = "getraenke";
  return best ?? "sonstiges";
}
export const storeFor = (cat) => (cat === "fleisch" ? "tuerk" : cat === "drogerie" || cat === "gesundheit" ? "drogerie" : "supermarkt");

// Halal-Regeln des Nutzers: kein Schwein, kein Fisch, keine Gelatine, kein Alkohol
const SAFE = /(rind|puten|pute|hähnchen|geflügel|halal|helal|dana|tavuk|hindi|vegan|vegetar)/i;
const HARAM = [
  [/schwein|bacon|domuz|jambon/i, "Schwein"],
  [/speck|schinken|salami|leberwurst|mortadella|chorizo/i, "Schwein", true],
  [/(?<!\p{L})(\p{L}*wein|\p{L}*bier|sekt|likör|wodka|whisky|rum|rakı|şarap|bira|alkohol)(?!\p{L})/iu, "Alkohol"],
  [/fisch|lachs|thunfisch|garnele|shrimp|scampi|sardine|makrele|hering|forelle|kabeljau|surimi|sushi|balık|somon|ton balığı|karides|hamsi/i, "Fisch"],
];
const CHECK = [
  [/gummibär|fruchtgummi|marshmallow|gelatine|jelatin|götterspeise|lakritz|weingummi|jelibon/i, "Oft mit Gelatine, auf Halal-Siegel achten"],
  [/kapseln|omega|fischöl/i, "Auf vegane Kapseln (HPMC) und Algenöl statt Fischöl achten"],
  [/vanilleextrakt|aroma|tiramisu|weinbrand|rumkugel/i, "Kann Alkohol enthalten"],
  [/wurst|aufschnitt|hack|fleisch|(?<!\p{L})(sucuk|döner|köfte|steak|hähnchen|hühn|pute|rind|lamm|kalb|kıyma|tavuk|dana|kuzu|hindi)|(?<!\p{L})et(?!\p{L})/iu, "Nur halal kaufen"],
];
// Rückgabe: null, "haram:Grund" oder "check:Hinweis"
export function halalFlag(name) {
  for (const [re, why, unlessSafe] of HARAM) if (re.test(name) && !(unlessSafe && SAFE.test(name))) return "haram:" + why;
  for (const [re, why] of CHECK) if (re.test(name)) return "check:" + why;
  return null;
}

// Mengen: "2 Liter Milch", "500 g Hack", "6 Eier", "Skyr 2x", "1 kilo kıyma"
const NUMW = { ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, zehn: 10, zwölf: 12, bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, on: 10, halbe: 0.5, halber: 0.5, yarım: 0.5 };
const UNITS = [[/^(l|liter|litre|lt)$/i, "l"], [/^ml$/i, "ml"], [/^(g|gr|gramm|gram)$/i, "g"], [/^(kg|kilo|kilogramm)$/i, "kg"], [/^(stück|stk|tane|adet|x)$/i, ""],
  [/^(packung|packungen|pck|pack|paket|packet)$/i, "Pck"], [/^(dose|dosen|kutu)$/i, "Dose"], [/^(flasche|flaschen|şişe)$/i, "Fl"], [/^(bund|demet)$/i, "Bund"], [/^(becher)$/i, "Becher"], [/^(glas|gläser|kavanoz)$/i, "Glas"], [/^(netz|tüte|beutel|poşet)$/i, "Beutel"]];
const unitOf = (w) => UNITS.find(([re]) => re.test(w))?.[1];
const cap = (s) => s.charAt(0).toLocaleUpperCase("de-DE") + s.slice(1);

export function parseOne(raw) {
  let w = raw.trim().replace(/^(?:noch|auch|bitte|etwas|ein bisschen|biraz|bi)\s+/i, "").split(/\s+/).filter(Boolean);
  let qty = null;
  const num = (x) => (x == null ? null : /^\d+([.,]\d+)?x?$/i.test(x) ? Number(x.replace(/x$/i, "").replace(",", ".")) : NUMW[low(x)] ?? null);
  // vorne: Zahl [Einheit] Name
  if (w.length > 1 && num(w[0]) != null) {
    const n = num(w[0]); w.shift();
    const u = w.length > 1 ? unitOf(w[0]) : undefined;
    if (u !== undefined) w.shift();
    qty = `${String(n).replace(".", ",")}${u ? " " + u : ""}`;
  } else if (w.length > 1 && num(w[w.length - 1]) != null) {
    // hinten: Name Zahl ("Skyr 2", "Milch 2x")
    qty = String(num(w.pop())).replace(".", ",");
  } else if (w.length > 2 && unitOf(w[w.length - 1]) !== undefined && num(w[w.length - 2]) != null) {
    const u = unitOf(w.pop()); const n = num(w.pop());
    qty = `${String(n).replace(".", ",")}${u ? " " + u : ""}`;
  }
  // Türkischer Akkusativ: "sütü" → "süt", "kıymayı" → "kıyma", "ekmeği" → "ekmek"
  if (w.length) {
    const last = low(w[w.length - 1]);
    const cut = [last.replace(/y?[ıiuü]$/, ""), last.replace(/ği$/, "k"), last.replace(/ğı$/, "k")].find((c) => c !== last && KW_WORDS.has(c));
    if (cut) w[w.length - 1] = cut;
  }
  const name = w.join(" ").replace(/^(?:der|die|das|den|ein|eine|einen)\s+/i, "").trim();
  return name ? { name: cap(name), qty } : null;
}
// Mehrere Artikel aus einem Satz: Komma, "und", "ve", "sowie", "+"
export function parseItems(text) {
  return text.split(/\s*(?:,|;|\+|&|\bund\b|\bsowie\b|\bve\b|\bile\b)\s*/i).map(parseOne).filter(Boolean);
}
export const normName = (s) => low(s).replace(/\(.*?\)/g, "").replace(/[^\p{L}\d ]/gu, " ").replace(/\s+/g, " ").trim();

// Kaufrhythmus: Artikel, die mindestens 2× gekauft wurden und jetzt wieder fällig sind
export function dueSuggestions(items, now = new Date()) {
  const open = new Set(items.filter((x) => !x.purchased_at).map((x) => normName(x.name)));
  const by = {};
  for (const x of items) if (x.purchased_at) (by[normName(x.name)] ??= { x, days: new Set() }).days.add(x.purchased_at.slice(0, 10));
  const out = [];
  for (const [n, { x, days }] of Object.entries(by)) {
    if (open.has(n) || days.size < 2) continue;
    const d = [...days].sort().map((s) => Date.parse(s + "T12:00"));
    const avg = (d[d.length - 1] - d[0]) / (d.length - 1) / 864e5;
    const since = (now - d[d.length - 1]) / 864e5;
    if (avg < 2 || avg > 60) continue;
    if (since >= avg * 0.85) out.push({ name: x.name, qty: x.qty, category: x.category, store: x.store, every: Math.round(avg), ratio: since / avg });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, 6);
}

// Grundliste aus Ernährungsplan und Vorlieben (halal, laktosefrei, wenig Weizen, viel Eiweiß)
const BASICS = ["Skyr", "Hähnchenbrust (halal)", "Rinderhack (halal)", "Eier", "Laktosefreie Milch", "Magerquark", "Reis", "Haferflocken", "Brokkoli", "Paprika", "Bananen", "Beeren (TK)", "Olivenöl"];

export function createShopping(ctx) {
  const { db, t, esc, $, toast, openSheet, closeSheet, sheet, form, LOCALE, lowSupplies, supplyDays } = ctx;
  const S = { list: null, items: [], trips: [], loaded: false, loading: null, store: "alle", host: null };
  const openItems = () => S.items.filter((x) => !x.purchased_at);
  const remembered = (name) => S.items.find((x) => normName(x.name) === normName(name) && x.purchased_at);
  const eur = (n) => Number(n).toLocaleString(LOCALE(), { style: "currency", currency: "EUR" });

  function load(force = false) {
    if (S.loaded && !force) return Promise.resolve();
    return (S.loading ??= doLoad().finally(() => { S.loading = null; }));
  }
  async function doLoad() {
    let { data: lists } = await db.from("shopping_lists").select("*").order("created_at");
    if (!lists?.length) {
      const { data, error } = await db.from("shopping_lists").insert({ name: "Einkaufsliste" }).select().single();
      if (error) { toast(error.message); return; }
      lists = [data];
    }
    S.list = lists[0];
    const [i, tr] = await Promise.all([
      db.from("shopping_items").select("*").eq("list_id", S.list.id).order("created_at", { ascending: false }).limit(1500),
      db.from("shopping_trips").select("*").eq("list_id", S.list.id).order("finished_at", { ascending: false }).limit(200),
    ]);
    S.items = i.data ?? []; S.trips = tr.data ?? [];
    S.loaded = true;
  }

  // Neue Artikel: gleiche offene werden zusammengelegt, Laden und Gang aus der eigenen Historie, sonst per Stichwort
  async function add(parsed) {
    await load();
    const added = [], merged = [];
    for (const p of parsed) {
      const same = openItems().find((x) => normName(x.name) === normName(p.name));
      if (same) {
        if (p.qty && p.qty !== same.qty) { await db.from("shopping_items").update({ qty: p.qty, done: false }).eq("id", same.id); Object.assign(same, { qty: p.qty, done: false }); }
        merged.push(same.name); continue;
      }
      const prev = remembered(p.name);
      const category = prev?.category ?? classify(p.name);
      const row = { list_id: S.list.id, name: p.name, qty: p.qty ?? null, category, store: prev?.store ?? p.store ?? storeFor(category), flag: halalFlag(p.name), note: p.note ?? null };
      const { data, error } = await db.from("shopping_items").insert(row).select().single();
      if (error) { toast(error.message); continue; }
      S.items.unshift(data); added.push(data);
    }
    rerender();
    const warn = added.find((x) => x.flag?.startsWith("haram:"));
    let msg = added.length ? t("Auf der Liste: {x}", { x: added.map((x) => x.name + (x.qty ? ` (${x.qty})` : "")).join(", ") }) : "";
    if (merged.length) msg += (msg ? " · " : "") + t("Steht schon drauf: {x}", { x: merged.join(", ") });
    if (warn) msg += " · " + t("Achtung, nicht halal: {x} ({y})", { x: warn.name, y: t(warn.flag.slice(6)) });
    return { msg, undo: added.length ? async () => { for (const x of added) await remove(x, true); } : null };
  }
  async function remove(x, quiet = false) {
    await db.from("shopping_items").delete().eq("id", x.id);
    S.items = S.items.filter((y) => y.id !== x.id);
    if (!quiet) rerender();
  }
  async function setDone(x, done) {
    const patch = { done, done_at: done ? new Date().toISOString() : null };
    await db.from("shopping_items").update(patch).eq("id", x.id);
    Object.assign(x, patch);
    rerender();
  }
  const find = (name) => {
    const n = normName(name);
    const list = openItems();
    return list.find((x) => normName(x.name) === n) ?? list.find((x) => normName(x.name).includes(n) || n.includes(normName(x.name)));
  };

  // Einkauf abschließen: abgehakte Artikel wandern in den Verlauf, Betrag optional
  async function finish(amount = null, store = null) {
    await load();
    const done = openItems().filter((x) => x.done);
    if (!done.length) return t("Noch nichts abgehakt.");
    const counts = {};
    for (const x of done) counts[x.store] = (counts[x.store] ?? 0) + 1;
    store ??= Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const { data: trip, error } = await db.from("shopping_trips").insert({ list_id: S.list.id, store, amount, items: done.length }).select().single();
    if (error) return error.message;
    const now = new Date().toISOString();
    for (const x of done) { await db.from("shopping_items").update({ purchased_at: now, trip_id: trip.id }).eq("id", x.id); Object.assign(x, { purchased_at: now, trip_id: trip.id }); }
    S.trips.unshift(trip);
    rerender();
    return t("Einkauf gespeichert: {n} Artikel{a}", { n: done.length, a: amount != null ? ", " + eur(amount) : "" });
  }

  // Sprachbefehle
  async function runVoice(c) {
    await load();
    if (c.action === "add") { const r = await add(c.items); return r; }
    if (c.action === "show") return { msg: openItems().filter((x) => !x.done).length ? t("{n} Artikel offen", { n: openItems().filter((x) => !x.done).length }) : t("Die Einkaufsliste ist leer.") };
    if (c.action === "finish") return { msg: await finish(c.amount ?? null) };
    const hits = [], miss = [];
    for (const p of c.items) { const x = find(p.name); x ? hits.push(x) : miss.push(p.name); }
    if (c.action === "check") {
      for (const x of hits) await setDone(x, true);
      return { msg: [hits.length ? t("Im Wagen: {x}", { x: hits.map((x) => x.name).join(", ") }) : "", miss.length ? t("Nicht auf der Liste: {x}", { x: miss.join(", ") }) : ""].filter(Boolean).join(" · "),
        undo: async () => { for (const x of hits) await setDone(x, false); } };
    }
    if (c.action === "remove") {
      const copies = hits.map((x) => ({ ...x }));
      for (const x of hits) await remove(x, true);
      rerender();
      return { msg: [hits.length ? t("Gestrichen: {x}", { x: hits.map((x) => x.name).join(", ") }) : "", miss.length ? t("Nicht auf der Liste: {x}", { x: miss.join(", ") }) : ""].filter(Boolean).join(" · "),
        undo: async () => { for (const x of copies) { const { id, ...row } = x; const { data } = await db.from("shopping_items").insert(row).select().single(); if (data) S.items.unshift(data); } rerender(); } };
    }
    return null;
  }

  // Vorschläge: fällig nach Rhythmus, knappe Supplements, Grundliste für den Anfang
  function suggestions() {
    const open = new Set(openItems().map((x) => normName(x.name)));
    const out = dueSuggestions(S.items).map((x) => ({ ...x, why: t("alle {n} Tage", { n: x.every }) }));
    for (const s of lowSupplies?.() ?? []) if (!open.has(normName(s.name))) out.push({ name: s.name, category: "gesundheit", store: "drogerie", why: supplyDays(s) <= 0 ? t("leer") : t("noch {n} Tage", { n: supplyDays(s) }) });
    const bought = new Set(S.items.filter((x) => x.purchased_at).map((x) => normName(x.name))).size;
    const known = new Set([...open, ...S.items.filter((x) => x.purchased_at).map((x) => normName(x.name)), ...out.map((x) => normName(x.name))]);
    const base = (n) => normName(n).replace(/\s*halal$/, "");
    const basics = bought < 8 ? BASICS.filter((n) => ![n, t(n)].some((v) => known.has(normName(v)) || known.has(base(v)))) : [];
    return { due: out, basics };
  }
  function monthStats() {
    const m = new Date().toISOString().slice(0, 7);
    const trips = S.trips.filter((x) => x.finished_at.slice(0, 7) === m);
    return { n: trips.length, sum: trips.reduce((a, x) => a + (Number(x.amount) || 0), 0), withAmount: trips.some((x) => x.amount != null) };
  }

  // ---------- Ansicht ----------
  function rerender() { if (S.host?.isConnected) render(S.host); ctx.onChange?.(); }
  function render(host) {
    S.host = host;
    if (!S.loaded) { host.innerHTML = `<div class="empty">${t("Lade …")}</div>`; load().then(() => render(host)); return; }
    const all = openItems();
    const stores = Object.keys(STORES).filter((k) => all.some((x) => x.store === k && !x.done));
    if (S.store !== "alle" && !stores.includes(S.store)) S.store = "alle";
    const shown = all.filter((x) => S.store === "alle" || x.store === S.store);
    const todo = shown.filter((x) => !x.done), cart = shown.filter((x) => x.done);
    const sug = suggestions();
    const flagHtml = (x) => {
      if (!x.flag) return "";
      const [k, why] = [x.flag.split(":")[0], x.flag.slice(x.flag.indexOf(":") + 1)];
      return `<span class="shop-flag ${k}">${k === "haram" ? t("nicht halal: {x}", { x: t(why) }) : t(why)}</span>`;
    };
    const row = (x) => `<div class="shop-row ${x.done ? "done" : ""}">
        <button type="button" class="check ${x.done ? "on" : ""}" data-shop-done="${x.id}" aria-label="${t(x.done ? "Wieder offen" : "Abhaken")}">${x.done ? CHECK_SVG : ""}</button>
        <button type="button" class="body" data-shop-edit="${x.id}"><span class="title">${esc(x.name)}${x.qty ? ` <em>${esc(x.qty)}</em>` : ""}</span>
        ${(S.store === "alle" && x.store !== "supermarkt") || x.note || x.flag ? `<span class="sub">${S.store === "alle" && x.store !== "supermarkt" ? `<b>${esc(t(STORES[x.store] ?? x.store))}</b>` : ""}${x.note ? " " + esc(x.note) : ""} ${flagHtml(x)}</span>` : ""}</button>
      </div>`;
    let html = `<form class="shop-add" id="shop-add" autocomplete="off"><input id="shop-in" placeholder="${t("Was fehlt? z. B. Milch, 6 Eier, 500 g Hack")}" enterkeyhint="done"><button class="primary" aria-label="${t("Hinzufügen")}">+</button></form>`;
    if (stores.length > 1) html += `<div class="chips shop-stores"><button type="button" class="chip ${S.store === "alle" ? "on" : ""}" data-store="alle">${t("Alle")} ${all.filter((x) => !x.done).length}</button>${stores.map((k) => `<button type="button" class="chip ${S.store === k ? "on" : ""}" data-store="${k}">${t(STORES[k])} ${all.filter((x) => x.store === k && !x.done).length}</button>`).join("")}</div>`;
    if (sug.due.length) html += `<p class="eyebrow" style="margin-top:16px">${t("Bald wieder fällig")}</p><div class="chips shop-sug">${sug.due.map((x, i) => `<button type="button" class="chip" data-sug="${i}">+ ${esc(t(x.name))} <small>${esc(x.why)}</small></button>`).join("")}</div>`;
    if (!todo.length && !cart.length) html += `<div class="empty">${t("Die Einkaufsliste ist leer.")}</div>`;
    for (const [k, label] of Object.entries(CATS)) {
      const list = todo.filter((x) => (x.category ?? "sonstiges") === k);
      if (!list.length) continue;
      html += `<p class="eyebrow shop-cat">${t(label)}</p><div class="card shop-card">${list.map(row).join("")}</div>`;
    }
    if (cart.length) {
      html += `<p class="eyebrow shop-cat">${t("Im Wagen")} · ${cart.length}</p><div class="card shop-card">${cart.map(row).join("")}</div>
        <button class="primary" id="shop-finish">${t("Einkauf abschließen")}</button>`;
    }
    if (sug.basics.length) html += `<p class="eyebrow" style="margin-top:18px">${t("Meal-Prep-Grundliste")}</p><div class="chips shop-sug wrap">${sug.basics.map((n) => `<button type="button" class="chip" data-basic="${esc(t(n))}">+ ${esc(t(n))}</button>`).join("")}</div>`;
    const ms = monthStats();
    if (ms.n) html += `<p class="small muted shop-stats">${t("Diesen Monat: {n} Einkäufe", { n: ms.n })}${ms.withAmount ? " · " + eur(ms.sum) : ""}</p>`;
    host.innerHTML = html;

    const byId = (id) => S.items.find((x) => x.id === id);
    host.querySelector("#shop-add").onsubmit = async (e) => {
      e.preventDefault();
      const v = $("#shop-in").value.trim();
      if (!v) return;
      const r = await add(parseItems(v));
      if (r.msg) toast(r.msg, r.undo ? async () => { await r.undo(); rerender(); } : null);
      $("#shop-in")?.focus();
    };
    host.querySelectorAll("[data-store]").forEach((b) => (b.onclick = () => { S.store = b.dataset.store; render(host); }));
    host.querySelectorAll("[data-shop-done]").forEach((b) => (b.onclick = () => { const x = byId(b.dataset.shopDone); if (x) setDone(x, !x.done); }));
    host.querySelectorAll("[data-shop-edit]").forEach((b) => (b.onclick = () => openEdit(byId(b.dataset.shopEdit))));
    host.querySelectorAll("[data-sug]").forEach((b) => (b.onclick = async () => { const x = sug.due[Number(b.dataset.sug)]; const r = await add([{ name: x.name, qty: x.qty, store: x.store }]); if (r.msg) toast(r.msg); }));
    host.querySelectorAll("[data-basic]").forEach((b) => (b.onclick = async () => { const r = await add([{ name: b.dataset.basic }]); if (r.msg) toast(r.msg); }));
    host.querySelector("#shop-finish")?.addEventListener("click", openFinish);
  }

  function openEdit(x) {
    if (!x) return;
    const opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${esc(t(l))}</option>`).join("");
    form.innerHTML = `<h3>${t("Artikel")}</h3>
      <label>${t("Name")}</label><input name="name" value="${esc(x.name)}" required>
      <label>${t("Menge")}</label><input name="qty" value="${esc(x.qty ?? "")}" placeholder="${t("z. B. 2 l, 500 g, 6")}">
      <label>${t("Laden")}</label><select name="store">${opts(STORES, x.store)}</select>
      <label>${t("Gang")}</label><select name="category">${opts(CATS, x.category)}</select>
      <label>${t("Notiz")}</label><input name="note" value="${esc(x.note ?? "")}" placeholder="${t("z. B. laktosefrei, Marke")}">
      <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>
      <button type="button" class="ghost danger" id="shop-del">${t("Von der Liste streichen")}</button>`;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const name = f.get("name").trim();
      const patch = { name, qty: f.get("qty").trim() || null, store: f.get("store"), category: f.get("category"), note: f.get("note").trim() || null, flag: halalFlag(name) };
      const { error } = await db.from("shopping_items").update(patch).eq("id", x.id);
      if (error) return toast(error.message);
      Object.assign(x, patch);
      closeSheet(sheet); rerender();
    };
    $("#shop-del").onclick = async () => {
      const copy = { ...x };
      await remove(x); closeSheet(sheet);
      toast(t("Gestrichen: {x}", { x: x.name }), async () => { const { id, ...row } = copy; const { data } = await db.from("shopping_items").insert(row).select().single(); if (data) S.items.unshift(data); rerender(); });
    };
    openSheet(sheet);
  }

  function openFinish() {
    const done = openItems().filter((x) => x.done);
    const counts = {};
    for (const x of done) counts[x.store] = (counts[x.store] ?? 0) + 1;
    let store = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "supermarkt";
    const draw = () => {
      form.innerHTML = `<h3>${t("Einkauf abschließen")}</h3>
        <p class="small muted">${t("{n} Artikel im Wagen. Offene Artikel bleiben auf der Liste.", { n: done.length })}</p>
        <label>${t("Laden")}</label><div class="chips ci">${Object.entries(STORES).map(([k, l]) => `<button type="button" class="chip ${k === store ? "on" : ""}" data-fs="${k}">${t(l)}</button>`).join("")}</div>
        <label>${t("Betrag (optional)")}</label><input name="amount" inputmode="decimal" placeholder="${t("z. B. 48,90")}">
        <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>`;
      form.querySelectorAll("[data-fs]").forEach((b) => (b.onclick = () => { const a = form.amount.value; store = b.dataset.fs; draw(); form.amount.value = a; }));
    };
    draw();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const v = form.amount.value.trim();
      const amount = v ? Number(v.replace(",", ".")) : null;
      closeSheet(sheet);
      toast(await finish(Number.isFinite(amount) ? amount : null, store));
    };
    openSheet(sheet);
  }

  return {
    load, render, runVoice, add,
    openCount: () => (S.loaded ? openItems().filter((x) => !x.done) : null),
    names: () => openItems().map((x) => x.name),
  };
}
