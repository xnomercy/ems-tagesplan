// Versteht einfache deutsche Sprachbefehle, ganz ohne KI.
// parse("Termin morgen um 15 Uhr Zahnarzt", new Date(), kandidaten)

const WEEKDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
const MONTHS = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];

const PRAYER_WORDS = {
  fajr: ["fajr", "fadschr", "sabah", "morgengebet", "frühgebet"],
  dhuhr: ["dhuhr", "zuhr", "duhr", "öğle", "ögle", "mittagsgebet"],
  asr: ["asr", "ikindi", "nachmittagsgebet"],
  maghrib: ["maghrib", "magrib", "akşam", "aksam", "abendgebet"],
  isha: ["isha", "ischa", "yatsı", "yatsi", "nachtgebet"],
};

// Wortgrenzen, die auch mit Umlauten funktionieren
const B = "(?<![\\p{L}\\d])";
const E = "(?![\\p{L}\\d])";
const rx = (body) => new RegExp(B + "(?:" + body + ")" + E, "iu");
const words = (list) => rx(list.join("|"));

const DONE_RE = words(["erledigt", "gemacht", "fertig", "abhaken", "abgehakt", "hake", "geschafft", "gebetet", "gelesen", "genommen", "getrunken", "trainiert", "done"]);
const TERMIN_RE = words(["termin", "treffen", "meeting", "arzttermin"]);
const AUFGABE_RE = words(["aufgabe", "todo", "erinnere mich", "erinner mich", "muss", "nicht vergessen"]);
const ROUTINE_RE = words(["routine", "gewohnheit"]);
const DEADLINE_RE = new RegExp(B + "(?:bis\\s+(?:zum\\s+|zur\\s+|spätestens\\s+)?|spätestens\\s+)", "iu");
const DAY_NAMES = ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"];
const CATEGORY_WORDS = {
  gebet: ["gebet", "beten", "namaz", "koran", "quran", "dua"],
  lesen: ["lesen", "buch", "seiten", "lektüre"],
  training: ["training", "sport", "gym", "fitness", "laufen", "joggen", "stepper", "liegestütze", "workout"],
  supps: ["supps", "vitamin", "magnesium", "tablette", "kapsel", "einnehmen"],
  pflege: ["pflege", "creme", "haut", "haare", "maske", "massage", "rasieren"],
  essen: ["essen", "kochen", "frühstück", "mittagessen", "abendessen", "meal", "einkaufen"],
};
const FILLER_RE = new RegExp(B + "(?:" + ["neuer", "neue", "neues", "einen", "eine", "ein", "trag", "trage", "eintragen", "plane", "planen", "bitte",
  "hinzufügen", "füge", "hinzu", "an", "am", "um", "für", "ist", "habe", "hab", "ich", "mich", "dass", "uhr", "leg", "lege", "anlegen",
  "fertig", "sein", "erledigt", "einmalig", "einmal", "dann", "neu", "routine", "gewohnheit", "jeden", "jede", "jeder", "immer", "mal", "und", "so", "zum", "zur", "das", "die", "den", "der"].join("|") + ")" + E, "giu");

const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const weekdayOf = (d) => ((d.getDay() + 6) % 7) + 1;

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseDate(s, now) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let m;
  if ((m = s.match(rx("übermorgen")))) return { date: addDays(base, 2), hit: m[0] };
  if ((m = s.match(rx("morgen")))) return { date: addDays(base, 1), hit: m[0] };
  if ((m = s.match(rx("heute")))) return { date: base, hit: m[0] };
  if ((m = s.match(new RegExp(B + "(?:am\\s+)?(\\d{1,2})\\.\\s?(\\d{1,2})\\.?(\\d{4}|\\d{2})?\\.?", "iu")))) {
    const y = m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : base.getFullYear();
    let d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < base) d = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
    return { date: d, hit: m[0] };
  }
  if ((m = s.match(rx(`(?:am\\s+)?(\\d{1,2})\\.?\\s+(${MONTHS.join("|")})`)))) {
    const mon = MONTHS.indexOf(m[2].toLowerCase());
    let d = new Date(base.getFullYear(), mon, Number(m[1]));
    if (d < base) d = new Date(base.getFullYear() + 1, mon, Number(m[1]));
    return { date: d, hit: m[0] };
  }
  if ((m = s.match(rx(`(?:am\\s+|nächsten\\s+|kommenden\\s+)?(${WEEKDAYS.join("|")})`)))) {
    let diff = (WEEKDAYS.indexOf(m[1].toLowerCase()) - base.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return { date: addDays(base, diff), hit: m[0] };
  }
  return { date: base, hit: null };
}

function parseTime(s) {
  let m;
  const t = (h, min = 0) => `${pad(h % 24)}:${pad(min)}`;
  // "halb 8" ohne Zusatz meint meist abends
  const pm = (h) => (h >= 1 && h <= 6 ? h + 12 : h);
  if ((m = s.match(rx("von\\s+(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:uhr)?\\s+bis\\s+(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:uhr)?")))) {
    return { time: t(+m[1], +(m[2] || 0)), end: t(+m[3], +(m[4] || 0)), hit: m[0] };
  }
  if ((m = s.match(rx("(?:um\\s+)?halb\\s+(\\d{1,2})")))) return { time: t(pm(+m[1] - 1 || 12), 30), hit: m[0] };
  if ((m = s.match(rx("(?:um\\s+)?viertel\\s+nach\\s+(\\d{1,2})")))) return { time: t(pm(+m[1]), 15), hit: m[0] };
  if ((m = s.match(rx("(?:um\\s+)?viertel\\s+vor\\s+(\\d{1,2})")))) return { time: t(pm(+m[1] - 1 || 12), 45), hit: m[0] };
  if ((m = s.match(rx("(?:um\\s+)?(\\d{1,2})[:.](\\d{2})(?:\\s*uhr)?")))) return { time: t(+m[1], +m[2]), hit: m[0] };
  if ((m = s.match(rx("(?:um\\s+)?(\\d{1,2})\\s*uhr(?:\\s+(\\d{1,2}))?")))) return { time: t(+m[1], +(m[2] || 0)), hit: m[0] };
  if ((m = s.match(rx("um\\s+(\\d{1,2})")))) return { time: t(pm(+m[1])), hit: m[0] };
  return { time: null, hit: null };
}

