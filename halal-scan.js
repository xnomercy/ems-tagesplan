// Barcode-Scanner: Packung scannen, Zutaten aus Open Food Facts holen und nach festen Regeln prüfen (ohne KI).
// Regeln nach den Ernährungsregeln des Nutzers: kein Schwein, keine Gelatine, kein Alkohol, kein Fisch.

const B = "(?<![\\p{L}])";
const r = (s) => new RegExp(s, "iu");

// Zusatzstoffe: sicher nicht halal bzw. Herkunft prüfen
export const E_HARAM = {
  e120: "E120 Karmin (aus Läusen)",
  e441: "E441 Gelatine",
  e542: "E542 Knochenphosphat",
  e904: "E904 Schellack (aus Läusen)",
};
export const E_CHECK = {
  e422: "E422 Glycerin (tierisch oder pflanzlich)",
  e430: "E430 Polyoxyethylenstearat", e431: "E431 Polyoxyethylenstearat", e432: "E432 Polysorbat", e433: "E433 Polysorbat", e434: "E434 Polysorbat", e435: "E435 Polysorbat", e436: "E436 Polysorbat",
  e470a: "E470a Fettsäuresalze", e470b: "E470b Fettsäuresalze",
  e471: "E471 Mono- und Diglyceride (oft tierisch)",
  e472a: "E472a Fettsäureester", e472b: "E472b Fettsäureester", e472c: "E472c Fettsäureester", e472d: "E472d Fettsäureester", e472e: "E472e Fettsäureester", e472f: "E472f Fettsäureester",
  e473: "E473 Zuckerester", e474: "E474 Zuckerglyceride", e475: "E475 Polyglycerinester", e477: "E477 Propylenglycolester",
  e481: "E481 Natriumstearoyllactylat", e482: "E482 Calciumstearoyllactylat",
  e491: "E491 Sorbitanmonostearat", e492: "E492 Sorbitantristearat", e493: "E493 Sorbitanmonolaurat", e494: "E494 Sorbitanmonooleat", e495: "E495 Sorbitanmonopalmitat",
  e570: "E570 Stearinsäure",
  e627: "E627 Guanylat (evtl. aus Fisch/Fleisch)", e631: "E631 Inosinat (evtl. aus Fisch/Fleisch)", e635: "E635 Ribonukleotide",
  e920: "E920 L-Cystein (oft aus Haaren/Federn)", e921: "E921 L-Cystin",
  e1105: "E1105 Lysozym (aus Ei, unbedenklich)",
};
delete E_CHECK.e1105;

const TXT_HARAM = [
  [r(`${B}(?:schweine?\\p{L}*|pork|domuz\\p{L}*|speck|schinken|bacon|lard|salami)`), "Schwein"],
  [r(`gelatine?|jelatin`), "Gelatine"],
  [r(`${B}(?:alkohol(?!frei)|ethanol|alcohol(?![- ]?free)|alkol(?!süz)|spirituose\\p{L}*|weinbrand|rum(?![\\p{L}-]| aroma)|likör|liqueur|brandy|cognac|whisk(?:e)?y|sherry|portwein|wodka|vodka|bier(?!hefe)\\p{L}*|beer|şarap|rakı)`), "Alkohol"],
  [r(`${B}wein(?!stein|säure|essig|trauben|beer|blatt)`), "Alkohol (Wein)"],
  [r(`fisch(?!\\p{L}*frei)|fish|${B}balık|sardelle|anchovi|thunfisch|lachs|salmon|krill|garnele|shrimp|${B}krebs|hummer|muschel|tintenfisch|kalamar`), "Fisch / Meerestiere"],
  [r(`karmin|carmine|cochenille|cochineal|schellack|shellac`), "Farbstoff/Überzug aus Insekten"],
];
const TXT_CHECK = [
  [r(`${B}(?:lab|rennet|şirden|peynir mayası)(?!\\p{L})|kälberlab|tierisches lab`), "Lab im Käse (tierisch oder mikrobiell)"],
  [r(`tierische?s? fett|animal fat|hayvansal yağ|talg|rindertalg`), "Tierisches Fett"],
  [r(`mono-? und diglyceride|mono- and diglycerides`), "Mono- und Diglyceride (oft tierisch)"],
  [r(`l-cystein|cysteine`), "L-Cystein (oft aus Haaren/Federn)"],
  [r(`${B}(?:rind\\p{L}*|beef|sığır|dana|huhn|hähnchen|hühner\\p{L}*|chicken|tavuk|pute|truthahn|turkey|hindi|lamm|lamb|kuzu|kalb\\p{L}*|veal|fleisch\\p{L}*|meat|et(?!\\p{L}))`), "Fleisch: nur mit Halal-Siegel"],
  [r(`${B}aroma(?!\\p{L})|flavou?ring|${B}aroma\\p{L}*`), "Aroma (Trägerstoff kann Alkohol sein)"],
];

