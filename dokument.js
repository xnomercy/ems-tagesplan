// Termine und Fristen aus Fotos, PDFs, Kalenderdateien und eingefügtem Text.
// Alles läuft auf dem Handy: pdf.js liest den PDF-Text, Tesseract.js erkennt Text auf Fotos. Keine externe KI.
import { deadlineKind, KINDS } from "./fristen.js";

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/";
const TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/";
const TESS_CORE = "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (h, m = 0) => `${pad(h)}:${pad(m)}`;

const MONTHS = {
  januar: 1, jan: 1, jänner: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  august: 8, aug: 8, september: 9, sept: 9, sep: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6, temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9,
  ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const WD = "montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar";
const monthOf = (w) => MONTHS[w.toLowerCase().replace(/i̇/g, "i").replace(/\.$/, "")];

// Wörter vor einem Datum, die keinen Termin meinen (Briefdatum, Geburtstag, Rechnungsdatum …)
const IGN = /(?:geburtsdatum|geb\.|geboren|rechnungsdatum|belegdatum|lieferdatum|leistungsdatum|leistungszeitraum|ausstellungsdatum|ausgestellt|erstellt|druckdatum|bestelldatum|bestellt am|auftragsdatum|schreiben vom|nachricht vom|stand|vom|seit|doğum tarihi|fatura tarihi|düzenleme tarihi|tarihli)\s*:?\s*(?:am\s*)?$|(?:^|\s)datum\s*:?\s*$|^\s*[\p{L} .-]{2,30},\s*(?:den\s*)?$/iu;
const K_TERMIN = /termin|untersuchung|sprechstunde|behandlung|vorstellung|einladung|erscheinen|beginn|treffen|besprechung|abhol|gespräch|sitzung|veranstaltung|impfung|anreise|check-?in|abflug|abfahrt|randevu|muayene|toplantı|görüşme|davet/iu;
const K_FRIST = /zahlbar|zahlung|zahlen|fällig|spätestens|bis zum|bis spätestens|frist|kündig|gültig bis|läuft|ablauf|vertragsende|endet|einreich|abgabe|überweis|rückmeldung|widerspruch|abbuchung|lastschrift|son ödeme|son gün|son tarih|kadar|geçerli/iu;
const K_PAY = /zahl|überweis|rechnung|beitrag|mahnung|lastschrift|ödeme|fatura|borç/iu;
const ORG = /praxis|(?<!\p{L})dr\.|med\.|klinik|krankenhaus|zentrum|(?<!\p{L})amt(?!\p{L})|ämter|jobcenter|agentur|tüv|dekra|gmbh|(?<!\p{L})ag(?!\p{L})|e\.\s?v\.|(?<!\p{L})kg(?!\p{L})|versicherung|bank|sparkasse|kanzlei|schule|kita|stadtverwaltung|kreisverwaltung|autohaus|werkstatt|hastane|eczane|belediye|sigorta/iu;
const KIND_WORD = /vertrag|versicherung|abo|tarif|police|sözleşme|sigorta/iu;
const SUBJECT_WORDS = /terminbestätigung|terminerinnerung|einladung|rechnung|mahnung|zahlungserinnerung|bescheid|kündigung|vertragsverlängerung|beitragsrechnung|erinnerung|randevu|fatura|hatırlatma/iu;

// Alle Daten im Text mit Position
function findDates(text, now) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hits = [];
  const add = (index, len, y, m, d, monthOnly = false) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const date = new Date(y, m - 1, d);
    if (date.getMonth() !== m - 1) return;
    hits.push({ index, end: index + len, date, monthOnly });
  };
  const year = (y) => (y == null ? null : y.length === 2 ? 2000 + Number(y) : Number(y));
  const next = (m, d) => { const x = new Date(base.getFullYear(), m - 1, d); return x < base ? base.getFullYear() + 1 : base.getFullYear(); };
  let m;
  const rNum = /(?<![\d.,/])(\d{1,2})\s?[.,/-]\s?(\d{1,2})\s?[.,/-](?:\s?(\d{4})|(\d{2}))(?!\d|[:.]\d)/g;
  while ((m = rNum.exec(text))) add(m.index, m[0].length, year(m[3] ?? m[4]), +m[2], +m[1]);
  const rIso = /(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g;
  while ((m = rIso.exec(text))) add(m.index, m[0].length, +m[1], +m[2], +m[3]);
  const rTxt = new RegExp(`(?<![\\d])(\\d{1,2})\\.?\\s*(${MON})\\.?(?:\\s*(\\d{4}))?(?![\\p{L}])`, "giu");
  while ((m = rTxt.exec(text))) { const mo = monthOf(m[2]); add(m.index, m[0].length, year(m[3]) ?? next(mo, +m[1]), mo, +m[1]); }
  const rMy = new RegExp(`(?<![\\p{L}])(${MON})\\.?\\s+(\\d{4})(?!\\d)`, "giu");
  while ((m = rMy.exec(text))) add(m.index, m[0].length, +m[2], monthOf(m[1]), 1, true);
  // "Fr., 23.10." / "am 23.10." ohne Jahr
  const rShort = new RegExp(`(?:(?:${WD})\\.?,?|am|bis|zum)\\s*(\\d{1,2})\\.(\\d{1,2})\\.(?![\\d])`, "giu");
  while ((m = rShort.exec(text))) { const off = m[0].indexOf(m[1]); add(m.index + off, m[0].length - off, next(+m[2], +m[1]), +m[2], +m[1]); }
  hits.sort((a, b) => a.index - b.index || b.end - a.end);
  const out = [];
  for (const h of hits) if (!out.some((o) => h.index < o.end && h.end > o.index)) out.push(h);
  return out;
}

