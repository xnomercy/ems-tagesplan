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

const URGENT = /(?<!\p{L})(?:dringend|sofort|eilig|acil|hemen)(?!\p{L})/giu;
export function parseOne(raw) {
  const urgent = URGENT.test(raw);
  URGENT.lastIndex = 0;
  raw = raw.replace(URGENT, " ");
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
  return name ? { name: cap(name), qty, ...(urgent ? { urgent: true } : {}) } : null;
}
// Mehrere Artikel aus einem Satz: Komma, "und", "ve", "sowie", "+"
export function parseItems(text) {
  const all = URGENT.test(text);
  URGENT.lastIndex = 0;
  const items = text.split(/\s*(?:,|;|\+|&|\bund\b|\bsowie\b|\bve\b|\bile\b)\s*/i).map(parseOne).filter(Boolean);
  return all ? items.map((x) => ({ ...x, urgent: true })) : items;
}
export const normName = (s) => low(s).replace(/\(.*?\)/g, "").replace(/[^\p{L}\d ]/gu, " ").replace(/\s+/g, " ").trim();

// Kaufrhythmus: Artikel, die mindestens 2× gekauft wurden und jetzt wieder fällig sind
export function dueSuggestions(items, now = new Date()) {
  const open = new Set(items.filter((x) => !x.purchased_at).map((x) => normName(x.name)));
  const by = {};
  for (const x of items) if (x.purchased_at) (by[normName(x.name)] ??= { x, days: new Set() }).days.add(x.purchased_at.slice(0, 10));
  const out = [];
  for (const [n, { x, days }] of Object.entries(by)) {
    const fixed = Number(x.every_days) || 0;
    if (open.has(n) || (days.size < 2 && !fixed)) continue;
    const d = [...days].sort().map((s) => Date.parse(s + "T12:00"));
    const avg = fixed || (d[d.length - 1] - d[0]) / (d.length - 1) / 864e5;
    const since = (now - d[d.length - 1]) / 864e5;
    if (avg < 2 || avg > 60) continue;
    if (since >= avg * (fixed ? 1 : 0.85)) out.push({ name: x.name, qty: x.qty, category: x.category, store: x.store, price: x.price, every_days: x.every_days, every: Math.round(avg), ratio: since / avg });
  }
  return out.sort((a, b) => b.ratio - a.ratio).slice(0, 6);
}

export const storeLabel = (k, t = (x) => x) => (STORES[k] ? t(STORES[k]) : k);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Text zum Teilen (WhatsApp usw.): nach Laden, dann Gang
export function shareText(items, t = (x) => x) {
  const by = {};
  for (const x of items) (by[x.store] ??= []).push(x);
  const order = Object.keys(CATS);
  return [t("Einkaufsliste"), ...Object.entries(by).map(([st, list]) => `\n${storeLabel(st, t)}:\n` + list.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category))
    .map((x) => `- ${x.urgent ? "❗ " : ""}${x.name}${x.qty ? ` (${x.qty})` : ""}${x.note ? ` – ${x.note}` : ""}`).join("\n"))].join("\n");
}

// Grundliste aus Ernährungsplan und Vorlieben (halal, laktosefrei, wenig Weizen, viel Eiweiß)
const BASICS = ["Skyr", "Hähnchenbrust (halal)", "Rinderhack (halal)", "Eier", "Laktosefreie Milch", "Magerquark", "Reis", "Haferflocken", "Brokkoli", "Paprika", "Bananen", "Beeren (TK)", "Olivenöl"];

