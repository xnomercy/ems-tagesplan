// Sprachbefehle für alles, was es in der App schon gibt: löschen, verschieben, wichtig machen,
// pausieren, anzeigen, Erinnerung, Checkliste, Sprache, Hilfe. Deutsch und Türkisch, ohne KI.
// parseIntent(text, now, ziele, lang) -> { type, ... } oder null (dann greift der normale Parser)
import { parseDate, parseTime, findMatch } from "./parser.js";
import { parseDateTr, parseTimeTr, findPrayer } from "./parser-tr.js";

const B = "(?<![\\p{L}\\d])";
const E = "(?![\\p{L}\\d])";
const rx = (body) => new RegExp(B + "(?:" + body + ")" + E, "iu");
const W = "\\p{L}*"; // Wortende/Endung beliebig

const RE = {
  hilfe: rx(`was kann ich sagen|was verstehst du|hilfe|befehle|ne söyleyebilirim|neler söyleyebilirim|yardım${W}|komutlar${W}`),
  tuerkisch: rx(`(?:sprich|stell${W}(?:\\s+\\p{L}+)?\\s+auf|wechsel${W}(?:\\s+zu|\\s+auf)?|auf)\\s+türkisch|türkçe${W}\\s+(?:geç|konuş|yap)${W}`),
  deutsch: rx(`(?:sprich|stell${W}(?:\\s+\\p{L}+)?\\s+auf|wechsel${W}(?:\\s+zu|\\s+auf)?|auf)\\s+deutsch|almanca${W}\\s+(?:geç|konuş|yap)${W}`),
  gruppe: rx(`teil${W}|sortier${W}|ordne${W}|grupp${W}|ayır${W}|sırala${W}|grupla${W}`),
  zeige: rx(`zeig${W}|öffne${W}|geh${W}\\s+zu|was steht|was habe ich|was hab ich|was ist|wie sieht|göster${W}|aç|neler var|ne var|nedir`),
  loeschen: rx(`lösch${W}|entfern${W}|streich${W}|absag${W}|sag${W}\\s+.+\\s+ab|sil${W}|kaldır${W}|iptal${W}`),
  offen: rx(`nicht erledigt|doch nicht|nicht gemacht|wieder (?:öffnen|offen|aufmachen)|zurücksetzen|rückgängig|yapmadım|kılmadım|okumadım|almadım|geri al${W}|tekrar aç|açık yap`),
  verschieben: rx(`verschieb${W}|verleg${W}|schieb${W}|umleg${W}|änder${W}|ertele${W}|taşı${W}|kaydır${W}|değiştir${W}`),
  wichtig: rx(`wichtig|dringend|hohe priorität|priorität hoch|nervig|önemli|acil|öncelikli|yüksek öncelik${W}`),
  unwichtig: rx(`unwichtig|nicht (?:mehr )?wichtig|normale? priorität|önemsiz|önemli değil|normal öncelik${W}`),
  pause: rx(`pausier${W}|deaktivier${W}|aussetz${W}|setz${W}\\s+.+\\s+aus|stopp${W}|abschalt${W}|durdur${W}|duraklat${W}|pasif${W}|kapat${W}`),
  aktiv: rx(`aktivier${W}|reaktivier${W}|wieder an${W}|einschalt${W}|fortsetz${W}|aktif${W}|devam ettir${W}|başlat${W}`),
  erinnerung: rx(`erinner${W}|hatırlat${W}`),
  vorher: rx(`vorher|davor|früher|önce${W}`),
  neu: rx(`leg${W}\\s+an|anlegen|neue?[rs]?|trag${W}\\s+ein|ekle|oluştur${W}|yeni|kaydet`),
};

const VIEW_WORDS = [
  ["monat", rx(`monat${W}|monatsansicht|kalenderansicht|bu ay${W}|ay görünüm${W}|aylık görünüm${W}|aylık takvim${W}`)],
  ["verlauf", rx(`verlauf|ich\\s+erledigt|erledigte\\p{L}*|geschafft|historie|geçmiş${W}|tamamlanan${W}|yaptıklarım${W}`)],
  ["vorrat", rx(`vorr(?:a|ä)t${W}|supplement${W}|stok${W}|takviye${W}`)],
  ["termine", rx(`termine|aufgaben|kalender|randevu${W}|görev${W}|takvim${W}`)],
  ["plan", rx(`routinen|rutin${W}`)],
  ["mehr", rx(`einstellung${W}|mehr|ayar${W}`)],
  ["heute", rx(`tag|tagesplan|heute|bugün${W}|gün${W}|program${W}`)],
];