// Uhrzeiten (ohne Datums- und Geldbeträge)
function findTimes(text, dates) {
  const out = [];
  const free = (a, b) => !dates.some((d) => a < d.end && b > d.index);
  const push = (index, len, h, min) => { if (h <= 23 && min <= 59 && free(index, index + len)) out.push({ index, end: index + len, time: hm(h, min) }); };
  let m;
  const r1 = /(?<![\d.,:])([01]?\d|2[0-3])\s?([:.])\s?([0-5]\d)(?![\d,])(\s*(?:uhr|h(?!\p{L})))?(?!\s*(?:€|eur))/giu;
  while ((m = r1.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (m[2] === "." && !m[4] && !/(?:um|ab|von|bis|saat|zeit:?|uhrzeit:?)\s*$/iu.test(before)) continue;
    push(m.index, m[0].length, +m[1], +m[3]);
  }
  const r2 = /(?<![\d.,:])([01]?\d|2[0-3])\s*uhr(?!\p{L})/giu;
  while ((m = r2.exec(text))) if (!out.some((o) => m.index < o.end && m.index + m[0].length > o.index)) push(m.index, m[0].length, +m[1], 0);
  const r3 = /saat\s*([01]?\d|2[0-3])(?:[:.]([0-5]\d))?(?!\d)/giu;
  while ((m = r3.exec(text))) if (!out.some((o) => m.index < o.end && m.index + m[0].length > o.index)) push(m.index, m[0].length, +m[1], +(m[2] ?? 0));
  for (const x of out) {
    const r = text.slice(x.end).match(/^\s*(?:-|–|bis)\s*([01]?\d|2[0-3])(?:\s?[:.]\s?([0-5]\d))?\s*(?:uhr)?/iu);
    if (r) x.endTime = hm(+r[1], +(r[2] ?? 0));
  }
  return out.sort((a, b) => a.index - b.index);
}

// Betreff, Absender, Ort und Betrag aus dem ganzen Dokument
export function docInfo(text) {
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  let subject = null, m;
  for (const l of lines) if ((m = l.match(/^(?:betreff|betr\.?|konu|re|aw|wg|fwd?)\s*:\s*(.{3,})/iu))) { subject = m[1]; break; }
  if (!subject) subject = lines.find((l) => l.length >= 5 && l.length <= 50 && SUBJECT_WORDS.test(l) && !/\d{1,2}[.,/]\d{1,2}[.,/]\d{2}|[.!?]\s|^sehr geehrte|^hallo|^liebe/iu.test(l)) ?? null;
  let org = null, orgIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const l = lines[i];
    if (l.length >= 3 && l.length <= 60 && ORG.test(l) && !/sehr geehrte|^an\s|^\d{5}/iu.test(l) && (l.match(/\d/g)?.length ?? 0) < 6) { org = l.replace(/[,·|].*$/, "").replace(/^(?:absender|von|from|hastane|klinik|praxis|kimden)\s*:\s*/iu, "").trim(); orgIdx = i; break; }
  }
  let location = null;
  for (const l of lines) if ((m = l.match(/^(?:ort|adresse|anschrift|treffpunkt|raum|adres|yer)\s*:\s*(.{3,})/iu))) { location = m[1]; break; }
  if (!location && orgIdx >= 0) {
    const near = lines.slice(orgIdx, orgIdx + 4).join(" · ");
    const st = near.match(/\p{L}[\p{L}.-]*(?:straße|strasse|str\.|weg|platz|allee|gasse|ring|damm|ufer|cad(?:desi)?\.?|sok(?:ak)?\.?)\s*\d+\s*\p{L}?(?!\p{L})/iu);
    const plz = near.match(/(?<!\d)\d{5}\s+\p{L}[\p{L}-]+(?:\s+\p{L}[\p{L}-]+)?/u);
    if (st && plz) location = `${st[0].trim()}, ${plz[0].trim()}`;
  }
  const amounts = [...text.matchAll(/(?:€\s*(\d{1,3}(?:[.\s]\d{3})*,\d{2}))|(\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*(?:€|eur)/giu)];
  const best = amounts.find((a) => /betrag|summe|gesamt|zahlbetrag|tutar|toplam|offen/iu.test(text.slice(Math.max(0, a.index - 40), a.index))) ?? amounts.at(-1);
  const amount = best ? (best[1] ?? best[2]).replace(/\s/g, "") : null;
  return { subject, org, location, amount };
}

const cleanTitle = (s) => (s ?? "")
  .replace(/(?<![\d])\d{1,2}\s?[.,/-]\s?\d{1,2}\s?[.,/-]\s?\d{2,4}/g, " ")
  .replace(/(?:am|um|bis|vom|ab)\s+(?=\s|$)/giu, " ")
  .replace(/\d{1,2}[:.]\d{2}\s*(?:uhr)?/giu, " ")
  .replace(/\s+/g, " ").replace(/^[\s:–-]+|[\s:,.–-]+$/g, "").slice(0, 60).trim();

// Kandidaten aus freiem Text (Brief, E-Mail, OCR)
export function extractFromText(text, now = new Date()) {
  text = String(text ?? "").replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const today = iso(now);
  const dates = findDates(text, now);
  const times = findTimes(text, dates);
  const info = docInfo(text);
  const lineStart = (i) => text.lastIndexOf("\n", i - 1) + 1;
  const lineEnd = (i) => { const e = text.indexOf("\n", i); return e < 0 ? text.length : e; };
  const out = [];
  for (const d of dates) {
    const ls = lineStart(d.index), le = lineEnd(d.end);
    const line = text.slice(ls, le);
    const prevLs = ls > 0 ? lineStart(ls - 1) : ls;
    const prev = text.slice(prevLs, Math.max(prevLs, ls - 1));
    const nextLe = le < text.length ? lineEnd(le + 1) : le;
    const next2Le = nextLe < text.length ? lineEnd(nextLe + 1) : nextLe;
    const next = text.slice(Math.min(le + 1, nextLe), nextLe);
    let before = text.slice(ls, d.index);
    if (!before.trim()) before = prev;
    const kwLine = line + " " + (before === prev ? prev : "");
    const isT = K_TERMIN.test(kwLine), isF = K_FRIST.test(kwLine);
    if (IGN.test(before.slice(-40)) && !isT && !isF) continue;
    const ds = iso(d.date);
    if (ds < today) continue;
    const kind = isF || !isT ? deadlineKind(line + " " + prev) : null;
    const maxYears = kind && ["ausweis", "pass", "fuehrerschein"].includes(kind) ? 16 : 6;
    if (d.date.getFullYear() > now.getFullYear() + maxYears) continue;
    // Uhrzeit: gleiche Zeile (nach dem Datum zuerst), dann nächste, dann vorige Zeile
    const inRange = (a, b) => times.filter((x) => x.index >= a && x.end <= b);
    const same = inRange(ls, le);
    const tm = d.monthOnly ? null : same.find((x) => x.index > d.index) ?? same[0] ?? inRange(le, next2Le)[0] ?? (before === prev ? null : inRange(prevLs, ls)[0]) ?? null;
    let score = 1 + (tm ? 3 : 0) + (isT ? 3 : K_TERMIN.test(prev + " " + next) ? 1 : 0) + (isF ? 3 : K_FRIST.test(prev + " " + next) ? 1 : 0);
    const type = tm || (isT && !isF) ? "termin" : kind && kind !== "sonstiges" ? "frist" : "aufgabe";
    const ctx = `${prev} ${line}`;
    let title;
    const generic = !info.subject || /^(?:ihre?\s+)?(?:termin|randevu)\p{L}*(?:\s+(?:bilgisi|info\p{L}*|details?))?$|^erinnerung$|^einladung$/iu.test(cleanTitle(info.subject));
    if (type === "termin") title = !generic ? cleanTitle(info.subject) : info.org ? `Termin ${info.org}` : info.location ? `Termin ${info.location.split(",")[0]}` : "Termin";
    else if (type === "frist") {
      const subj = cleanTitle(info.subject ?? "").replace(/^(?:ihre?|unsere?)\s+/iu, "");
      const org = info.org?.replace(/\s+(?:gmbh|ag|kg|se|e\.\s?v\.)(?:\s.*)?$/iu, "").trim();
      title = kind === "vertrag" || kind === "versicherung"
        ? subj && subj.length <= 40 && KIND_WORD.test(subj) ? `${subj}${org ? ` ${org}` : ""}` : org || KINDS[kind].label
        : KINDS[kind].label;
    }
    else if (K_PAY.test(ctx) || K_PAY.test(info.subject ?? "")) title = `Rechnung bezahlen${info.org ? `: ${info.org}` : ""}${info.amount ? ` (${info.amount} €)` : ""}`;
    else if (/kündig|fesih/iu.test(ctx)) title = `Kündigen${info.org ? `: ${info.org}` : ""}`;
    else title = cleanTitle(info.subject) || (info.org ? `Frist ${info.org}` : "Frist aus Dokument");
    const note = [line.trim().slice(0, 160), info.amount && type !== "termin" ? `Betrag: ${info.amount} €` : null].filter(Boolean).join("\n");
    const nm = type === "frist" && text.match(/(?:kündigungsfrist|fesih süresi)\D{0,25}?(\d{1,2})\s*(?:monat|ay)|(\d{1,2})\s*monat\p{L}*\s*(?:zum|vor|kündigungsfrist)/iu);
    out.push({
      type, title, notice: nm ? Number(nm[1] ?? nm[2]) : null, date: ds, time: tm?.time ?? null, end: tm?.endTime ?? null,
      location: type === "termin" ? info.location : null, kind: type === "frist" ? kind : null,
      notes: note, line: line.trim(), score, monthOnly: d.monthOnly,
    });
  }
  // Gleiches Datum nur einmal, das stärkste behalten
  const best = new Map();
  for (const c of out) { const k = `${c.date}|${c.time ?? ""}`; if (!best.has(k) || best.get(k).score < c.score) best.set(k, c); }
  let list = [...best.values()];
  const strong = list.filter((c) => c.score >= 2);
  list = (strong.length ? strong : list).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, 6);
  const top = list[0]?.score ?? 0;
  list.forEach((c) => (c.checked = c.score >= 4 || (c.score === top && top >= 2)));
  return { items: list, info };
}