export function createShopping(ctx) {
  const { db, t, esc, $, toast, openSheet, closeSheet, sheet, form, LOCALE, lowSupplies, supplyDays, enhancePickers, fmtDay } = ctx;
  const S = { list: null, items: [], trips: [], loaded: false, loading: null, store: "alle", host: null };
  const openItems = () => S.items.filter((x) => !x.purchased_at);
  const remembered = (name) => S.items.find((x) => normName(x.name) === normName(name) && x.purchased_at);
  const eur = (n) => Number(n).toLocaleString(LOCALE(), { style: "currency", currency: "EUR" });
  const num = (v) => { const n = Number(String(v ?? "").replace(",", ".").replace(/[^\d.]/g, "")); return String(v ?? "").trim() && Number.isFinite(n) ? n : null; };
  // Eigene Läden: Standard plus alle, die schon benutzt wurden
  const allStores = () => [...new Set([...Object.keys(STORES), ...S.items.map((x) => x.store).filter(Boolean)])];
  const lbl = (k) => storeLabel(k, t);
  // Bekannte Namen für Vorschläge beim Tippen: eigene Historie zuerst, dann Grundliste
  const namePool = () => {
    const seen = new Map();
    for (const x of S.items) if (!seen.has(normName(x.name))) seen.set(normName(x.name), x.name);
    for (const n of BASICS) { const v = t(n); if (!seen.has(normName(v))) seen.set(normName(v), v); }
    return [...seen.values()];
  };
  const matchNames = (q, skip = []) => {
    const n = normName(q);
    if (n.length < 2) return [];
    const skipN = new Set(skip.map(normName));
    const pool = namePool().filter((x) => !skipN.has(normName(x)) && normName(x) !== n);
    return [...pool.filter((x) => normName(x).startsWith(n)), ...pool.filter((x) => !normName(x).startsWith(n) && normName(x).includes(n))].slice(0, 6);
  };

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
        const patch = {};
        if (p.qty && p.qty !== same.qty) patch.qty = p.qty;
        if (p.urgent && !same.urgent) patch.urgent = true;
        if (p.need_by && p.need_by !== same.need_by) patch.need_by = p.need_by;
        if (Object.keys(patch).length) { patch.done = false; await db.from("shopping_items").update(patch).eq("id", same.id); Object.assign(same, patch); }
        merged.push(same.name); continue;
      }
      const prev = remembered(p.name);
      const category = p.category ?? prev?.category ?? classify(p.name);
      const row = { list_id: S.list.id, name: p.name, qty: p.qty ?? prev?.qty ?? null, category, store: p.store ?? prev?.store ?? storeFor(category), flag: halalFlag(p.name), note: p.note ?? null,
        price: p.price ?? prev?.price ?? null, urgent: !!p.urgent, need_by: p.need_by ?? null, every_days: p.every_days ?? prev?.every_days ?? null };
      const { data, error } = await db.from("shopping_items").insert(row).select().single();
      if (error) { toast(error.message); continue; }
      S.items.unshift(data); added.push(data);
    }
    rerender();
    const warn = added.find((x) => x.flag?.startsWith("haram:"));
    let msg = added.length ? t("Auf der Liste: {x}", { x: added.map((x) => (x.urgent ? "❗" : "") + x.name + (x.qty ? ` (${x.qty})` : "")).join(", ") }) : "";
    if (added.length && added[0].need_by) msg += " · " + t("bis {d}", { d: fmtDay(added[0].need_by, { weekday: "short" }) });
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
    if (c.action === "budget") { await setBudget(c.amount); return { msg: t("Monatsbudget Einkauf: {x}", { x: eur(c.amount) }) }; }
    if (c.action === "share") { await share(); return null; }
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
  async function setBudget(v) {
    await db.from("shopping_lists").update({ budget_month: v }).eq("id", S.list.id);
    S.list.budget_month = v;
    rerender();
  }
  async function share() {
    const text = shareText(openItems().filter((x) => !x.done), t);
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast(t("Liste kopiert")); }
    } catch (e) { if (e?.name !== "AbortError") { try { await navigator.clipboard.writeText(text); toast(t("Liste kopiert")); } catch {} } }
  }
  function monthStats() {
    const m = new Date().toISOString().slice(0, 7);
    const trips = S.trips.filter((x) => x.finished_at.slice(0, 7) === m);
    return { n: trips.length, sum: trips.reduce((a, x) => a + (Number(x.amount) || 0), 0), withAmount: trips.some((x) => x.amount != null), budget: Number(S.list?.budget_month) || null };
  }

  // ---------- Ansicht ----------
  function rerender() { if (S.host?.isConnected) render(S.host); ctx.onChange?.(); }
  function render(host) {
    S.host = host;
    if (!S.loaded) { host.innerHTML = `<div class="empty">${t("Lade …")}</div>`; load().then(() => render(host)); return; }
    const all = openItems();
    const stores = allStores().filter((k) => all.some((x) => x.store === k && !x.done));
    if (S.store !== "alle" && !stores.includes(S.store)) S.store = "alle";
    const shown = all.filter((x) => S.store === "alle" || x.store === S.store);
    const todo = shown.filter((x) => !x.done), cart = shown.filter((x) => x.done);
    const today = isoDay(new Date()), soon = isoDay(new Date(Date.now() + 864e5));
    const urgentList = todo.filter((x) => x.urgent || (x.need_by && x.need_by <= soon));
    const est = todo.reduce((a, x) => a + (Number(x.price) || 0), 0), priced = todo.filter((x) => x.price != null).length;
    const sug = suggestions();
    const flagHtml = (x) => {
      if (!x.flag) return "";
      const [k, why] = [x.flag.split(":")[0], x.flag.slice(x.flag.indexOf(":") + 1)];
      return `<span class="shop-flag ${k}">${k === "haram" ? t("nicht halal: {x}", { x: t(why) }) : t(why)}</span>`;
    };
    const row = (x) => `<div class="shop-row ${x.done ? "done" : ""}">
        <button type="button" class="check ${x.done ? "on" : ""}" data-shop-done="${x.id}" aria-label="${t(x.done ? "Wieder offen" : "Abhaken")}">${x.done ? CHECK_SVG : ""}</button>
        <button type="button" class="body" data-shop-edit="${x.id}"><span class="title">${esc(x.name)}${x.qty ? ` <em>${esc(x.qty)}</em>` : ""}</span>
        ${(S.store === "alle" && x.store !== "supermarkt") || x.note || x.flag || x.urgent || x.need_by ? `<span class="sub">${x.urgent ? `<span class="shop-flag haram">${t("dringend")}</span> ` : ""}${x.need_by && !x.done ? `<span class="shop-flag ${x.need_by <= today ? "haram" : ""}">${t("bis {d}", { d: x.need_by === today ? t("heute") : fmtDay(x.need_by, { weekday: "short" }) })}</span> ` : ""}${S.store === "alle" && x.store !== "supermarkt" ? `<b>${esc(lbl(x.store))}</b>` : ""}${x.note ? " " + esc(x.note) : ""} ${flagHtml(x)}</span>` : ""}</button>
        ${x.price != null ? `<span class="shop-price">${eur(x.price)}</span>` : ""}
      </div>`;
    let html = `<form class="shop-add" id="shop-add" autocomplete="off"><input id="shop-in" placeholder="${t("Was fehlt?")}" enterkeyhint="done">
      <button type="button" class="round-btn shop-more" id="shop-more" aria-label="${t("Mit Details anlegen")}"><svg viewBox="0 0 24 24"><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z"/></svg></button>
      <button class="primary" aria-label="${t("Hinzufügen")}">+</button></form>
      <div class="chips shop-ac" id="shop-ac" hidden></div>
      ${ctx.onScan ? `<button type="button" class="btn shop-scan" id="shop-scan"><svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>${t("Packung scannen")}</button>` : ""}`;
    if (stores.length > 1) html += `<div class="chips shop-stores"><button type="button" class="chip ${S.store === "alle" ? "on" : ""}" data-store="alle">${t("Alle")} ${all.filter((x) => !x.done).length}</button>${stores.map((k) => `<button type="button" class="chip ${S.store === k ? "on" : ""}" data-store="${esc(k)}">${esc(lbl(k))} ${all.filter((x) => x.store === k && !x.done).length}</button>`).join("")}</div>`;
    if (todo.length) html += `<div class="shop-tools"><span class="small muted">${priced ? t("ca. {x}", { x: eur(est) }) + (priced < todo.length ? " · " + t("{n} ohne Preis", { n: todo.length - priced }) : "") : t("{n} Artikel offen", { n: todo.length })}</span>
      <button type="button" class="link-btn" id="shop-plan">${t("Einkauf planen")}</button><button type="button" class="link-btn" id="shop-share">${t("Teilen")}</button></div>`;
    if (sug.due.length) html += `<p class="eyebrow" style="margin-top:16px">${t("Bald wieder fällig")}</p><div class="chips shop-sug">${sug.due.map((x, i) => `<button type="button" class="chip" data-sug="${i}">+ ${esc(t(x.name))} <small>${esc(x.why)}</small></button>`).join("")}</div>`;
    if (!todo.length && !cart.length) html += `<div class="empty">${t("Die Einkaufsliste ist leer.")}</div>`;
    if (urgentList.length) html += `<p class="eyebrow shop-cat urgent">${t("Dringend")}</p><div class="card shop-card">${urgentList.map(row).join("")}</div>`;
    for (const [k, label] of Object.entries(CATS)) {
      const list = todo.filter((x) => (x.category ?? "sonstiges") === k && !urgentList.includes(x));
      if (!list.length) continue;
      html += `<p class="eyebrow shop-cat">${t(label)}</p><div class="card shop-card">${list.map(row).join("")}</div>`;
    }
    if (cart.length) {
      html += `<p class="eyebrow shop-cat">${t("Im Wagen")} · ${cart.length}</p><div class="card shop-card">${cart.map(row).join("")}</div>
        <button class="primary" id="shop-finish">${t("Einkauf abschließen")}</button>`;
    }
    if (sug.basics.length) html += `<p class="eyebrow" style="margin-top:18px">${t("Meal-Prep-Grundliste")}</p><div class="chips shop-sug wrap">${sug.basics.map((n) => `<button type="button" class="chip" data-basic="${esc(t(n))}">+ ${esc(t(n))}</button>`).join("")}</div>`;
    const ms = monthStats();
    const pct = ms.budget ? Math.min(100, Math.round((ms.sum / ms.budget) * 100)) : 0;
    html += `<div class="card shop-month"><div class="shop-month-top"><b>${t("Diesen Monat")}</b><button type="button" class="link-btn" id="shop-budget">${ms.budget ? t("Budget {x}", { x: eur(ms.budget) }) : t("Budget festlegen")}</button></div>
      <p class="small muted">${t("{n} Einkäufe", { n: ms.n })}${ms.withAmount || ms.budget ? " · " + eur(ms.sum) : ""}${ms.budget ? " · " + t("noch {x}", { x: eur(Math.max(0, ms.budget - ms.sum)) }) : ""}</p>
      ${ms.budget ? `<div class="bar shop-bar ${pct >= 100 ? "over" : pct >= 85 ? "warn" : ""}"><div style="width:${pct}%"></div></div>` : ""}
      ${S.trips.length ? `<div class="shop-trips">${S.trips.slice(0, 5).map((x) => `<div><span>${fmtDay(x.finished_at.slice(0, 10), { weekday: "short", day: "numeric", month: "short" })} · ${esc(lbl(x.store ?? ""))}</span><span>${x.items} ${t("Artikel")}${x.amount != null ? " · " + eur(x.amount) : ""}</span></div>`).join("")}</div>` : ""}</div>`;
    host.innerHTML = html;

    const byId = (id) => S.items.find((x) => x.id === id);
    // Vorschläge beim Tippen: ergänzt das letzte Wort nach Komma oder "und"
    const inp = host.querySelector("#shop-in"), ac = host.querySelector("#shop-ac");
    const lastPart = (v) => v.split(/\s*(?:,|;|\+|\bund\b|\bve\b)\s*/i).pop();
    inp.oninput = () => {
      const part = lastPart(inp.value).replace(/^\d+([.,]\d+)?\s*\p{L}{0,6}\s+/u, "");
      const list = matchNames(part, openItems().map((x) => x.name));
      ac.hidden = !list.length;
      ac.innerHTML = list.map((n) => `<button type="button" class="chip" data-ac="${esc(n)}">${esc(n)}</button>`).join("");
      ac.querySelectorAll("[data-ac]").forEach((b) => (b.onclick = () => {
        const v = inp.value, lp = lastPart(v), qty = lp.match(/^\d+([.,]\d+)?\s*\p{L}{0,6}\s+/u)?.[0] ?? "";
        inp.value = v.slice(0, v.length - lp.length) + qty + b.dataset.ac;
        ac.hidden = true; inp.focus();
      }));
    };
    host.querySelector("#shop-more").onclick = () => {
      const p = parseOne(lastPart(inp.value) || "") ?? {};
      openEdit({ name: p.name ?? "", qty: p.qty ?? null, urgent: !!p.urgent });
    };
    host.querySelector("#shop-add").onsubmit = async (e) => {
      e.preventDefault();
      const v = $("#shop-in").value.trim();
      if (!v) return;
      const r = await add(parseItems(v));
      if (r.msg) toast(r.msg, r.undo ? async () => { await r.undo(); rerender(); } : null);
      $("#shop-in")?.blur();
    };
    host.querySelectorAll("[data-store]").forEach((b) => (b.onclick = () => { S.store = b.dataset.store; render(host); }));
    host.querySelectorAll("[data-shop-done]").forEach((b) => (b.onclick = () => { const x = byId(b.dataset.shopDone); if (x) setDone(x, !x.done); }));
    host.querySelectorAll("[data-shop-edit]").forEach((b) => (b.onclick = () => openEdit(byId(b.dataset.shopEdit))));
    host.querySelectorAll("[data-sug]").forEach((b) => (b.onclick = async () => { const x = sug.due[Number(b.dataset.sug)]; const r = await add([{ name: x.name, qty: x.qty, store: x.store, price: x.price, every_days: x.every_days }]); if (r.msg) toast(r.msg); }));
    host.querySelectorAll("[data-basic]").forEach((b) => (b.onclick = async () => { const r = await add([{ name: b.dataset.basic }]); if (r.msg) toast(r.msg); }));
    host.querySelector("#shop-scan")?.addEventListener("click", () => ctx.onScan());
    host.querySelector("#shop-finish")?.addEventListener("click", openFinish);
    host.querySelector("#shop-share")?.addEventListener("click", share);
    host.querySelector("#shop-plan")?.addEventListener("click", openPlan);
    host.querySelector("#shop-budget")?.addEventListener("click", openBudget);
  }

  // Laden-Auswahl als Chips, plus eigener Laden
  const storeChips = (cur, attr) => `<div class="chips ci">${[...new Set([...allStores(), cur].filter(Boolean))].map((k) => `<button type="button" class="chip ${k === cur ? "on" : ""}" ${attr}="${esc(k)}">${esc(lbl(k))}</button>`).join("")}
    <button type="button" class="chip" ${attr}-new>+ ${t("Laden")}</button></div>`;
  const bindStoreChips = (attr, get, set, redraw) => {
    form.querySelectorAll(`[${attr}]`).forEach((b) => (b.onclick = () => { set(b.getAttribute(attr)); redraw(); }));
    form.querySelector(`[${attr}-new]`)?.addEventListener("click", () => { const n = prompt(t("Name des Ladens, z. B. Lidl")); if (n?.trim()) { set(n.trim()); redraw(); } });
  };

  function openEdit(x) {
    if (!x) return;
    const isNew = !x.id;
    // Neu: Laden und Gang aus der Historie oder per Stichwort, solange nicht von Hand gewählt
    const guess = (name) => { const prev = remembered(name); const cat = prev?.category ?? classify(name); return { prev, category: cat, store: prev?.store ?? storeFor(cat) }; };
    const g0 = isNew && x.name ? guess(x.name) : null;
    if (isNew) Object.assign(x, { category: g0?.category ?? "sonstiges", store: g0?.store ?? "supermarkt", qty: x.qty ?? g0?.prev?.qty ?? null, price: g0?.prev?.price ?? null, every_days: g0?.prev?.every_days ?? null });
    const v = { store: x.store, urgent: !!x.urgent, touched: !isNew };
    const opts = (o, cur) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${esc(t(l))}</option>`).join("");
    const keep = () => Object.fromEntries([...new FormData(form)].map(([k, val]) => [k, val]));
    const draw = (f = {}) => {
      const val = (k, d) => esc(f[k] ?? d ?? "");
      form.innerHTML = `<h3>${t(isNew ? "Neuer Artikel" : "Artikel")}</h3>
        <label>${t("Name")}</label><input name="name" value="${val("name", x.name)}" required autocomplete="off" enterkeyhint="done">
        <div class="chips shop-ac" id="es-ac" hidden></div><p class="small" id="es-flag"></p>
        <div class="row2"><div><label>${t("Menge")}</label><input name="qty" value="${val("qty", x.qty)}" placeholder="${t("z. B. 2 l, 500 g, 6")}"></div>
        <div><label>${t("Preis (€)")}</label><input name="price" inputmode="decimal" value="${val("price", x.price != null ? String(x.price).replace(".", ",") : "")}" placeholder="${t("z. B. 1,29")}"></div></div>
        <label>${t("Laden")}</label>${storeChips(v.store, "data-es")}
        <label>${t("Gang")}</label><select name="category">${opts(CATS, f.category ?? x.category)}</select>
        <div class="chips ci"><button type="button" class="chip ${v.urgent ? "on" : ""}" id="es-urgent">❗ ${t("Dringend")}</button></div>
        <label>${t("Gebraucht bis (optional)")}</label><input type="date" name="need_by" value="${val("need_by", x.need_by)}">
        <label>${t("Regelmäßig kaufen")}</label><select name="every_days">${[["", "Automatisch (aus deinem Rhythmus)"], ["3", "alle 3 Tage"], ["5", "alle 5 Tage"], ["7", "jede Woche"], ["10", "alle 10 Tage"], ["14", "alle 2 Wochen"], ["30", "jeden Monat"]].map(([k, l]) => `<option value="${k}" ${String(f.every_days ?? x.every_days ?? "") === k ? "selected" : ""}>${t(l)}</option>`).join("")}</select>
        <label>${t("Notiz")}</label><input name="note" value="${val("note", x.note)}" placeholder="${t("z. B. laktosefrei, Marke")}">
        <div class="sheet-actions"><button class="primary" value="save">${t(isNew ? "Hinzufügen" : "Speichern")}</button></div>
        ${isNew ? "" : `<button type="button" class="ghost danger" id="shop-del">${t("Von der Liste streichen")}</button>`}`;
      enhancePickers?.(form);
      bindStoreChips("data-es", () => v.store, (k) => { v.store = k; v.touched = true; }, () => draw(keep()));
      form.category.onchange = () => (v.touched = true);
      // Name: Vorschläge, Halal-Hinweis, Laden/Gang mitdenken
      const nameIn = form.name, acEl = form.querySelector("#es-ac"), flagEl = form.querySelector("#es-flag");
      const paintFlag = () => {
        const fl = halalFlag(nameIn.value);
        flagEl.innerHTML = fl ? `<span class="shop-flag ${fl.split(":")[0]}">${fl.startsWith("haram:") ? t("nicht halal: {x}", { x: t(fl.slice(6)) }) : t(fl.slice(6))}</span>` : "";
      };
      const applyGuess = () => {
        if (!isNew || v.touched || !nameIn.value.trim()) return;
        const gg = guess(nameIn.value.trim());
        form.category.value = gg.category;
        if (gg.prev?.price != null && !form.price.value) form.price.value = String(gg.prev.price).replace(".", ",");
        if (gg.prev?.qty && !form.qty.value) form.qty.value = gg.prev.qty;
        if (gg.store !== v.store) {
          v.store = gg.store;
          // Chips direkt umschalten, kein Neuzeichnen: sonst springt der Fokus und die Tastatur geht auf
          const chips = [...form.querySelectorAll("[data-es]")];
          if (chips.some((b) => b.getAttribute("data-es") === gg.store)) chips.forEach((b) => b.classList.toggle("on", b.getAttribute("data-es") === gg.store));
          else draw(keep());
        }
      };
      nameIn.oninput = () => {
        paintFlag();
        const list = matchNames(nameIn.value, isNew ? openItems().map((y) => y.name) : []);
        acEl.hidden = !list.length;
        acEl.innerHTML = list.map((n) => `<button type="button" class="chip" data-eac="${esc(n)}">${esc(n)}</button>`).join("");
        acEl.querySelectorAll("[data-eac]").forEach((b) => (b.onclick = () => { nameIn.value = b.dataset.eac; acEl.hidden = true; paintFlag(); applyGuess(); }));
      };
      nameIn.onchange = applyGuess;
      paintFlag();
      $("#es-urgent").onclick = (e) => { v.urgent = !v.urgent; e.currentTarget.classList.toggle("on", v.urgent); };
      if (!isNew) $("#shop-del").onclick = async () => {
        const copy = { ...x };
        await remove(x); closeSheet(sheet);
        toast(t("Gestrichen: {x}", { x: x.name }), async () => { const { id, ...row } = copy; const { data } = await db.from("shopping_items").insert(row).select().single(); if (data) S.items.unshift(data); rerender(); });
      };
    };
    draw();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const name = f.get("name").trim();
      const patch = { name, qty: f.get("qty").trim() || null, price: num(f.get("price")), store: v.store, category: f.get("category"), urgent: v.urgent,
        need_by: f.get("need_by") || null, every_days: Number(f.get("every_days")) || null, note: f.get("note").trim() || null, flag: halalFlag(name) };
      if (isNew) {
        if (!name) return;
        closeSheet(sheet);
        const { flag, ...p } = patch;
        const res = await add([{ ...p, name: name.charAt(0).toLocaleUpperCase("de-DE") + name.slice(1) }]);
        const inQuick = S.host?.querySelector("#shop-in");
        if (inQuick) inQuick.value = "";
        if (res.msg) toast(res.msg, res.undo ? async () => { await res.undo(); rerender(); } : null);
        return;
      }
      const { error } = await db.from("shopping_items").update(patch).eq("id", x.id);
      if (error) return toast(error.message);
      Object.assign(x, patch);
      closeSheet(sheet); rerender();
    };
    openSheet(sheet);
  }

  // Monatsbudget
  function openBudget() {
    form.innerHTML = `<h3>${t("Budget für Einkäufe")}</h3><p class="small muted">${t("Pro Monat. Die App zählt die Beträge deiner abgeschlossenen Einkäufe zusammen.")}</p>
      <label>${t("Betrag (€)")}</label><input name="budget" inputmode="decimal" value="${S.list.budget_month != null ? String(S.list.budget_month).replace(".", ",") : ""}" placeholder="${t("z. B. 400")}">
      <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>`;
    form.onsubmit = async (e) => { e.preventDefault(); await setBudget(num(form.budget.value)); closeSheet(sheet); };
    openSheet(sheet);
  }

  // Einkauf planen: legt einen Termin an, der auf dem Tag erscheint und erinnert
  function openPlan() {
    const open = openItems().filter((x) => !x.done);
    const counts = {};
    for (const x of open) counts[x.store] = (counts[x.store] ?? 0) + 1;
    let store = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "supermarkt";
    const sat = new Date(); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
    const keep = () => ({ d: form.on_date?.value, tm: form.start_time?.value });
    const draw = (f = {}) => {
      form.innerHTML = `<h3>${t("Einkauf planen")}</h3>
        <p class="small muted">${t("Wird als Termin eingetragen. Am Tag siehst du dann, was auf der Liste steht.")}</p>
        <label>${t("Laden")}</label>${storeChips(store, "data-ps")}
        <div class="row2"><div><label>${t("Datum")}</label><input type="date" name="on_date" value="${f.d ?? isoDay(sat)}" required></div>
        <div><label>${t("Uhrzeit")}</label><input type="time" name="start_time" value="${f.tm ?? "11:00"}"></div></div>
        <div class="sheet-actions"><button class="primary" value="save">${t("Termin anlegen")}</button></div>`;
      enhancePickers?.(form);
      bindStoreChips("data-ps", () => store, (k) => (store = k), () => draw(keep()));
    };
    draw();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const n = open.filter((x) => x.store === store).length;
      const row = { kind: "termin", title: `${t("Einkauf")}: ${lbl(store)}`, on_date: form.on_date.value, start_time: form.start_time.value || null, notes: n ? t("{n} Artikel auf der Liste", { n }) : null };
      const { error } = await db.from("items").insert(row);
      if (error) return toast(error.message);
      closeSheet(sheet);
      toast(t("Geplant: {x}, {d}", { x: row.title, d: fmtDay(row.on_date, { weekday: "long" }) + (row.start_time ? " " + row.start_time : "") }));
      ctx.onPlanned?.();
    };
    openSheet(sheet);
  }

  function openFinish() {
    const done = openItems().filter((x) => x.done);
    const counts = {};
    for (const x of done) counts[x.store] = (counts[x.store] ?? 0) + 1;
    let store = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "supermarkt";
    const est = done.reduce((a, x) => a + (Number(x.price) || 0), 0);
    const draw = () => {
      form.innerHTML = `<h3>${t("Einkauf abschließen")}</h3>
        <p class="small muted">${t("{n} Artikel im Wagen. Offene Artikel bleiben auf der Liste.", { n: done.length })}</p>
        <label>${t("Laden")}</label>${storeChips(store, "data-fs")}
        <label>${t("Betrag (optional)")}</label><input name="amount" inputmode="decimal" placeholder="${est ? t("ca. {x}", { x: eur(est) }) : t("z. B. 48,90")}">
        <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>`;
      bindStoreChips("data-fs", () => store, (k) => (store = k), () => { const a = form.amount.value; draw(); form.amount.value = a; });
    };
    draw();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const amount = num(form.amount.value);
      closeSheet(sheet);
      toast(await finish(amount, store));
    };
    openSheet(sheet);
  }

  return {
    load, render, runVoice, add,
    openNew: () => openEdit({ name: "", qty: null, urgent: false }),
    openCount: () => (S.loaded ? openItems().filter((x) => !x.done) : null),
    names: () => openItems().map((x) => x.name),
    // Für den Tag: was heute/morgen gebraucht wird oder dringend ist
    pressing: () => {
      if (!S.loaded) return [];
      const soon = isoDay(new Date(Date.now() + 864e5));
      return openItems().filter((x) => !x.done && (x.urgent || (x.need_by && x.need_by <= soon)));
    },
  };
}
