// Versteht einfache türkische Sprachbefehle, gleiche Ausgabe wie parser.js.
// parseTr("Yarın saat 15'te diş doktoru randevusu", new Date(), kandidaten)
import { isoDate, findMatch } from "./parser.js";

const B = "(?<![\\p{L}\\d])";
const E = "(?![\\p{L}\\d])";
// Wortstamm plus beliebige Endung (Türkisch hängt Endungen an: cuma'ya, randevusu)
const SUF = "(?:'?\\p{L}*)";
const rx = (body, flags = "iu") => new RegExp(B + "(?:" + body + ")" + E, flags);
const stems = (list) => rx("(?:" + list.join("|") + ")" + SUF);

const DAYS = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"]; // 1 = Montag
const DAY_RE = "(cumartesi|pazartesi|salı|çarşamba|perşembe|cuma|pazar)";
const MONTHS = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];

const PRAYERS = { fajr: ["sabah namaz", "fecr", "fajr"], dhuhr: ["öğle", "ögle", "dhuhr"], asr: ["ikindi", "asr"], maghrib: ["akşam namaz", "aksam namaz", "maghrib"], isha: ["yatsı", "yatsi", "isha"] };

const DONE_RE = stems(["kıldım", "kildim", "yaptım", "bitti", "bitirdim", "tamamladım", "tamamlandı", "tamam", "okudum", "aldım", "içtim", "hallettim", "işaretle"]);
const TERMIN_RE = stems(["randevu", "toplantı", "görüşme", "buluşma"]);
const AUFGABE_RE = stems(["görev", "yapılacak", "hatırlat", "unutma", "lazım", "gerek"]);
const ROUTINE_RE = stems(["rutin", "alışkanlık"]);
const KADAR_RE = rx("kadar");

const FILLER = ["lütfen", "ekle", "oluştur", "kaydet", "yeni", "bir", "için", "ve", "beni", "bana", "olarak", "saat", "ile", "de", "da",
  "planla", "yapmam", "yapmalıyım", "yapmalı", "bitmeli", "bitmesi", "bitsin", "gerekiyor", "olmalı", "olsun", "kadar", "her", "ekler", "misin", "mısın"];
const FILLER_RE = rx(FILLER.join("|"), "giu");

const CATEGORY_WORDS = {
  gebet: ["namaz", "kuran", "kur'an", "dua", "zikir"],
  lesen: ["kitap", "oku", "sayfa"],
  training: ["spor", "antrenman", "yürüyüş", "koşu", "fitness", "şınav", "stepper"],
  supps: ["vitamin", "hap", "takviye", "magnezyum", "kapsül"],
  pflege: ["bakım", "krem", "cilt", "saç", "maske", "masaj", "tıraş"],
  essen: ["yemek", "kahvaltı", "öğle yemeği", "akşam yemeği", "alışveriş", "pişir"],
};

const pad = (n) => String(n).padStart(2, "0");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayIndex = (w) => DAYS.indexOf(w.toLocaleLowerCase("tr-TR")) + 1;

function parseDate(s, now) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let m;
  if ((m = s.match(rx("öbür\\s*gün" + SUF + "|yarından\\s+sonra")))) return { date: addDays(base, 2), hit: m[0] };
  if ((m = s.match(rx("yarın" + SUF)))) return { date: addDays(base, 1), hit: m[0] };
  if ((m = s.match(rx("bugün" + SUF)))) return { date: base, hit: m[0] };
  if ((m = s.match(new RegExp(B + "(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{4}|\\d{2})?" + SUF, "iu")))) {
    const y = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : base.getFullYear();
    let d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < base) d = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
    return { date: d, hit: m[0] };
  }
  if ((m = s.match(rx(`(\\d{1,2})\\s+(${MONTHS.join("|")})${SUF}`)))) {
    const mon = MONTHS.indexOf(m[2].toLocaleLowerCase("tr-TR"));
    let d = new Date(base.getFullYear(), mon, Number(m[1]));
    if (d < base) d = new Date(base.getFullYear() + 1, mon, Number(m[1]));
    return { date: d, hit: m[0] };
  }
  if ((m = s.match(rx(`(?:gelecek\\s+|haftaya\\s+|bu\\s+)?${DAY_RE}${SUF}`)))) {
    const wd = dayIndex(m[1]);
    let diff = (wd - (((base.getDay() + 6) % 7) + 1) + 7) % 7;
    if (diff === 0) diff = 7;
    return { date: addDays(base, diff), hit: m[0] };
  }
  return { date: base, hit: null };
}

const NUM = "(\\d{1,2})(?:[:.](\\d{2}))?";
function parseTime(s) {
  let m;
  const t = (h, min = 0) => `${pad(h % 24)}:${pad(min)}`;
  const pm = (h) => (h >= 1 && h <= 6 ? h + 12 : h);
  const evening = /akşam|aksam|gece/iu.test(s);
  const adj = (h, hasMin) => (evening && h < 12 ? h + 12 : hasMin ? h : pm(h));
  // 14'ten 16'ya kadar / 14 ile 16 arası
  if ((m = s.match(rx(`(?:saat\\s+)?${NUM}'?(?:den|dan|ten|tan)\\s+${NUM}'?(?:ye|ya|e|a)\\s+kadar`)))
    || (m = s.match(rx(`(?:saat\\s+)?${NUM}\\s*(?:ile|-)\\s*${NUM}\\s+aras\\p{L}*`)))) {
    return { time: t(adj(+m[1], !!m[2]), +(m[2] || 0)), end: t(adj(+m[3], !!m[4]), +(m[4] || 0)), hit: m[0] };
  }
  if ((m = s.match(rx(`(?:(?:sabah|akşam|aksam|öğleden\\s+sonra|gece)\\s+)?saat\\s+(\\d{1,2})\\s+buçuk${SUF}`)))) return { time: t(adj(+m[1], false), 30), hit: m[0] };
  if ((m = s.match(rx(`(?:(?:sabah|akşam|aksam|öğleden\\s+sonra|gece)\\s+)?saat\\s+${NUM}${SUF}`)))) return { time: t(adj(+m[1], !!m[2]), +(m[2] || 0)), hit: m[0] };
  if ((m = s.match(rx(`(?:(?:sabah|akşam|aksam|öğleden\\s+sonra|gece)\\s+)?${NUM}'(?:de|da|te|ta|e|a|ye|ya)`)))) return { time: t(adj(+m[1], !!m[2]), +(m[2] || 0)), hit: m[0] };
  if ((m = s.match(rx(`(\\d{1,2})[:.](\\d{2})${SUF}`)))) return { time: t(+m[1], +m[2]), hit: m[0] };
  return { time: null, hit: null };
}