const ZAHL = { ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, zehn: 10, zwanzig: 20, dreißig: 30, bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, on: 10, yirmi: 20, otuz: 30 };

// "30 Minuten vorher", "eine Stunde vorher", "halbe Stunde", "1 gün önce", "yarım saat önce"
function parseLead(s) {
  if (rx("halbe\\s+stunde|yarım\\s+saat").test(s)) return 30;
  if (rx("viertelstunde|çeyrek\\s+saat").test(s)) return 15;
  const m = s.match(rx(`(\\d{1,3}|${Object.keys(ZAHL).join("|")})\\s*(minute${W}|min|stunde${W}|std|tag${W}|dakika${W}|dk|saat${W}|gün${W})`));
  if (!m) return null;
  const n = /\d/.test(m[1]) ? Number(m[1]) : ZAHL[m[1].toLowerCase()];
  const u = m[2].toLowerCase();
  return /^(stunde|std|saat)/.test(u) ? n * 60 : /^(tag|gün)/.test(u) ? n * 1440 : n;
}

// Befehlswörter, Datum und Uhrzeit entfernen; was übrig bleibt, beschreibt das Ziel
const STRIP = rx([
  "lösch\\p{L}*", "entfern\\p{L}*", "streich\\p{L}*", "absag\\p{L}*", "verschieb\\p{L}*", "verleg\\p{L}*", "schieb\\p{L}*", "umleg\\p{L}*", "änder\\p{L}*",
  "pausier\\p{L}*", "deaktivier\\p{L}*", "aktivier\\p{L}*", "reaktivier\\p{L}*", "stopp\\p{L}*", "mach\\p{L}*", "setz\\p{L}*", "markier\\p{L}*", "zeig\\p{L}*", "öffne\\p{L}*",
  "wichtig", "unwichtig", "dringend", "nicht", "erledigt", "doch", "wieder", "bitte", "die", "der", "das", "den", "dem", "mein\\p{L}*", "auf", "um", "an", "am", "zu", "ab", "aus", "mir", "mich",
  "sil\\p{L}*", "kaldır\\p{L}*", "iptal\\p{L}*", "ertele\\p{L}*", "taşı\\p{L}*", "kaydır\\p{L}*", "değiştir\\p{L}*", "durdur\\p{L}*", "duraklat\\p{L}*", "kapat\\p{L}*",
  "aktif\\p{L}*", "önemli", "önemsiz", "acil", "yap\\p{L}*", "et", "lütfen", "göster\\p{L}*", "geri", "al", "tekrar", "aç", "değil",
].join("|"));

function targetText(s, lang) {
  let rest = s;
  const d = (lang === "tr" ? parseDateTr : parseDate)(rest, new Date());
  if (d.hit) rest = rest.replace(d.hit, " ");
  const t = (lang === "tr" ? parseTimeTr : parseTime)(rest);
  if (t.hit) rest = rest.replace(t.hit, " ");
  return rest.replace(new RegExp(STRIP.source, "giu"), " ").replace(/\s+/g, " ").trim();
}

function findTarget(s, targets, lang, filter = () => true) {
  const list = targets.filter(filter);
  return findPrayer(s, list) ?? findMatch(targetText(s, lang) || s, list);
}