// Kalenderdatei (.ics)
export function parseIcs(text, now = new Date()) {
  const un = String(text).replace(/\r?\n[ \t]/g, "");
  const unesc = (s) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
  const when = (v) => {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
    if (!m) return null;
    if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
    const d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return { date: iso(d), time: hm(d.getHours(), d.getMinutes()) };
  };
  const items = un.split(/BEGIN:VEVENT/).slice(1).map((b) => {
    b = b.split(/END:VEVENT/)[0];
    const get = (k) => b.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, "mi"))?.[1]?.trim() ?? null;
    const st = get("DTSTART") && when(get("DTSTART"));
    if (!st) return null;
    const en = get("DTEND") && when(get("DTEND"));
    return { type: "termin", title: unesc(get("SUMMARY") ?? "Termin").slice(0, 80), date: st.date, time: st.time, end: en && en.date === st.date ? en.time : null,
      location: get("LOCATION") ? unesc(get("LOCATION")) : null, notes: get("DESCRIPTION") ? unesc(get("DESCRIPTION")).slice(0, 300) : null, score: 9, checked: true, kind: null };
  }).filter((x) => x && x.date >= iso(now));
  return { items: items.slice(0, 20), info: {} };
}

// ---------- Text holen: PDF, Foto, Kalender, Text ----------
let pdfjs = null, tessLoad = null;
function loadTesseract() {
  return (tessLoad ??= new Promise((res, rej) => {
    if (window.Tesseract) return res(window.Tesseract);
    const s = document.createElement("script");
    s.src = TESS + "tesseract.min.js";
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { tessLoad = null; s.remove(); rej(new Error("ocr-load")); };
    document.head.append(s);
  }));
}
async function ocr(images, lang, progress) {
  progress(0, "load");
  const T = await loadTesseract();
  const worker = await T.createWorker(lang === "tr" ? ["tur", "deu"] : ["deu"], 1, {
    workerPath: TESS + "worker.min.js", corePath: TESS_CORE,
    logger: (m) => { if (m.status === "recognizing text") progress(m.progress, "read"); },
  });
  try {
    let out = "";
    for (let i = 0; i < images.length; i++) {
      const r = await worker.recognize(images[i]);
      out += r.data.text + "\n";
    }
    return out;
  } finally { worker.terminate(); }
}
async function imageCanvas(file) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height;
  const k = Math.min(2, 2200 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function pdfText(file, lang, progress) {
  progress(0, "pdf");
  if (!pdfjs) {
    pdfjs = await import(PDFJS + "pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const n = Math.min(doc.numPages, 6);
  let out = "";
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("").replace(/ +/g, " ") + "\n";
  }
  if (out.replace(/\s/g, "").length >= 40) return out;
  // Gescanntes PDF ohne Text: Seiten als Bild erkennen
  const imgs = [];
  for (let i = 1; i <= Math.min(n, 2); i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    imgs.push(c);
  }
  return ocr(imgs, lang, progress);
}

export async function readFile(file, lang, progress = () => {}) {
  const name = (file.name ?? "").toLowerCase(), type = file.type ?? "";
  if (type === "text/calendar" || name.endsWith(".ics")) return { ics: true, text: await file.text() };
  if (type === "application/pdf" || name.endsWith(".pdf")) return { text: await pdfText(file, lang, progress) };
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".eml")) return { text: await file.text() };
  return { text: await ocr([await imageCanvas(file)], lang, progress) };
}