// Ergebnis: verdict haram | pruefen | ok | halal | unbekannt, dazu die Gründe
export function analyseProduct(p = {}) {
  const ingredients = (p.ingredients_text_de || p.ingredients_text || p.ingredients_text_en || p.ingredients_text_tr || "").trim();
  const labels = (p.labels_tags ?? []).map(String);
  const analysis = (p.ingredients_analysis_tags ?? []).map(String);
  const vegan = analysis.includes("en:vegan") || labels.some((l) => /vegan/.test(l));
  const vegetarian = vegan || analysis.includes("en:vegetarian") || labels.some((l) => /vegetari/.test(l));
  const halalLabel = labels.some((l) => /halal/.test(l));
  const haram = new Map(), check = new Map();
  for (const tag of p.additives_tags ?? []) {
    const k = String(tag).replace(/^en:/, "").toLowerCase();
    if (E_HARAM[k]) haram.set(E_HARAM[k], 1);
    else if (E_CHECK[k] && !vegan && !halalLabel) check.set(E_CHECK[k], 1);
  }
  // E-Nummern auch direkt im Text, falls die Datenbank sie nicht erkannt hat
  for (const m of ingredients.matchAll(/\bE\s?-?(\d{3,4}[a-f]?)\b/giu)) {
    const k = "e" + m[1].toLowerCase();
    if (E_HARAM[k]) haram.set(E_HARAM[k], 1);
    else if (E_CHECK[k] && !vegan && !halalLabel) check.set(E_CHECK[k], 1);
  }
  const text = ingredients.toLowerCase();
  for (const [re, why] of TXT_HARAM) {
    if (why === "Gelatine" && vegan) continue;
    if (re.test(text)) haram.set(why, 1);
  }
  for (const a of p.allergens_tags ?? []) {
    if (/en:(fish|crustaceans|molluscs)/.test(a)) haram.set("Fisch / Meerestiere", 1);
  }
  if (!halalLabel) for (const [re, why] of TXT_CHECK) {
    if (vegetarian && /Fleisch|Fett|Diglyceride|Cystein/.test(why)) continue;
    if (re.test(text)) check.set(why, 1);
  }
  const reasons = [...[...haram.keys()].map((text) => ({ level: "haram", text })), ...[...check.keys()].map((text) => ({ level: "check", text }))];
  let verdict = "unbekannt";
  if (haram.size) verdict = "haram";
  else if (halalLabel) verdict = "halal";
  else if (check.size) verdict = "pruefen";
  else if (ingredients || (p.additives_tags ?? []).length) verdict = "ok";
  return { verdict, reasons, ingredients, vegan, halalLabel };
}

const FIELDS = "product_name,product_name_de,product_name_tr,brands,ingredients_text,ingredients_text_de,ingredients_text_en,ingredients_text_tr,additives_tags,labels_tags,allergens_tags,ingredients_analysis_tags,image_front_small_url,quantity";
const SKEY = "tagesplan-scans";
const DEMO_PRODUCTS = {
  "4000000000001": { product_name: "Fruchtgummi Bären", brands: "Demo", ingredients_text_de: "Glukosesirup, Zucker, Gelatine, Säuerungsmittel: Citronensäure, Fruchtsaftkonzentrat, Aroma, Überzugsmittel: Bienenwachs, Carnaubawachs", additives_tags: ["en:e330", "en:e901", "en:e903"] },
  "4000000000002": { product_name: "Haferdrink", brands: "Demo", ingredients_text_de: "Wasser, Hafer 10 %, Rapsöl, Salz", ingredients_analysis_tags: ["en:vegan"], labels_tags: ["en:vegan"] },
  "4000000000003": { product_name: "Rinder-Salami", brands: "Demo", ingredients_text_de: "Rindfleisch, Salz, Gewürze, Dextrose, Antioxidationsmittel: Natriumascorbat", labels_tags: ["en:halal"] },
  "4000000000004": { product_name: "Schokoriegel", brands: "Demo", ingredients_text_de: "Zucker, Kakaobutter, Vollmilchpulver, Emulgator: E471, Aroma, Überzug: Schellack", additives_tags: ["en:e471", "en:e904"] },
};