function dateTime(s, now, lang) {
  const d = (lang === "tr" ? parseDateTr : parseDate)(s, now);
  const t = (lang === "tr" ? parseTimeTr : parseTime)(d.hit ? s.replace(d.hit, " ") : s);
  return { date: d.hit ? isoOf(d.date) : null, time: t.time, end: t.end ?? null };
}
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseIntent(text, now = new Date(), targets = [], lang = "de", supplies = [], training = {}) {
  const s = text.replace(/İ/g, "i").replace(/[!?]|(?<!\d)[,.]|[,.](?!\d)/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;

  if (RE.hilfe.test(s)) return { type: "hilfe" };
  if (RE.tuerkisch.test(s)) return { type: "sprache", lang: "tr" };
  if (RE.deutsch.test(s)) return { type: "sprache", lang: "de" };

  // Darstellung: "dunkler Modus", "hell", "karanlık mod", "aydınlık tema"
  if (rx(`modus|design|darstellung|thema|theme|tema|mod${W}|görünüm${W}`).test(s) || rx(`mach${W}\\s+(?:es\\s+)?(?:hell|dunkel)`).test(s)) {
    if (rx(`dunk${W}|dark|nacht${W}|karanlık${W}|koyu${W}|gece${W}`).test(s)) return { type: "theme", theme: "dark" };
    if (rx(`hell${W}|light|tag${W}|aydınlık${W}|açık${W}|gündüz${W}`).test(s)) return { type: "theme", theme: "light" };
    if (rx(`auto${W}|system${W}|otomatik${W}`).test(s)) return { type: "theme", theme: "auto" };
  }

  // Routinen-Ansicht nach Tageszeit oder Bereich
  if (/routin|rutin/iu.test(s) && RE.gruppe.test(s)) {
    return { type: "gruppe", g: /(bereich|kategorie|alan)/iu.test(s) ? "bereich" : "zeit" };
  }

  const isNew = RE.neu.test(s);

  // Suche: "suche Zahnarzt", "finde Miete", "Zahnarzt ara", "Miete'yi bul"
  const q = s.match(/^(?:such\p{L}*|find\p{L}*|wo ist|wo war)\s+(?:nach\s+)?(.+)$/iu) ?? s.match(/^(.+?)\s+(?:bul|arat|aramasını yap)$/iu) ?? s.match(/^(?:ara|bul)\s+(.+)$/iu);
  if (q && !isNew) return { type: "suche", q: q[1].replace(/'\p{L}*$/u, "").trim() };

  const sup = supplyIntent(s, supplies, lang);
  if (sup) return sup;

  const body = bodyIntent(s);
  if (body && !isNew) return body;

  const tr = RE.erinnerung.test(s) || isNew ? null : trainingIntent(s, training);
  if (tr) return tr;

  // Checkliste: "füge Milch zur Einkaufsliste hinzu" / "Alışveriş listesine süt ekle"
  let m = s.match(/(?:füg\p{L}*|setz\p{L}*|pack\p{L}*|schreib\p{L}*)\s+(.+?)\s+(?:zur|zum|zu|auf die|auf|in die|in)\s+(.+?)(?:\s+hinzu|\s+dazu|\s+drauf|\s+rein)?$/iu);
  if (m) {
    const target = findMatch(m[2].replace(/(?:check)?liste?\p{L}*/iu, " "), targets.filter((x) => x.kind !== "routine"));
    if (target) return { type: "checkliste", target, item: cap(m[1]) };
  }
  m = s.match(/(.+?)\s+(?:kontrol\s+)?listesi\p{L}*\s+(.+?)\s+ekle\p{L}*$/iu);
  if (m) {
    const target = findMatch(m[1], targets.filter((x) => x.kind !== "routine"));
    if (target) return { type: "checkliste", target, item: cap(m[2]) };
  }

  // Erinnerung: "erinnere mich 30 Minuten vorher an Zahnarzt"
  if (RE.erinnerung.test(s) && RE.vorher.test(s)) {
    const minutes = parseLead(s);
    if (minutes != null) {
      const rest = s.replace(rx(`(\\d{1,3}|${Object.keys(ZAHL).join("|")}|halbe|yarım)\\s*(minute${W}|min|stunde${W}|std|tag${W}|dakika${W}|dk|saat${W}|gün${W})`), " ");
      const target = findTarget(rest.replace(RE.erinnerung, " ").replace(RE.vorher, " "), targets, lang, (x) => x.kind !== "routine");
      if (target) return { type: "erinnerung", target, minutes };
    }
  }

  if (!isNew && RE.loeschen.test(s)) {
    const target = findTarget(s, targets, lang);
    if (target) return { type: "loeschen", target };
  }
  if (RE.offen.test(s)) {
    const target = findTarget(s, targets, lang, (x) => x.done);
    if (target) return { type: "offen", target };
  }
  if (!isNew && RE.verschieben.test(s)) {
    const when = dateTime(s, now, lang);
    const target = findTarget(s, targets, lang);
    if (target && (when.date || when.time)) return { type: "verschieben", target, ...when };
  }
  if (!isNew && (RE.pause.test(s) || RE.aktiv.test(s))) {
    const target = findTarget(s, targets, lang, (x) => x.kind === "routine");
    if (target) return { type: "pause", target, active: !RE.pause.test(s) };
  }
  if (!isNew && (RE.unwichtig.test(s) || RE.wichtig.test(s))) {
    const target = findTarget(s, targets, lang);
    if (target) return { type: "prio", target, priority: RE.unwichtig.test(s) ? "normal" : "hoch" };
  }

  // Anzeigen: "zeig mir morgen", "was steht Freitag an", "öffne Einstellungen", "yarın neler var"
  const shortView = s.split(" ").length <= 3 && VIEW_WORDS.slice(0, 3).find(([, r]) => r.test(s));
  if ((RE.zeige.test(s) || shortView) && !isNew) {
    const when = dateTime(s, now, lang);
    const view = VIEW_WORDS.find(([, r]) => r.test(s))?.[0];
    if (when.date) return { type: "zeige", view: "heute", date: when.date };
    if (view) return { type: "zeige", view };
    const target = findTarget(s, targets, lang);
    if (target) return { type: "detail", target };
  }
  return null;
}

// "Aufgabe Steuer bis Freitag, wichtig" -> Priorität hoch und Wort aus dem Titel
export function extractPrio(title) {
  if (!RE.wichtig.test(title) || RE.unwichtig.test(title)) return { title, priority: null };
  const clean = title.replace(new RegExp(RE.wichtig.source, "giu"), " ").replace(/\s+/g, " ").trim();
  return { title: cap(clean) || title, priority: "hoch" };
}

const cap = (x) => { const v = x.trim(); return v.charAt(0).toLocaleUpperCase() + v.slice(1); };

// ---------- Wiederholung: "jeden Monat", "jährlich", "her ay", "her yıl" ----------
const REPEAT_RE = [
  ["monatlich", rx(`jeden\\s+monat${W}|jedes\\s+monat${W}|monatlich|einmal\\s+im\\s+monat|her\\s+ay${W}|aylık|ayda\\s+bir`)],
  ["jaehrlich", rx(`jedes\\s+jahr|jährlich|einmal\\s+im\\s+jahr|her\\s+yıl${W}|her\\s+sene${W}|yıllık|yılda\\s+bir`)],
  ["woechentlich", rx(`jede\\s+woche|wöchentlich|einmal\\s+die\\s+woche|her\\s+hafta${W}|haftalık|haftada\\s+bir`)],
];
// Gibt den Text ohne die Wiederholungswörter zurück; "täglich" bleibt, das sind Routinen
export function extractRepeat(text) {
  for (const [repeat, r] of REPEAT_RE) {
    if (r.test(text)) return { text: text.replace(new RegExp(r.source, "giu"), " ").replace(/\s+/g, " ").trim(), repeat };
  }
  return { text, repeat: null };
}

// ---------- Vorrat: "Magnesium aufgefüllt 60", "noch 40 Magnesium", "wie lange reicht Magnesium" ----------
const REFILL = rx(`aufgefüllt|auffüllen|nachgekauft|nachkaufen|gekauft|aufgestockt|geliefert|angekommen|neue?\\s+packung|doldur${W}|satın\\s+aldım|yeni\\s+aldım|geldi|stok${W}\\s+ekle`);
const ALDIM = rx(`aldım`);
const REST = rx(`noch|übrig|bestand|habe\\s+noch|hab\\s+noch|kaldı|var|elimde`);
const ASK = rx(`wie\\s+lange|reicht|wie\\s+viel${W}|ne\\s+kadar|kaç\\s+gün|yeter${W}`);
const UNIT = `kapsel${W}|tablette${W}|tabs|stück|tropfen|portion${W}|ml|g|gramm|tane|kapsül${W}|tablet|damla|adet`;
const SUP_STRIP = rx([UNIT, "aufgefüllt", "auffüllen", "nachgekauft", "nachkaufen", "gekauft", "aufgestockt", "geliefert", "angekommen", "neue?", "packung", "noch", "übrig", "bestand",
  "habe", "hab", "ich", "wie", "lange", "reicht", "viel\\p{L}*", "mein\\p{L}*", "vom", "von", "das", "die", "der", "den", "ist", "sind", "vorrat", "doldur\\p{L}*", "satın", "aldım", "yeni",
  "geldi", "stok\\p{L}*", "ekle", "kaldı", "var", "elimde", "ne", "kadar", "kaç", "gün", "yeter\\p{L}*", "için", "mehr"].join("|"));

function supplyName(s, amountHit) {
  return (amountHit ? s.replace(amountHit, " ") : s).replace(new RegExp(SUP_STRIP.source, "giu"), " ").replace(/'\p{L}*/gu, "").replace(/\s+/g, " ").trim();
}

function supplyIntent(s, supplies, lang) {
  // Menge: die Zahl vor einer Einheit, sonst die letzte Zahl ("Omega 3 nachgekauft 90" -> 90)
  const nums = [...s.matchAll(/(\d+(?:[.,]\d+)?)(\s*(?:kapsel|tablette|tabs|stück|tropfen|portion|ml|g\b|gramm|tane|kapsül|tablet|damla|adet)\p{L}*)?/giu)];
  const num = nums.find((x) => x[2]) ?? nums[nums.length - 1];
  const n = num ? Number(num[1].replace(",", ".")) : null;
  const pick = () => {
    const name = supplyName(s, num?.[0]);
    if (!name) return { name: "", supply: null };
    const supply = findMatch(name, supplies.map((x) => ({ ...x, title: x.name }))) ?? null;
    return { name: cap(name), supply };
  };
  const refill = REFILL.test(s) || (ALDIM.test(s) && n >= 5);
  if (refill && n) {
    const { name, supply } = pick();
    if (supply || name) return { type: "vorrat", mode: "add", amount: n, supply, name };
  }
  if (n != null && REST.test(s) && !ASK.test(s)) {
    const { name, supply } = pick();
    if (supply) return { type: "vorrat", mode: "set", amount: n, supply, name };
  }
  if (ASK.test(s) || /vorr(?:a|ä)t|stok/iu.test(s)) {
    const { supply } = pick();
    if (supply) return { type: "vorrat", mode: "info", supply };
  }
  return null;
}

// ---------- Körperwerte: "Gewicht 99,5", "ich wiege 99,5 kg", "Bauchumfang 104", "kilom 99,5", "bel çevrem 104" ----------
function bodyIntent(s) {
  const NUM = "(\\d{2,3}(?:[.,]\\d)?)";
  const w = s.match(rx(`(?:(?:mein\\s+|körper)?gewicht(?:\\s+(?:ist|heute|beträgt))?|ich\\s+wiege(?:\\s+heute)?|kilom(?:\\s+bugün)?|tartıldım|ağırlığım)\\s*:?\\s*${NUM}`)) ?? s.match(rx(`${NUM}\\s*(?:kg|kilo)\\s+(?:gewogen|wiege|tartıldım|geldim)`));
  const u = s.match(rx(`(?:bauch(?:umfang)?|taille|bel(?:\\s+çevre${W}|\\s+ölçü${W})?)\\s*:?\\s*${NUM}\\s*(?:cm|zentimeter|santim${W})?`));
  if (!w && !u) return null;
  return { type: "training", action: "body", weight_kg: w ? Number(w[1].replace(",", ".")) : null, waist_cm: u ? Number(u[1].replace(",", ".")) : null };
}

// ---------- Training: "Starte Training", "Latziehen 50 kg 12 Wiederholungen", "3x12 mit 40 kg Seil runter", "Training beenden" ----------
const TRAIN_WORD = rx(`\\p{L}*training${W}|workout|gym|fitness|antrenman${W}|spor${W}|idman${W}`);
const START = rx(`start${W}|beginn${W}|anfangen|fang${W}\\s+an|los\\s+geht${W}|başla${W}|başlat${W}`);
const ANALYSE = rx(`analyse${W}|analysier${W}|auswert${W}|analiz${W}|değerlendir${W}`);
const REMOVE = rx(`entfern${W}|raus(?:nehmen)?|weglassen|lass${W}\\s+weg|überspring${W}|streich${W}|çıkar${W}|kaldır${W}|atla${W}`);
const MOVE_FIRST = rx(`als\\s+nächst${W}|zuerst|vorziehen|zieh${W}\\s+vor|nach\\s+oben|nach\\s+vorne\\s+(?:schieben|holen|nehmen)|öne\\s+al${W}|başa\\s+al${W}|sıradaki\\s+yap`);
const MOVE_LAST = rx(`ans\\s+ende|zum\\s+schluss|nach\\s+hinten|später|sona\\s+al${W}|sona\\s+bırak${W}|en\\s+sona`);
const STOP = rx(`beend${W}|fertig|abschließen|stopp${W}|schluss|bitir${W}|bitti|tamamla${W}`);
// Zusätzliche Wörter je Bild, damit auch Umschreibungen die richtige Übung finden
const EX_ALIAS = {
  lat_wide: "latziehen lat breit weit lange stange wide geniş uzun bar çekme",
  lat_close: "latziehen lat eng enge kurze stange close dar yakın çekme",
  row_incline: "rudern ruder rudermaschine schräg liegend brust row kürek eğimli göğüs",
  row_single: "einarmig einzeln einer arm maschine sitzend griffe brustauflage brust polster iso lateral rudern tek kol oturarak göğüs destekli kürek",
  pushdown: "trizeps seil runter unten drücken pushdown triceps triseps halat aşağı",
  overhead_ext: "trizeps seil vorne überkopf nach vorne triceps triseps halat öne baş üstü",
  skullcrusher: "sz stirn stirndrücken french press skull alın ez bar",
  curl: "bizeps curl biceps pazı",
  bench: "bank bankdrücken bench göğüs press",
  face_pull: "face pulls facepull gesicht seil hintere schulter yüz halat arka omuz",
  hyperext: "hyperextension hyperextensions rückenstrecker unterer rücken bel sırt ekstansiyon",
  rdl: "rumänisch kreuzheben deadlift romanian rdl ölü kaldırma",
  hip_thrust: "hip thrust glute bridge gesäß po kalça köprü",
  reverse_fly: "reverse butterfly fly hintere schulter ters kelebek arka omuz",
  dead_bug: "dead bug deadbug toter käfer ölü böcek",
  side_plank: "seitstütz side seitlich seite yan",
  plank: "plank planke unterarmstütz stütz brett",
  neck_curl: "nacken nackencurl hals kopf neck curl boyun",
  dead_hang: "hängen hang dead stange klimmzugstange barfiks asılma asılı",
  situp: "sit ups situps situp crunch crunches bauchpresse mekik",
  pallof: "pallof press anti rotation",
  treadmill: "laufband bergauf bergsteigen gehen cardio koşu bandı yürüyüş eğim",
};
const stem5 = (w) => w.toLocaleLowerCase("de-DE").slice(0, 5);
const STOP_W = new Set(["am", "an", "im", "in", "um", "zu", "mit", "nach", "der", "die", "das", "und", "den", "dem", "ve", "ile", "bir"]);
const words = (x) => x.toLocaleLowerCase("de-DE").split(/[^\p{L}\d]+/u).filter((w) => w.length > 1 && !STOP_W.has(w));

export function findExercise(s, exercises = []) {
  const said = new Set(words(s).map(stem5));
  let best = null, score = 0;
  for (const x of exercises) {
    const own = new Set(words(x.name).map(stem5));
    const alias = new Set(words(EX_ALIAS[x.pattern] ?? "").filter((w) => w.length > 1).map(stem5));
    let sc = 0;
    for (const w of said) { if (own.has(w)) sc += 2; else if (alias.has(w)) sc += 1; }
    if (sc > score) { best = x; score = sc; }
  }
  return score >= 2 ? best : null;
}

function trainingIntent(s, { exercises = [], workouts = [], running = false } = {}) {
  const hasTrainWord = TRAIN_WORD.test(s);
  const workout = workouts.find((w) => words(w.name).filter((x) => x.length > 2).some((x) => rx(x.replace(/[^\p{L}\d]/gu, "")).test(s)));
  if (STOP.test(s) && (hasTrainWord || running) && !/\d/.test(s)) return { type: "training", action: "stop" };
  if (rx(`fortsetz${W}|setz${W}\\s+(?:das\\s+)?training\\s+fort|weiter\\s*machen|weitertrainieren|devam${W}`).test(s) && hasTrainWord) return { type: "training", action: "resume" };
  if (START.test(s) && (hasTrainWord || workout)) return { type: "training", action: "start", workout: workout ?? null };
  // "Zeig die Analyse", "Trainingsauswertung", "antrenman analizi"
  if (ANALYSE.test(s) || (rx(`fortschritt${W}|ilerleme${W}`).test(s) && hasTrainWord)) return { type: "training", action: "analysis" };
  // "Face Pulls als Nächstes", "Hyperextensions ans Ende", "Face Pull'u öne al"
  const mv = MOVE_FIRST.test(s) ? "first" : MOVE_LAST.test(s) ? "last" : null;
  if (mv && running && !/\d/.test(s)) {
    const exercise = findExercise(s.replace(MOVE_FIRST, " ").replace(MOVE_LAST, " "), exercises);
    if (exercise) return { type: "training", action: "move", exercise, dir: mv };
  }
  // "Face Pulls entfernen", "Hyperextensions weglassen", "Face Pull'u çıkar"
  if (REMOVE.test(s) && !/\d/.test(s)) {
    const exercise = findExercise(s.replace(REMOVE, " "), exercises);
    if (exercise && running) return { type: "training", action: "remove", exercise };
  }

  let sets = null, reps = null, kg = null, m;
  if ((m = s.match(/(\d{1,2})\s*[x×]\s*(\d{1,3})(?!\s*(?:kg|kilo))/iu))) { sets = +m[1]; reps = +m[2]; }
  if ((m = s.match(rx(`(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo${W}|kilogramm)`)))) kg = Number(m[1].replace(",", "."));
  if (reps == null && (m = s.match(rx(`(\\d{1,3})\\s*(?:mal|wiederholung${W}|wdh|reps?|tekrar${W}|kere)`)))) reps = +m[1];
  if (sets == null && (m = s.match(rx(`(\\d{1,2})\\s*(?:sätze|satz|sets?|seri${W}|set)`)))) sets = +m[1];
  // Reserve: "RIR 2", "2 in Reserve", "2 übrig", "2 yedek"
  let rir = null;
  if ((m = s.match(rx(`(?:rir|reserve)\\s*(\\d)|(\\d)\\s*(?:rir|in\\s+reserve|übrig|yedek${W}|rezerv${W})`)))) { rir = Number(m[1] ?? m[2]); s = s.replace(m[0], " "); }
  // Zeit und Cardio: "45 Sekunden", "10 Minuten", "Steigung 10", "5 km/h"
  let duration_sec = null, speed = null, incline = null;
  if ((m = s.match(rx(`(\\d{1,4})\\s*(?:sek${W}|s|saniye${W})`)))) duration_sec = +m[1];
  if ((m = s.match(rx(`(\\d{1,3}(?:[.,]\\d+)?)\\s*(?:min${W}|dakika${W}|dk)`)))) duration_sec = Math.round(Number(m[1].replace(",", ".")) * 60);
  if ((m = s.match(/(\d{1,2}(?:[.,]\d+)?)\s*(?:km\/?h|km\s*pro\s*stunde|kilometer)/iu))) speed = Number(m[1].replace(",", "."));
  if ((m = s.match(/(?:steigung|eğim|incline)\s*(?:von\s*)?(\d{1,2}(?:[.,]\d+)?)|(\d{1,2}(?:[.,]\d+)?)\s*(?:%|prozent)/iu))) incline = Number((m[1] ?? m[2]).replace(",", "."));
  if (kg == null && reps == null && (duration_sec != null || speed != null || incline != null)) {
    const exercise = findExercise(s.replace(/\d+(?:[.,]\d+)?/g, " "), exercises);
    if (exercise || running) return { type: "training", action: "log", exercise, kg: null, reps: null, duration_sec, speed, incline, sets: sets ?? 1 };
  }
  // "35 kg 10": die übrige Zahl sind die Wiederholungen
  if (kg != null && reps == null) {
    const rest = s.replace(rx(`(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo${W}|kilogramm)`), " ").replace(rx(`(\\d{1,2})\\s*(?:sätze|satz|sets?|seri${W}|set)`), " ").match(/\b(\d{1,3})\b/);
    if (rest) reps = +rest[1];
  }
  if (kg == null && reps == null) return null;
  const clean = s.replace(/\d+(?:[.,]\d+)?/g, " ");
  const exercise = findExercise(clean, exercises);
  if (!exercise && !running) return null;
  return { type: "training", action: "log", exercise, kg, reps, sets: sets ?? 1, rir };
}