function cleanTitle(s) {
  const out = s
    .replace(new RegExp(TERMIN_RE.source, "giu"), " ")
    .replace(new RegExp(AUFGABE_RE.source, "giu"), " ")
    .replace(FILLER_RE, " ")
    .replace(/[.:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const stem = (w) => w.slice(0, 5);
const tokens = (s) => s.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 2);

export function findMatch(s, candidates) {
  const low = s.toLowerCase();
  for (const [prayer, syn] of Object.entries(PRAYER_WORDS)) {
    if (syn.some((w) => rx(w).test(low))) {
      const c = candidates.find((c) => c.prayer === prayer);
      if (c) return c;
    }
  }
  const said = new Set(tokens(s).map(stem));
  let best = null, bestScore = 0;
  for (const c of candidates) {
    const score = tokens(c.title).map(stem).filter((w) => said.has(w)).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

// "täglich", "jeden Montag", "montags und donnerstags", "werktags" -> [1..7]
function parseRecurrence(s) {
  if (rx("täglich|jeden\\s+tag|jeden\\s+morgen|jeden\\s+abend|jede\\s+nacht|jeden\\s+mittag|jeden\\s+nachmittag|immer|tag\\s+für\\s+tag").test(s)) {
    return { days: [1, 2, 3, 4, 5, 6, 7], hits: [rx("täglich|jeden\\s+tag|jeden\\s+morgen|jeden\\s+abend|jede\\s+nacht|jeden\\s+mittag|jeden\\s+nachmittag|immer|tag\\s+für\\s+tag")] };
  }
  if (rx("werktags|unter\\s+der\\s+woche|montag\\s+bis\\s+freitag").test(s)) return { days: [1, 2, 3, 4, 5], hits: [rx("werktags|unter\\s+der\\s+woche|montag\\s+bis\\s+freitag")] };
  if (rx("(?:jedes\\s+|am\\s+)?wochenende").test(s) && rx("jedes|wochenends").test(s)) return { days: [6, 7], hits: [rx("(?:jedes\\s+|am\\s+)?wochenende")] };
  const DN = DAY_NAMES.join("|");
  const list = s.match(rx(`jeden\\s+((?:${DN})(?:\\s*(?:,|und)\\s*(?:${DN}))*)`));
  if (list) {
    const days = DAY_NAMES.map((d, i) => (rx(d).test(list[1]) ? i + 1 : 0)).filter(Boolean);
    return { days, hits: [new RegExp(list[0])] };
  }
  const days = [], hits = [];
  DAY_NAMES.forEach((d, i) => {
    const r = rx(`jeden\\s+${d}|${d}s`);
    if (r.test(s)) { days.push(i + 1); hits.push(r); }
  });
  if (days.length) return { days, hits };
  if (rx("wöchentlich|jede\\s+woche").test(s)) return { days: null, weekly: true, hits: [rx("wöchentlich|jede\\s+woche")] };
  return null;
}

function guessCategory(s) {
  const low = s.toLowerCase();
  for (const [cat, list] of Object.entries(CATEGORY_WORDS)) if (list.some((w) => low.includes(w))) return cat;
  return "sonstiges";
}

export function parse(text, now = new Date(), candidates = []) {
  const s = text.replace(/[!?,]/g, " ").replace(/\s+/g, " ").trim();
  const isTermin = TERMIN_RE.test(s);
  const isAufgabe = AUFGABE_RE.test(s);

  if (DONE_RE.test(s) && !isTermin && !isAufgabe) {
    const match = findMatch(s, candidates);
    if (match) return { type: "erledigt", match };
  }

  let rest = s;
  const rec = parseRecurrence(rest);
  if (rec || ROUTINE_RE.test(s)) {
    for (const h of rec?.hits ?? []) rest = rest.replace(new RegExp(h.source, "giu"), " ");
    const t = parseTime(rest);
    if (t.hit) rest = rest.replace(t.hit, " ");
    let days = rec?.days ?? [1, 2, 3, 4, 5, 6, 7];
    if (rec?.weekly) days = [weekdayOf(now)];
    const title = cleanTitle(rest);
    if (title) return { type: "routine", title, days, time: t.time, category: guessCategory(title) };
  }

  const isRange = /von\s+\d{1,2}(?:[:.]\d{2})?\s*(?:uhr)?\s+bis\s+\d/i.test(s);
  const deadline = !isRange && DEADLINE_RE.test(s);
  if (deadline) rest = rest.replace(new RegExp(DEADLINE_RE.source, "giu"), " ");
  const d = parseDate(rest, now);
  if (d.hit) rest = rest.replace(d.hit, " ");
  const t = parseTime(rest);
  if (t.hit) rest = rest.replace(t.hit, " ");
  const title = cleanTitle(rest);

  if (!title) return { type: "unbekannt", text };
  const type = isTermin ? "termin" : isAufgabe || deadline ? "aufgabe" : t.time ? "termin" : "aufgabe";
  return { type, title, date: isoDate(d.date), time: t.time, end: t.end ?? null };
}