function parseRecurrence(s) {
  const daily = rx("her\\s*gün" + SUF + "|günlük|her\\s+sabah|her\\s+akşam|her\\s+gece|her\\s+öğlen|her\\s+zaman");
  if (daily.test(s)) return { days: [1, 2, 3, 4, 5, 6, 7], hits: [daily] };
  const weekdays = rx("hafta\\s+içi" + SUF);
  if (weekdays.test(s)) return { days: [1, 2, 3, 4, 5], hits: [weekdays] };
  const weekend = rx("(?:her\\s+)?hafta\\s+sonu" + SUF + "|hafta\\s+sonları");
  if (weekend.test(s) && /her|ları/iu.test(s)) return { days: [6, 7], hits: [weekend] };
  const list = s.match(rx(`her\\s+${DAY_RE}${SUF}(?:\\s*(?:,|ve)\\s*${DAY_RE}${SUF})*`));
  if (list) {
    const days = [...list[0].matchAll(new RegExp(DAY_RE, "giu"))].map((x) => dayIndex(x[1]));
    return { days: [...new Set(days)].sort(), hits: [new RegExp(list[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu")] };
  }
  const days = [], hits = [];
  for (const m of s.matchAll(new RegExp(B + DAY_RE + "(?:ları|leri|günleri)" + E, "giu"))) {
    days.push(dayIndex(m[1])); hits.push(new RegExp(m[0], "iu"));
  }
  if (days.length) return { days: [...new Set(days)].sort(), hits };
  const weekly = rx("her\\s+hafta|haftalık");
  if (weekly.test(s)) return { days: null, weekly: true, hits: [weekly] };
  return null;
}

function cleanTitle(s) {
  const out = s
    .replace(new RegExp(TERMIN_RE.source, "giu"), " ")
    .replace(new RegExp(AUFGABE_RE.source, "giu"), " ")
    .replace(new RegExp(ROUTINE_RE.source, "giu"), " ")
    .replace(FILLER_RE, " ")
    .replace(/[.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out.charAt(0).toLocaleUpperCase("tr-TR") + out.slice(1);
}

function guessCategory(s) {
  const low = s.toLocaleLowerCase("tr-TR");
  for (const [cat, list] of Object.entries(CATEGORY_WORDS)) if (list.some((w) => low.includes(w))) return cat;
  return "sonstiges";
}

function findPrayer(s, candidates) {
  const low = s.toLocaleLowerCase("tr-TR");
  for (const [p, list] of Object.entries(PRAYERS)) {
    if (list.some((w) => rx(w + SUF).test(low))) {
      const c = candidates.find((c) => c.prayer === p);
      if (c) return c;
    }
  }
  return null;
}

export function parseTr(text, now = new Date(), candidates = []) {
  // Türkisches großes I/İ richtig behandeln, Rest der Schreibweise behalten
  const s = text.replace(/İ/g, "i").replace(/I/g, "ı").replace(/[!?,]/g, " ").replace(/\s+/g, " ").trim();
  const isTermin = TERMIN_RE.test(s);
  const isAufgabe = AUFGABE_RE.test(s);

  if (DONE_RE.test(s) && !isTermin && !isAufgabe) {
    const match = findPrayer(s, candidates) ?? findMatch(s, candidates);
    if (match) return { type: "erledigt", match };
  }

  let rest = s;
  const rec = parseRecurrence(rest);
  if (rec || ROUTINE_RE.test(s)) {
    for (const h of rec?.hits ?? []) rest = rest.replace(new RegExp(h.source, "giu"), " ");
    const t = parseTime(rest);
    if (t.hit) rest = rest.replace(t.hit, " ");
    let days = rec?.days ?? [1, 2, 3, 4, 5, 6, 7];
    if (rec?.weekly) days = [((now.getDay() + 6) % 7) + 1];
    const title = cleanTitle(rest);
    if (title) return { type: "routine", title, days, time: t.time, category: guessCategory(title) };
  }

  const t = parseTime(rest);
  if (t.hit) rest = rest.replace(t.hit, " ");
  const deadline = !t.end && KADAR_RE.test(rest);
  const d = parseDate(rest, now);
  if (d.hit) rest = rest.replace(d.hit, " ");
  // "Cumartesi 14'ten 16'ya kadar toplantı": Titel ist dann das Wort Toplantı selbst
  const title = cleanTitle(rest) || (isTermin ? ((w) => w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1))(s.match(TERMIN_RE)[0].replace(/'.*/, "")) : "");

  if (!title) return { type: "unbekannt", text };
  const type = isTermin ? "termin" : isAufgabe || deadline ? "aufgabe" : t.time ? "termin" : "aufgabe";
  return { type, title, date: isoDate(d.date), time: t.time, end: t.end ?? null };
}