export async function lookup(ean, demo = false) {
  const cached = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) ?? []; } catch { return []; } })();
  if (demo) return DEMO_PRODUCTS[ean] ? { ...DEMO_PRODUCTS[ean], code: ean } : null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=${FIELDS}`);
    const j = await res.json();
    if (j.status !== 1 || !j.product) return null;
    return { ...j.product, code: ean };
  } catch {
    // Ohne Netz: zuletzt gescannte Packungen kennt die App noch
    const hit = cached.find((x) => x.code === ean);
    if (hit) return hit.product;
    throw new Error("offline");
  }
}
export function remember(product, res) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(SKEY)) ?? []; } catch {}
  list = [{ code: product.code, name: productName(product), verdict: res.verdict, at: Date.now(), product }, ...list.filter((x) => x.code !== product.code)].slice(0, 30);
  try { localStorage.setItem(SKEY, JSON.stringify(list)); } catch {}
}
export const recentScans = () => { try { return JSON.parse(localStorage.getItem(SKEY)) ?? []; } catch { return []; } };
// Nur der Produktname, ohne Marke und Füllmenge
export const shortName = (p) => (p.product_name_de || p.product_name || p.product_name_tr || p.code || "").replace(/\s+\d+([.,]\d+)?\s?(g|kg|ml|l|cl|stk\.?|st\.?)\b\.?$/iu, "").trim();
export const productName = (p) => [p.product_name_de || p.product_name || p.product_name_tr || "", p.brands?.split(",")[0]].filter(Boolean).join(" · ") || p.code;

export const VERDICT = {
  haram: ["Nicht halal", "vk-haram"],
  pruefen: ["Bitte prüfen", "vk-warn"],
  ok: ["Keine kritischen Zutaten gefunden", "vk-ok"],
  halal: ["Mit Halal-Siegel", "vk-ok"],
  unbekannt: ["Keine Zutaten hinterlegt", "vk-warn"],
};

// Kamera-Scanner im Blatt. BarcodeDetector, wo vorhanden, sonst ZXing (iPhone)
export function createScanner(ctx) {
  const { t, esc, form, sheet, openSheet, closeSheet, toast, onAdd, DEMO } = ctx;
  // gen zählt Kamera-Starts; stop() erhöht ihn, damit ein noch laufender Start (langsamer ZXing-Import, Kamera-Freigabe) abbricht
  let gen = 0;
  const idle = () => { gen++; };
  let stop = idle;

  async function startCamera(video, onCode) {
    stop();
    const my = ++gen;
    const live = () => my === gen && video.isConnected;
    let done = false;
    const hit = (code) => { if (done || !live() || !/^\d{8,14}$/.test(code)) return; done = true; navigator.vibrate?.(60); stop(); onCode(code); };
    if ("BarcodeDetector" in window) {
      const formats = await BarcodeDetector.getSupportedFormats?.().catch(() => []) ?? [];
      if (formats.includes("ean_13")) {
        if (!live()) return;
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const end = () => stream.getTracks().forEach((x) => x.stop());
        if (!live()) return end();
        try { video.srcObject = stream; await video.play(); } catch (e) { end(); throw e; }
        if (!live()) return end();
        const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        let timer = setInterval(async () => { try { const r = await det.detect(video); if (r[0]) hit(r[0].rawValue); } catch {} }, 250);
        stop = () => { clearInterval(timer); end(); stop = idle; idle(); };
        return;
      }
    }
    const { BrowserMultiFormatReader } = await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
    if (!live()) return;
    const reader = new BrowserMultiFormatReader();
    const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" }, audio: false }, video, (res) => { if (res) hit(res.getText()); });
    if (!live()) { try { controls.stop(); } catch {} return; }
    stop = () => { try { controls.stop(); } catch {} stop = idle; idle(); };
  }

  function open() {
    const recent = recentScans().slice(0, 5);
    form.innerHTML = `<h3>${t("Packung scannen")}</h3>
      <div class="scan-box"><video id="scan-video" playsinline muted></video><div class="scan-frame"></div><p class="scan-msg" id="scan-msg">${t("Kamera startet …")}</p></div>
      <label>${t("Oder Nummer unter dem Strichcode eingeben")}</label>
      <div class="shop-add"><input id="scan-ean" inputmode="numeric" pattern="[0-9]*" placeholder="z. B. 4000417025005" autocomplete="off"><button type="button" class="primary" id="scan-go" aria-label="${t("Prüfen")}">→</button></div>
      ${recent.length ? `<p class="eyebrow" style="margin-top:14px">${t("Zuletzt gescannt")}</p><div class="scan-recent">${recent.map((x) => `<button type="button" data-scan="${esc(x.code)}"><span>${esc(x.name)}</span><span class="shop-flag ${VERDICT[x.verdict]?.[1] ?? ""}">${t(VERDICT[x.verdict]?.[0] ?? "")}</span></button>`).join("")}</div>` : ""}
      <p class="small muted">${t("Prüfung nach Zutatenliste aus Open Food Facts. Ersetzt kein Halal-Siegel.")}</p>`;
    sheet.addEventListener("close", () => stop(), { once: true });
    form.querySelector("#scan-go").onclick = () => { const v = form.querySelector("#scan-ean").value.replace(/\D/g, ""); if (v) check(v); };
    form.querySelector("#scan-ean").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); form.querySelector("#scan-go").click(); } };
    form.querySelectorAll("[data-scan]").forEach((b) => (b.onclick = () => check(b.dataset.scan)));
    form.onsubmit = (e) => e.preventDefault();
    openSheet(sheet);
    const video = form.querySelector("#scan-video"), msg = form.querySelector("#scan-msg");
    if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = t("Keine Kamera verfügbar. Nummer bitte eintippen."); return; }
    startCamera(video, check).then(() => { msg.textContent = t("Strichcode in den Rahmen halten"); })
      .catch(() => { msg.textContent = t("Kamera nicht freigegeben. Nummer bitte eintippen."); });
  }

  async function check(ean) {
    stop();
    form.innerHTML = `<h3>${t("Prüfe …")}</h3><p class="muted">${esc(ean)}</p>`;
    let p;
    try { p = await lookup(ean, DEMO); } catch { form.innerHTML = `<h3>${t("Kein Netz")}</h3><p>${t("Die Packung ist noch nicht gespeichert. Versuch es mit Netz noch einmal.")}</p><div class="sheet-actions"><button type="button" class="primary" id="scan-again">${t("Nochmal scannen")}</button></div>`; form.querySelector("#scan-again").onclick = open; return; }
    if (!p) return manual(ean);
    show(p);
  }

  // Nicht in der Datenbank: Zutaten selbst eintippen oder einfügen
  function manual(ean) {
    form.innerHTML = `<h3>${t("Nicht gefunden")}</h3>
      <p class="small">${t("Die Packung ist nicht in Open Food Facts. Tipp die Zutaten ab oder füge sie ein, dann prüft die App sie.")}</p>
      <label>${t("Name")}</label><input name="pname" autocomplete="off">
      <label>${t("Zutaten")}</label><textarea name="ing" rows="4"></textarea>
      <div class="sheet-actions"><button class="primary">${t("Zutaten prüfen")}</button></div>
      <button type="button" class="ghost" id="scan-again">${t("Nochmal scannen")}</button>`;
    form.querySelector("#scan-again").onclick = open;
    form.onsubmit = (e) => { e.preventDefault(); show({ code: ean, product_name: form.pname.value.trim() || ean, ingredients_text: form.ing.value }); };
  }

  function show(p) {
    const res = analyseProduct(p);
    remember(p, res);
    const [label, cls] = VERDICT[res.verdict];
    const name = productName(p);
    form.innerHTML = `<div class="scan-head">${p.image_front_small_url ? `<img src="${esc(p.image_front_small_url)}" alt="">` : ""}<div><h3>${esc(name)}</h3>${p.quantity ? `<p class="small muted">${esc(p.quantity)}</p>` : ""}</div></div>
      <div class="scan-verdict ${cls}">${t(label)}</div>
      ${res.reasons.length ? `<ul class="scan-reasons">${res.reasons.map((x) => `<li class="vk-${x.level}">${esc(t(x.text))}</li>`).join("")}</ul>` : ""}
      ${res.ingredients ? `<details class="scan-ing"><summary>${t("Zutaten")}</summary><p class="small">${esc(res.ingredients)}</p></details>` : ""}
      ${res.verdict === "haram" ? "" : `<label>${t("Übernehmen als")}</label><input name="sname" id="scan-name" autocomplete="off" value="${esc(shortName(p))}">
      <div class="sheet-actions row"><button type="button" class="primary" data-scan-to="liste">${t("Einkaufsliste")}</button><button type="button" class="primary" data-scan-to="vorrat">${t("Vorrat")}</button></div>`}
      <button type="button" class="ghost" id="scan-again">${t("Nächste Packung scannen")}</button>`;
    form.querySelector("#scan-again").onclick = open;
    form.querySelectorAll("[data-scan-to]").forEach((b) => (b.onclick = async () => {
      const short = form.querySelector("#scan-name").value.trim() || shortName(p);
      const to = b.dataset.scanTo;
      // Vorrat öffnet das eigene Formular im selben Blatt, Einkaufsliste geht gleich zurück zur Kamera für die nächste Packung
      const r = await onAdd(short, res, to);
      if (r?.msg) toast(r.msg, r.undo);
      if (to === "liste") open();
    }));
  }

  return { open, check, show };
}