// ---------- Oberfläche ----------
const ICON_CAM = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
const ICON_FILE = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>`;

export function createImport(ctx) {
  const { db, t, esc, toast, openSheet, closeSheet, sheet, form, fmtDay, enhancePickers, today, deadlines, lang } = ctx;
  const TYPES = [["termin", "Termin"], ["aufgabe", "Aufgabe"], ["frist", "Frist"]];
  let found = [], rawText = "", busy = false;

  function open() {
    form.innerHTML = `<h3>${t("Aus Dokument übernehmen")}</h3>
      <input type="file" id="imp-cam" accept="image/*" capture="environment" hidden>
      <input type="file" id="imp-file" accept="image/*,application/pdf,.pdf,.ics,text/calendar,text/plain,.txt" hidden>
      <button type="button" class="primary imp-btn" id="imp-cam-btn">${ICON_CAM}<span>${t("Brief fotografieren")}</span></button>
      <button type="button" class="btn imp-btn" id="imp-file-btn">${ICON_FILE}<span>${t("Foto, PDF oder Kalenderdatei wählen")}</span></button>
      <button type="button" class="ghost" id="imp-text-btn">${t("Text einfügen")}</button>
      <div id="imp-out"></div>`;
    form.onsubmit = (e) => e.preventDefault();
    const cam = form.querySelector("#imp-cam"), file = form.querySelector("#imp-file");
    form.querySelector("#imp-cam-btn").onclick = () => cam.click();
    form.querySelector("#imp-file-btn").onclick = () => file.click();
    cam.onchange = file.onchange = (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handleFile(f); };
    form.querySelector("#imp-text-btn").onclick = showPaste;
    openSheet(sheet);
  }

  const out = () => form.querySelector("#imp-out");
  function progress(p, phase) {
    const el = out();
    if (!el) return;
    const label = phase === "load" ? t("Texterkennung wird geladen …") : phase === "pdf" ? t("PDF wird gelesen …") : t("Text wird erkannt … {n} %", { n: Math.round((p ?? 0) * 100) });
    el.innerHTML = `<div class="imp-prog"><span class="small muted">${label}</span><div class="bar"><div style="width:${phase === "read" ? Math.round((p ?? 0) * 100) : 8}%"></div></div></div>`;
  }

  function showPaste() {
    out().innerHTML = `<textarea id="imp-text" rows="6" placeholder="${t("E-Mail oder Brieftext hier einfügen")}"></textarea>
      <button type="button" class="primary" id="imp-run">${t("Auswerten")}</button>`;
    out().querySelector("#imp-run").onclick = () => {
      const v = out().querySelector("#imp-text").value;
      if (v.trim()) analyse(v);
    };
  }

  async function handleFile(f) {
    if (busy) return;
    busy = true;
    try {
      const r = await readFile(f, lang(), progress);
      if (r.ics) { rawText = ""; found = parseIcs(r.text).items; return renderResults({}); }
      analyse(r.text);
    } catch (e) {
      console.warn(e);
      out().innerHTML = "";
      toast(t(navigator.onLine ? "Datei konnte nicht gelesen werden" : "Texterkennung braucht beim ersten Mal Internet"));
    } finally { busy = false; }
  }

  function analyse(text) {
    rawText = text;
    const r = extractFromText(text);
    found = r.items;
    renderResults(r.info);
  }

  function renderResults(info) {
    const el = out();
    if (!el) return;
    const raw = rawText.trim() ? `<details class="imp-raw"><summary>${t("Erkannter Text")}</summary><pre>${esc(rawText.trim().slice(0, 4000))}</pre></details>` : "";
    if (!found.length) {
      el.innerHTML = `<div class="empty">${t("Kein Datum erkannt.")}</div>
        <button type="button" class="primary" id="imp-manual">${t("Selbst anlegen")}</button>${raw}`;
      el.querySelector("#imp-manual").onclick = () => { sheet.close(); ctx.openItemSheet({}, { title: info.subject ?? info.org ?? "", notes: rawText.trim().slice(0, 300) || null }); };
      return;
    }
    el.innerHTML = `<p class="eyebrow" style="margin-top:14px">${t(found.length === 1 ? "1 Eintrag gefunden" : "{n} Einträge gefunden", { n: found.length })}</p>
      ${found.map((c, i) => `<div class="card imp-row ${c.checked ? "" : "off"}" data-i="${i}">
        <label class="imp-check"><input type="checkbox" data-on ${c.checked ? "checked" : ""}><span>${esc(c.line || c.title)}</span></label>
        <div class="seg imp-type">${TYPES.map(([k, l]) => `<button type="button" data-type="${k}" class="${c.type === k ? "on" : ""}">${t(l)}</button>`).join("")}</div>
        <input name="imp-title-${i}" value="${esc(c.title)}" placeholder="${t("Was?")}">
        <div class="row"><div><input type="date" name="imp-date-${i}" value="${c.date}"></div><div class="imp-time" ${c.type === "termin" ? "" : "hidden"}><input type="time" name="imp-time-${i}" value="${c.time ?? ""}"></div></div>
        ${c.location ? `<span class="small muted">${esc(c.location)}</span>` : ""}
      </div>`).join("")}
      <button type="button" class="primary" id="imp-save"></button>${raw}`;
    enhancePickers(el);
    const count = () => {
      const n = found.filter((c) => c.checked).length;
      const b = el.querySelector("#imp-save");
      b.textContent = n === 1 ? t("1 Eintrag übernehmen") : t("{n} Einträge übernehmen", { n });
      b.disabled = !n;
    };
    el.querySelectorAll(".imp-row").forEach((row) => {
      const c = found[Number(row.dataset.i)];
      row.querySelector("[data-on]").onchange = (e) => { c.checked = e.target.checked; row.classList.toggle("off", !c.checked); count(); };
      row.querySelectorAll("[data-type]").forEach((b) => (b.onclick = () => {
        c.type = b.dataset.type;
        row.querySelectorAll("[data-type]").forEach((x) => x.classList.toggle("on", x === b));
        row.querySelector(".imp-time").hidden = c.type !== "termin";
      }));
    });
    count();
    el.querySelector("#imp-save").onclick = save;
  }

  async function save() {
    const val = (n) => form.querySelector(`[name="${n}"]`)?.value ?? "";
    let n = 0;
    for (let i = 0; i < found.length; i++) {
      const c = found[i];
      if (!c.checked) continue;
      const title = val(`imp-title-${i}`).trim() || c.title, date = val(`imp-date-${i}`) || c.date;
      if (!date) continue;
      if (c.type === "frist") {
        const kind = c.kind ?? deadlineKind(title) ?? "sonstiges";
        const r = await deadlines.runVoice({ kind, title, due: date, notice: c.notice ?? null });
        if (r?.msg && !r.undo) { toast(r.msg); continue; }
      } else {
        const time = c.type === "termin" ? val(`imp-time-${i}`) || null : null;
        const row = { kind: c.type, title, on_date: date, start_time: time, end_time: time && c.end && c.end > time ? c.end : null,
          location: c.type === "termin" ? c.location ?? null : null, notes: c.notes || null, remind_before: c.type === "termin" && time ? 60 : null,
          priority: "normal", checklist: [], repeat: null };
        const { error } = await db.from("items").insert(row);
        if (error) { toast(error.message); continue; }
      }
      n++;
    }
    closeSheet(sheet);
    if (n) toast(n === 1 ? t("1 Eintrag übernommen") : t("{n} Einträge übernommen", { n }));
    ctx.onChange();
  }

  return { open };
}
