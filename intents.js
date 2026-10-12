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

export function parseIntent(text, now = new Date(), targets = [], lang = "de") {
  const s = text.replace(/İ/g, "i").replace(/[!?,.]/g, " ").replace(/\s+/g, " ").trim();
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
  if (RE.zeige.test(s) && !isNew) {
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
