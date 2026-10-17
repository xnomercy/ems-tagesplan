import { parse, isoDate } from "./parser.js";
import { parseTr } from "./parser-tr.js";
import { parseIntent, extractPrio, extractRepeat } from "./intents.js";
import { t, LANG, LOCALE, setLang, translateStatic } from "./i18n.js";
import { createTraining } from "./training.js";
import { createShopping, STORES } from "./einkauf.js";
import { withOffline } from "./offline.js";
import { createDayLog } from "./daylog.js";
import { createScanner } from "./halal-scan.js";
import { createGlaube, ramadanActive, ramadanShift } from "./glaube.js";
import { createZikir } from "./zikir.js";
import { createKoran } from "./koran.js";
import { createWellness, sleepOffset } from "./wellness.js";
import { createDeadlines } from "./fristen.js";
import { createReview } from "./rueckblick.js";
import { createImport } from "./dokument.js";

const SUPABASE_URL = "https://hpxdhtuabzqwyslzcmbt.supabase.co";
const SUPABASE_KEY = "sb_publishable_kKiQdntJd893YvBPFx7fhw_FYzlwwtz";
const DEMO = new URLSearchParams(location.search).has("demo");
// Bei jeder Veröffentlichung zusammen mit version.json und dem Cache-Namen in sw.js hochzählen
const APP_VERSION = "31";
const rawDb = DEMO
  ? (await import("./mock.js")).db
  : (await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm").catch((e) => {
    // Ohne Netz und ohne gespeicherte Bibliothek: Hinweis statt weißem Bildschirm
    document.body.insertAdjacentHTML("beforeend", `<p style="padding:40px 24px;text-align:center">${t("Keine Verbindung. Öffne die App einmal mit Internet, danach geht sie auch offline.")}</p>`);
    throw e;
  })).createClient(SUPABASE_URL, SUPABASE_KEY);
// Ohne Netz: Änderungen warten in einer Schlange und gehen raus, sobald wieder Netz da ist
const db = withOffline(rawDb, { onChange: (n, res) => onOutbox(n, res) });

// Platz unter dem Inhalt so groß wie die untere Leiste samt Sprachknopf, gemessen ab Bildschirmunterkante.
// iOS-Safari setzt fixierte Leisten teils über seine eigene Werkzeugleiste, dann reicht ein fester Wert nicht.
function measureNavSpace() {
  const tabs = document.querySelector(".tabs");
  if (!tabs || !tabs.offsetHeight) return;
  const fab = document.getElementById("mic");
  const top = Math.min(tabs.getBoundingClientRect().top, fab ? fab.getBoundingClientRect().top : Infinity);
  const bottom = Math.max(window.innerHeight, document.documentElement.clientHeight);
  const space = Math.round(bottom - top);
  if (space > 0 && space < bottom / 2 && space !== measureNavSpace.last) {
    measureNavSpace.last = space;
    document.documentElement.style.setProperty("--nav-space", space + "px");
  }
}
if (window.ResizeObserver) { const t = document.querySelector(".tabs"); if (t) new ResizeObserver(measureNavSpace).observe(t); }
addEventListener("resize", measureNavSpace);
window.visualViewport?.addEventListener("resize", measureNavSpace);
addEventListener("scroll", () => requestAnimationFrame(measureNavSpace), { passive: true });

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = (t) => (t ? t.slice(0, 5) : "");
const weekday = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = Montag
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDay = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) => new Date(iso + "T00:00").toLocaleDateString(LOCALE(), opts);
const DAY_KEYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_SHORT = new Proxy([], { get: (_, k) => (k === "map" ? (fn) => DAY_KEYS.map((d, i) => fn(t(d), i)) : k in DAY_KEYS && /^\d+$/.test(k) ? t(DAY_KEYS[k]) : DAY_KEYS[k]) });
const L = (obj) => new Proxy(obj, { get: (o, k) => (typeof o[k] === "string" ? t(o[k]) : o[k]) });
const CATEGORIES = L({ gebet: "Gebet", lesen: "Lesen", training: "Training", supps: "Supplements", pflege: "Pflege", essen: "Essen", schlaf: "Schlaf", sonstiges: "Sonstiges" });
const AREAS = L({ arbeit: "Arbeit", privat: "Privat", gesundheit: "Gesundheit", familie: "Familie", finanzen: "Finanzen", haushalt: "Haushalt" });
const VAPID_PUBLIC = "BNV7U2HOxe9fvDt3Ni1eyeGrlVFLT5stsCgcKnU3pF9Ajqu5OWhv0b6qoLrtdcpFtH3J_3gK9CMu4uFbiAbKCk8";
const PRAYER_API = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
const REPEATS = { taeglich: "Täglich", woechentlich: "Wöchentlich", monatlich: "Monatlich", jaehrlich: "Jährlich" };
// Supplement-Stack zum schnellen Anlegen im Vorrat
const STACK = ["Vitamin D3+K2", "Schwarzkümmelöl", "Liposomales Vitamin C", "Vitamin B12", "Lion's Mane", "OPC", "Bor", "Chlorella", "Gerstengras", "Magnesium Komplex", "Ashwagandha"];
const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const state = { user: null, day: new Date(), routines: [], settings: null, entries: [], open: [], view: "heute" };

// Startpaket, passend zum bisherigen Wochenplan
const DEFAULT_ROUTINES = [
  { title: "Fajr", category: "gebet", prayer: "fajr" },
  { title: "Dhuhr", category: "gebet", prayer: "dhuhr" },
  { title: "Asr", category: "gebet", prayer: "asr" },
  { title: "Maghrib", category: "gebet", prayer: "maghrib" },
  { title: "Isha", category: "gebet", prayer: "isha" },
  { title: "Wall Angels 2×10", category: "training", at_time: "07:30" },
  { title: "Morgenpflege", category: "pflege", at_time: "07:40", notes: "Gesicht waschen, Urea-Cica-Creme oder Nivea Soft, SPF falls vorhanden" },
  { title: "Frühstück + Morgen-Supps", category: "supps", at_time: "07:50", notes: "D3+K2, Schwarzkümmelöl, liposomales Vitamin C, B12, Lion's Mane, OPC, Bor. Zum Essen." },
  { title: "Mittagessen + Mittag-Supps", category: "supps", anchor_prayer: "dhuhr", anchor_offset: 15, notes: "Chlorella + Gerstengras, getrennt von Mineralien" },
  { title: "Krafttraining + 10 Min Stepper", category: "training", days: [1, 3, 5], notes: "Zeit frei wählbar, z. B. nach Asr" },
  { title: "Einkauf für Meal-Prep", category: "essen", days: [6], notes: "Halal-Fleisch beim türkischen Markt, Rest Rewe/Lidl" },
  { title: "Meal-Prep", category: "essen", anchor_prayer: "dhuhr", anchor_offset: 30, days: [7] },
  { title: "Abendessen kochen", category: "essen", at_time: "17:30", days: [2, 4] },
  { title: "Scalp-Öl-Massage", category: "pflege", at_time: "20:30", days: [1, 4], notes: "½ TL Jojoba + ½ TL Mandel + ¼ TL Rizinus + 3 Tropfen Rosmarin. 30-60 Min einwirken, 2x shampoonieren." },
  { title: "Abendpflege", category: "pflege", at_time: "20:45", notes: "Reinigen, Creme + Öl" },
  { title: "Retinol", category: "pflege", at_time: "20:50", days: [1, 3, 6], notes: "Nicht am selben Abend wie Säure oder Stamping" },
  { title: "Pore Pad + Maske", category: "pflege", at_time: "20:50", days: [4, 7] },
  { title: "Dermastamping Bart (0,5 mm)", category: "pflege", at_time: "21:00", days: [2, 5] },
  { title: "Buch lesen (20 Min)", category: "lesen", at_time: "21:10" },
  { title: "Trockene Kopfhautmassage", category: "pflege", at_time: "21:30" },
  { title: "Abend-Supps", category: "supps", at_time: "21:55", notes: "Magnesium + Ashwagandha, 30-60 Min vor dem Schlafen" },
];

// ---------- Anmeldung ----------
async function boot() {
  const { data } = await db.auth.getSession();
  db.auth.onAuthStateChange((_e, session) => {
    const had = !!state.user;
    state.user = session?.user ?? null;
    if (!!state.user !== had) showScreen();
  });
  state.user = data.session?.user ?? null;
  showScreen();
  if ("serviceWorker" in navigator && !DEMO) {
    const first = !navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(() => {});
    // Beim allerersten Öffnen lief Supabase & Co. noch am Service Worker vorbei: einmal nachladen, damit sie offline da sind
    if (first) navigator.serviceWorker.addEventListener("controllerchange", () => {
      for (const r of performance.getEntriesByType("resource")) {
        if (/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//.test(r.name)) fetch(r.name, { mode: r.name.includes("jsdelivr") ? "cors" : "no-cors" }).catch(() => {});
      }
    }, { once: true });
  }
}

async function showScreen() {
  $("#login").hidden = !!state.user;
  $("#app").hidden = !state.user;
  if (state.user) {
    await ensureSetup();
    await refresh();
    training.load().then(() => render());
  }
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-msg").textContent = t("Melde an …");
  const { error } = await db.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
  $("#login-msg").textContent = error ? loginError(error) : "";
});

function loginError(err) {
  const m = err.message || "";
  if (/invalid login/i.test(m)) return t("E-Mail oder Passwort stimmt nicht.");
  if (/not confirmed/i.test(m)) return t("Bitte zuerst den Link in der Bestätigungsmail anklicken.");
  if (/database error|not allowed/i.test(m)) return t("Diese E-Mail darf hier kein Konto anlegen.");
  return m;
}

async function ensureSetup() {
  const { data: settings } = await db.from("settings").select("*").maybeSingle();
  if (settings) {
    state.settings = settings;
    // Sprache auch am Server merken, damit Mitteilungen passend kommen
    if (settings.lang !== LANG) db.from("settings").update({ lang: LANG }).eq("user_id", settings.user_id).then(() => {});
    return;
  }
  const { data: created } = await db.from("settings").insert({}).select().single();
  state.settings = created;
  const { count } = await db.from("routines").select("id", { count: "exact", head: true });
  // Alle Zeilen brauchen dieselben Spalten, sonst landen fehlende als NULL statt Standardwert
  if (!count) await db.from("routines").insert(DEFAULT_ROUTINES.map((r) => ({
    prayer: null, at_time: null, anchor_prayer: null, anchor_offset: 15, notes: null, days: [1, 2, 3, 4, 5, 6, 7], ...r,
  })));
}

// ---------- Daten ----------
async function prayerTimes(date) {
  const s = state.settings;
  if (DEMO) return { Imsak: "05:48", Fajr: "05:58", Dhuhr: "13:21", Asr: "16:19", Maghrib: "18:41", Isha: "20:13", HijriMonth: new URLSearchParams(location.search).has("ramadan") ? 9 : 4, HijriDay: 12 };
  if (!s || s.lat == null) return null;
  const key = `pt2:${isoDate(date)}:${s.lat.toFixed(2)}:${s.lng.toFixed(2)}:${s.prayer_method}`;
  try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c?.Fajr) return c; } catch {}
  try {
    const d = `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
    const res = await fetch(`https://api.aladhan.com/v1/timings/${d}?latitude=${s.lat}&longitude=${s.lng}&method=${s.prayer_method}`);
    const j = res.ok ? (await res.json()).data : null;
    // Fehlerantworten nicht speichern, sonst bleibt der Tag ohne Zeiten
    if (!j?.timings?.Fajr) return null;
    // Hidschri-Monat mitmerken: 9 = Ramadan
    const tm = { ...j.timings, HijriMonth: j.date?.hijri?.month?.number ?? null, HijriDay: Number(j.date?.hijri?.day) || null };
    try { localStorage.setItem(key, JSON.stringify(tm)); } catch {}
    return tm;
  } catch { return null; }
}

// Wiederkehrende Termine und Aufgaben: nächste Folge anlegen (macht die Datenbank auch stündlich)
let lastAdvance = 0;
async function advanceSeries(force = false) {
  if (!force && Date.now() - lastAdvance < 10 * 60 * 1000) return;
  lastAdvance = Date.now();
  await db.rpc("advance_series");
}

async function refresh() {
  // Einkaufsliste einmal im Hintergrund laden (für den Hinweis am Einkaufstag und die Sprachbefehle)
  if (!state.shopLoading) state.shopLoading = shopping.load().then(() => { state.shopLoaded = true; autoSupplies(); if (state.view === "heute" && state.entries) renderDay(); });
  if (!state.glaubeLoading) state.glaubeLoading = glaube.load();
  if (!state.dlLoading) state.dlLoading = deadlines.load().then(updateNav);
  const day = isoDate(state.day);
  const today = isoDate(new Date());
  await advanceSeries();
  const [r, c, i, pt, open, sup] = await Promise.all([
    db.from("routines").select("*").order("at_time", { nullsFirst: false }),
    db.from("completions").select("routine_id").eq("on_date", day),
    db.from("items").select("*").eq("on_date", day).order("start_time", { nullsFirst: false }),
    prayerTimes(state.day),
    // Offene Aufgaben mit Frist: überfällige und die der nächsten 14 Tage
    db.from("items").select("*").eq("kind", "aufgabe").eq("done", false)
      .gte("on_date", isoDate(addDays(new Date(), -60))).lte("on_date", isoDate(addDays(new Date(), 14))).order("on_date"),
    db.from("supplies").select("*").order("name"),
    daylog.load(day, day),
    state.glaubeLoading,
  ]);
  if (r.error) { toast(t("Laden fehlgeschlagen: {x}", { x: r.error.message })); return; }
  state.routines = r.data;
  state.pt = pt;
  state.supplies = sup.data ?? [];
  const done = new Set((c.data ?? []).map((x) => x.routine_id));
  const wd = weekday(state.day);
  // Im Ramadan rutschen Supplements, Training und Mahlzeiten aus der Fastenzeit
  const fasting = ramadanActive(state.settings, pt);

  const entries = [];
  for (const rt of state.routines) {
    if (!rt.active || !rt.days.includes(wd)) continue;
    let time = routineTime(rt, pt), moved = null;
    const shifted = fasting ? ramadanShift(rt, time, pt) : null;
    if (shifted) { moved = time; time = shifted; }
    entries.push({ kind: "routine", id: rt.id, title: rt.title, time, moved, done: done.has(rt.id), category: rt.category, notes: rt.notes, prayer: rt.prayer, priority: rt.priority, raw: rt });
  }
  for (const it of i.data ?? []) {
    entries.push({ kind: it.kind, id: it.id, title: it.title, time: hhmm(it.start_time) || null, end: hhmm(it.end_time), done: it.done, notes: it.notes, raw: it, on_date: it.on_date, priority: it.priority, location: it.location });
  }
  entries.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  state.entries = entries;
  state.open = day === today
    ? (open.data ?? []).filter((x) => x.on_date !== day).map((it) => ({ kind: "aufgabe", id: it.id, title: it.title, time: hhmm(it.start_time) || null, done: false, notes: it.notes, raw: it, on_date: it.on_date, priority: it.priority, location: it.location }))
    : [];
  render();
  ensureSleepRoutine();
  if (state.shopLoaded) autoSupplies();
}

// Uhrzeit einer Routine: Gebetszeit, an ein Gebet gekoppelt oder fest
const PRAYER_NAMES = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
function routineTime(rt, pt) {
  if (rt.prayer) return pt?.[PRAYER_API[rt.prayer]]?.slice(0, 5) ?? null;
  if (rt.anchor_prayer) {
    if (!pt?.[PRAYER_API[rt.anchor_prayer]]) return null;
    const [h, m] = pt[PRAYER_API[rt.anchor_prayer]].slice(0, 5).split(":").map(Number);
    const off = rt.anchor_offset ?? 15;
    let t = h * 60 + m + off;
    if (off < 0) {
      // Vor dem Gebet, z. B. Schlafenszeit vor Fajr: am Vorabend, aber nicht vor Isha
      t = ((t % 1440) + 1440) % 1440;
      const [ih, im] = (pt.Isha ?? "00:00").slice(0, 5).split(":").map(Number);
      if (pt.Isha && t >= 720 && t < ih * 60 + im + 20) t = ih * 60 + im + 20;
    } else t = Math.min(t, 23 * 60 + 59);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }
  return hhmm(rt.at_time) || null;
}
const routineWhen = (r) => r.prayer ? t("auto") : r.anchor_prayer ? `${PRAYER_NAMES[r.anchor_prayer]} ${r.anchor_offset < 0 ? "−" + Math.abs(r.anchor_offset) : "+" + r.anchor_offset}` : hhmm(r.at_time) || "–";

// ---------- Anzeige ----------
function render() {
  const h = new Date().getHours();
  $("#greeting").textContent = t(h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : "Guten Abend") + ", Enes";
  $("#today-date").textContent = new Date().toLocaleDateString(LOCALE(), { weekday: "long", day: "numeric", month: "long" });
  // Kopf: am Tag die Begrüßung, sonst der Seitenname
  if (state.view !== "heute") $("#greeting").textContent = t(PAGES[state.view]?.label ?? "");
  ({ heute: renderDay, plan: renderPlan, termine: renderTermine, mehr: renderMehr, vorrat: renderVorrat,
    training: () => training.render($("#view-training")), einkauf: () => shopping.render($("#view-einkauf")),
    glaube: () => glaube.render($("#view-glaube")), zikir: () => zikir.render($("#view-zikir")), koran: () => koran.render($("#view-koran")), fristen: () => deadlines.load().then(() => deadlines.render($("#view-fristen"))),
    rueckblick: () => review.render($("#view-rueckblick")) })[state.view]();
  updateNav();
}

function itemHtml(e, { next = false, showTime = false } = {}) {
  const label = e.kind === "termin" ? t("Termin") : e.kind === "aufgabe" ? t("Aufgabe") : CATEGORIES[e.category] ?? "";
  const today = isoDate(new Date());
  let badge = "";
  if (e.kind === "aufgabe" && !e.done && e.on_date && e.on_date !== isoDate(state.day)) {
    badge = e.on_date < today ? `<span class="badge late">${t("überfällig")}</span>` : `<span class="badge">${t("bis {d}", { d: fmtDay(e.on_date, { weekday: "short" }) })}</span>`;
  }
  if (e.priority === "hoch") badge += `<span class="badge prio">${t("Wichtig")}</span>`;
  if (e.moved) badge += `<span class="badge">${t("Ramadan, sonst {t}", { t: e.moved })}</span>`;
  if (e.kind !== "routine" && e.raw?.repeat) badge += `<span class="badge">↻ ${t(REPEATS[e.raw.repeat])}</span>`;
  const cl = e.raw?.checklist ?? [];
  if (e.kind !== "routine" && cl.length) badge += `<span class="badge">${cl.filter((c) => c.d).length}/${cl.length}</span>`;
  const areaLabel = e.kind !== "routine" && e.raw?.area ? " · " + (AREAS[e.raw.area] ?? e.raw.area) : "";
  const end = e.end ? t(" bis {t}", { t: e.end }) : "";
  return `<div class="card-item ${e.kind} ${e.done ? "done" : ""} ${next ? "next" : ""}" data-detail="${e.id}" data-swipe="${e.kind}:${e.id}" role="button" tabindex="0">
    <div class="body">
      <div class="cat"><i></i>${label}${areaLabel}${showTime && e.time ? " · " + e.time : ""}${end} ${badge}</div>
      <div class="title">${esc(e.title)}</div>
      ${e.location ? `<div class="notes">${esc(e.location)}</div>` : ""}
      ${e.notes ? `<div class="notes clamp">${esc(e.notes)}</div>` : ""}
    </div>
    <button class="check ${e.done ? "on" : ""}" data-toggle="${e.kind}:${e.id}" aria-label="${t(e.done ? "Nicht erledigt" : "Erledigt")}">${e.done ? CHECK_SVG : ""}</button>
  </div>`;
}

function dayStrip() {
  const sel = isoDate(state.day), today = isoDate(new Date());
  const start = addDays(new Date(), -3);
  let html = `<div class="days" id="days">`;
  for (let k = 0; k < 17; k++) {
    const d = addDays(start, k), iso = isoDate(d);
    html += `<button class="day ${iso === sel ? "sel" : ""} ${iso === today ? "today" : ""}" data-day="${iso}">
      <b>${d.getDate()}</b><span>${DAY_SHORT[weekday(d) - 1]}</span></button>`;
  }
  return html + `</div>`;
}

function renderDay() {
  const isToday = isoDate(new Date()) === isoDate(state.day);
  const total = state.entries.length, done = state.entries.filter((e) => e.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const nowT = new Date().toTimeString().slice(0, 5);
  const timed = state.entries.filter((e) => e.time);
  const untimed = state.entries.filter((e) => !e.time);
  const next = isToday ? timed.find((e) => !e.done && e.time >= nowT) : null;

  let html = `<section class="hero">
    ${isToday ? "" : `<button class="to-today" data-day="${isoDate(new Date())}">${t("Zu heute")}</button>`}
    <p class="eyebrow">${isToday ? t("Dein Tag") : fmtDay(isoDate(state.day), { weekday: "long" })}</p>
    <h2>${total ? (done === total ? t("Alles erledigt.") : total - done === 1 ? t("1 Punkt offen") : t("{n} Punkte offen", { n: total - done })) : t("Noch nichts geplant")}</h2>
    <div class="next">${next ? t("Als Nächstes: {x} um {t}", { x: esc(next.title), t: next.time }) : isToday && total && done < total ? t("Für heute keine Uhrzeiten mehr offen.") : ""}</div>
    <div class="bar"><div style="width:${pct}%"></div></div>
    <div class="meta"><span>${t("Fortschritt")}</span><span>${done} / ${total} · ${pct}%</span></div>
  </section>`;
  html += dayStrip();
  if (isToday) {
    if (db.pending()) html += `<div class="hint">${t("Offline: {n} Änderungen warten aufs Netz", { n: db.pending() })}</div>`;
    html += glaube.dayCard();
    html += zikir.dayCard();
    html += wellness.waterCard();
    html += glaube.dayHint();
    html += wellness.sleepHint();
    // Sonntag ab Mittag und Montagvormittag: Wochenrückblick anbieten
    const h = new Date().getHours(), wdT = weekday(new Date());
    if ((wdT === 7 && h >= 12) || (wdT === 1 && h < 12)) html += `<div class="hint">${t("Dein Wochenrückblick ist da")} <button data-goto="rueckblick">${t("Ansehen")}</button></div>`;
  }
  const run = training.active();
  if (run) html += `<div class="hint">${t("Training läuft: {x}", { x: esc(run.name ?? "") })} <button data-open-training>${t("Weiter")}</button></div>`;
  // Einkaufstag (Routine/Termin mit "Einkauf") oder Einkauf ist heute geplant: offene Artikel zeigen
  const shopOpen = shopping.openCount();
  const shopDay = state.entries.some((e) => !e.done && /einkauf|alışveriş|market/i.test(e.title));
  // Dringendes oder bis morgen Gebrauchtes immer zeigen
  const pressing = isToday ? shopping.pressing() : [];
  if (pressing.length && !shopDay) html += `<div class="hint warn">${t("Einkaufen: {x}", { x: pressing.slice(0, 4).map((x) => esc(x.name)).join(", ") + (pressing.length > 4 ? " …" : "") })} <button data-open-shop>${t("Öffnen")}</button></div>`;
  if (shopOpen?.length && shopDay) {
    const byStore = Object.entries(shopOpen.reduce((a, x) => ((a[x.store] = (a[x.store] ?? 0) + 1), a), {}));
    html += `<div class="hint">${t("Einkaufsliste: {n} offen", { n: shopOpen.length })}${byStore.length > 1 ? " (" + byStore.map(([k, n]) => `${esc(t(STORES[k] ?? k))} ${n}`).join(", ") + ")" : ""} <button data-open-shop>${t("Öffnen")}</button></div>`;
  }
  const low = lowSupplies();
  if (isToday && low.length) html += `<div class="hint warn">${t("Vorrat")}: ${low.map((x) => `${esc(x.name)} ${supplyDays(x) <= 0 ? t("leer") : t("noch {n} Tage", { n: supplyDays(x) })}`).join(", ")} <button data-goto="vorrat">${t("Ansehen")}</button></div>`;
  if (state.settings && state.settings.lat == null) html += `<div class="hint">${t("Für automatische Gebetszeiten einmal den Standort setzen.")} <button data-goto="mehr">${t("Jetzt einrichten")}</button></div>`;

  if (timed.length) {
    html += `<div class="section-head"><h3>${t("Zeitplan")}</h3><span class="muted">${fmtDay(isoDate(state.day), { day: "numeric", month: "long" })}</span></div>`;
    html += timed.map((e) => `<div class="slot"><div class="t">${e.time}</div>${itemHtml(e, { next: e === next })}</div>`).join("");
  }
  if (untimed.length) {
    html += `<div class="section-head"><h3>${t("Ohne feste Zeit")}</h3></div>`;
    html += untimed.map((e) => `<div class="slot"><div class="t"></div>${itemHtml(e)}</div>`).join("");
  }
  if (state.open.length) {
    html += `<div class="section-head"><h3>${t("Offene Aufgaben")}</h3><span class="muted">${t("mit Frist")}</span></div>`;
    html += state.open.map((e) => `<div class="slot"><div class="t"></div>${itemHtml(e)}</div>`).join("");
  }
  if (!total && !state.open.length) html += `<div class="empty">${t("Tippe unten aufs Mikro und sag, was ansteht.")}</div>`;
  $("#view-heute").innerHTML = html;
  wellness.bind($("#view-heute"));
  const sel = $("#days .sel");
  if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
}

// Routinen nach Tageszeit (Standard) oder nach Bereich gruppieren
let planGroup = "zeit";
try { planGroup = localStorage.getItem("tagesplan-plan-group") || "zeit"; } catch {}
function setPlanGroup(g) { planGroup = g; try { localStorage.setItem("tagesplan-plan-group", g); } catch {} }
const DAYPARTS = [["morgens", "Morgens"], ["mittags", "Mittags"], ["abends", "Abends"], ["flex", "Ohne feste Uhrzeit"]];
const daypart = (time) => !time ? "flex" : time < "11:00" ? "morgens" : time < "17:00" ? "mittags" : "abends";

function renderPlan() {
  const byTime = planGroup === "zeit";
  const groups = {};
  const timeOf = (r) => routineTime(r, state.pt);
  for (const r of state.routines) (groups[byTime ? daypart(timeOf(r)) : r.category] ??= []).push(r);
  if (byTime) for (const list of Object.values(groups)) list.sort((a, b) => (timeOf(a) ?? "99").localeCompare(timeOf(b) ?? "99"));
  let html = `<div class="section-head"><h3>${t("Routinen")}</h3><span class="muted">${t("{n} Einträge", { n: state.routines.length })}</span></div>
    <div class="seg" id="group-seg">
      <button type="button" data-g="zeit" class="${byTime ? "on" : ""}">${t("Nach Tageszeit")}</button>
      <button type="button" data-g="bereich" class="${byTime ? "" : "on"}">${t("Nach Bereich")}</button>
    </div>`;
  const order = byTime ? DAYPARTS : Object.entries(CATEGORIES);
  for (const [key, label] of order) {
    const list = groups[key];
    if (!list) continue;
    html += `<p class="eyebrow" style="margin-top:18px">${byTime ? t(label) : label}</p>`;
    html += list.map((r) => `<button class="list-item ${r.active ? "" : "off"}" data-edit-routine="${r.id}" data-swipe="routine:${r.id}">
      <div class="tm">${routineWhen(r)}</div>
      <div class="body"><div class="title">${esc(r.title)}</div>
      <div class="sub">${r.days.length === 7 ? t("täglich") : r.days.map((d) => DAY_SHORT[d - 1]).join(", ")}${r.notes ? " · " + esc(r.notes) : ""}</div></div>
      <span class="muted">›</span></button>`).join("");
  }
  html += `<button class="primary" id="new-routine">${t("Neue Routine")}</button>`;
  $("#view-plan").innerHTML = html;
  $("#view-plan").querySelectorAll("#group-seg button").forEach((b) => (b.onclick = () => { setPlanGroup(b.dataset.g); renderPlan(); }));
}

// Termine: Liste, Monat oder Verlauf, dazu eine Suche über alle Einträge
const toEntry = (i) => ({ kind: i.kind, id: i.id, title: i.title, time: hhmm(i.start_time) || null, end: hhmm(i.end_time), done: i.done, notes: i.notes, raw: i, on_date: i.on_date, priority: i.priority, location: i.location });
state.termMode = "liste";
state.search = "";

async function renderTermine() {
  const { data } = await db.from("items").select("*").order("on_date").order("start_time", { nullsFirst: false }).limit(3000);
  state.allItems = data ?? [];
  state.termineCache = state.allItems;
  const view = $("#view-termine");
  if (!view.querySelector("#t-body")) {
    view.innerHTML = `<div class="search"><input id="t-search" type="search" enterkeyhint="search" autocomplete="off" placeholder="${t("Suchen in allen Einträgen")}"></div>
      <div class="seg" id="term-seg">${[["liste", "Liste"], ["monat", "Monat"], ["verlauf", "Verlauf"]].map(([v, n]) => `<button type="button" data-mode="${v}">${t(n)}</button>`).join("")}</div>
      <div id="t-body"></div>
      <button class="primary" id="new-item">${t("Termin oder Aufgabe anlegen")}</button>`;
    $("#t-search").oninput = (e) => { state.search = e.target.value; renderTermBody(); };
    view.querySelectorAll("#term-seg button").forEach((b) => (b.onclick = () => { state.termMode = b.dataset.mode; state.search = ""; $("#t-search").value = ""; renderTermBody(); }));
  }
  if ($("#t-search").value !== state.search) $("#t-search").value = state.search;
  renderTermBody();
}

function renderTermBody() {
  const body = $("#t-body");
  if (!body) return;
  $("#view-termine").querySelectorAll("#term-seg button").forEach((b) => b.classList.toggle("on", !state.search && b.dataset.mode === state.termMode));
  const q = state.search.trim().toLocaleLowerCase(LOCALE());
  body.innerHTML = q ? searchHtml(q) : ({ liste: listHtml, monat: monthHtml, verlauf: historyHtml })[state.termMode]();
  body.querySelectorAll("[data-area]").forEach((b) => (b.onclick = () => { state.areaFilter = b.dataset.area; renderTermBody(); }));
  body.querySelectorAll("[data-month]").forEach((b) => (b.onclick = () => { const m = state.month; state.month = new Date(m.getFullYear(), m.getMonth() + Number(b.dataset.month), 1); renderTermBody(); }));
  body.querySelectorAll("[data-mday]").forEach((b) => (b.onclick = () => { state.monthSel = b.dataset.mday; renderTermBody(); }));
}

function listHtml() {
  const data = state.allItems.filter((i) => i.on_date >= isoDate(new Date()));
  const f = state.areaFilter ?? "";
  const shown = data.filter((i) => !f || i.area === f);
  const termine = shown.filter((i) => i.kind === "termin");
  const aufgaben = shown.filter((i) => i.kind === "aufgabe" && !i.done);
  const used = [...new Set(data.map((i) => i.area).filter(Boolean))];
  let html = used.length ? `<div class="chips">${[["", t("Alle")], ...used.map((a) => [a, AREAS[a] ?? a])]
    .map(([v, n]) => `<button class="chip ${f === v ? "on" : ""}" data-area="${esc(v)}">${esc(n)}</button>`).join("")}</div>` : "";
  html += `<div class="section-head"><h3>${t("Kommende Termine")}</h3></div>`;
  if (!termine.length) html += `<div class="empty">${t("Keine Termine.")}</div>`;
  let last = "";
  for (const x of termine) {
    if (x.on_date !== last) { html += `<p class="eyebrow" style="margin-top:14px">${fmtDay(x.on_date, { weekday: "long", day: "numeric", month: "long" })}</p>`; last = x.on_date; }
    html += `<div class="slot"><div class="t">${hhmm(x.start_time)}</div>${itemHtml(toEntry(x))}</div>`;
  }
  html += `<div class="section-head"><h3>${t("Aufgaben")}</h3></div>`;
  html += aufgaben.length ? aufgaben.map((a) => `<div class="slot"><div class="t small">${fmtDay(a.on_date, { day: "numeric", month: "numeric" })}</div>${itemHtml(toEntry(a), { showTime: true })}</div>`).join("") : `<div class="empty">${t("Keine offenen Aufgaben.")}</div>`;
  return html;
}

function monthHtml() {
  const today = isoDate(new Date());
  state.month ??= new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  state.monthSel ??= today;
  const m = state.month;
  const byDay = {};
  for (const i of state.allItems) (byDay[i.on_date] ??= []).push(i);
  const first = (m.getDay() + 6) % 7;
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  let cells = "";
  for (let k = 0; k < first; k++) cells += `<span></span>`;
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(m.getFullYear(), m.getMonth(), d));
    const list = byDay[iso] ?? [];
    const dots = list.slice(0, 4).map((i) => `<i class="dot ${i.kind} ${i.done ? "done" : ""} ${i.priority === "hoch" && !i.done ? "prio" : ""}"></i>`).join("");
    cells += `<button type="button" data-mday="${iso}" class="${iso === state.monthSel ? "sel" : ""} ${iso === today ? "today" : ""}"><b>${d}</b><span class="dots">${dots}</span></button>`;
  }
  const sel = (byDay[state.monthSel] ?? []).slice().sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
  return `<div class="cal-head">
      <button type="button" class="cal-nav" data-month="-1" aria-label="‹">‹</button>
      <b>${m.toLocaleDateString(LOCALE(), { month: "long", year: "numeric" })}</b>
      <button type="button" class="cal-nav" data-month="1" aria-label="›">›</button>
    </div>
    <div class="cal month">${DAY_SHORT.map((d) => `<i>${d}</i>`).join("")}${cells}</div>
    <div class="section-head"><h3>${fmtDay(state.monthSel, { weekday: "long", day: "numeric", month: "long" })}</h3><button class="link-btn" data-open-day="${state.monthSel}">${t("Tag öffnen")}</button></div>
    ${sel.length ? sel.map((i) => `<div class="slot"><div class="t">${hhmm(i.start_time)}</div>${itemHtml(toEntry(i))}</div>`).join("") : `<div class="empty">${t("Nichts eingetragen.")}</div>`}`;
}

function historyHtml() {
  const done = state.allItems.filter((i) => i.done).sort((a, b) => (b.done_at ?? b.on_date).localeCompare(a.done_at ?? a.on_date)).slice(0, 200);
  const weekAgo = Date.now() - 7 * 864e5;
  const week = done.filter((i) => i.done_at && Date.parse(i.done_at) > weekAgo).length;
  let html = `<div class="section-head"><h3>${t("Erledigt")}</h3><span class="muted">${t("{n} in den letzten 7 Tagen", { n: week })}</span></div>`;
  if (!done.length) return html + `<div class="empty">${t("Noch nichts erledigt.")}</div>`;
  let last = "";
  for (const i of done) {
    const d = i.done_at ? isoDate(new Date(i.done_at)) : i.on_date;
    if (d !== last) { html += `<p class="eyebrow" style="margin-top:14px">${fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}</p>`; last = d; }
    html += `<div class="slot"><div class="t small">${i.done_at ? new Date(i.done_at).toTimeString().slice(0, 5) : ""}</div>${itemHtml(toEntry(i))}</div>`;
  }
  return html;
}

function searchHtml(q) {
  const words = q.split(/\s+/).filter(Boolean);
  const text = (i) => [i.title, i.notes, i.location, ...(i.checklist ?? []).map((c) => c.t)].filter(Boolean).join(" ").toLocaleLowerCase(LOCALE());
  const hits = state.allItems.filter((i) => words.every((w) => text(i).includes(w))).sort((a, b) => b.on_date.localeCompare(a.on_date)).slice(0, 100);
  let html = `<div class="section-head"><h3>${t("Suche")}</h3><span class="muted">${t("{n} Treffer", { n: hits.length })}</span></div>`;
  if (!hits.length) return html + `<div class="empty">${t("Nichts gefunden.")}</div>`;
  return html + hits.map((i) => `<div class="slot"><div class="t small">${fmtDay(i.on_date, { day: "numeric", month: "numeric", year: "2-digit" })}</div>${itemHtml(toEntry(i), { showTime: true })}</div>`).join("");
}

// Supplement-Vorrat als eigene Seite
function renderVorrat() {
  $("#view-vorrat").innerHTML = `
    <div class="section-head" id="vorrat"><h3>${t("Supplement-Vorrat")}</h3><span class="muted">${t("{n} Einträge", { n: state.supplies.length })}</span></div>
    <div class="card supplies">
      ${state.supplies.length ? state.supplies.map((x) => {
        const left = supplyLeft(x), days = supplyDays(x), low = days <= (x.warn_days ?? 7);
        return `<div class="sup-row ${low ? "low" : ""}">
          <button type="button" class="sup-main" data-sup="${x.id}"><b>${esc(x.name)}</b>
            <span class="small ${low ? "warn-text" : "muted"}">${fmtNum(left)} ${esc(t(x.unit))} · ${days <= 0 ? t("leer") : t("reicht {n} Tage", { n: days })}</span></button>
          <button type="button" class="btn sup-refill" data-refill="${x.id}">${t("Auffüllen")}</button>
        </div>`;
      }).join("") : `<p class="small muted">${t("Trag ein, wie viel du von jedem Supplement hast. Die App zieht täglich ab und warnt, bevor es leer ist.")}</p>`}
      ${STACK.filter((n) => !state.supplies.some((x) => x.name.toLowerCase() === n.toLowerCase())).length ? `<p class="small muted" style="margin-top:12px">${t("Aus deinem Stack")}</p>
      <div class="chips">${STACK.filter((n) => !state.supplies.some((x) => x.name.toLowerCase() === n.toLowerCase())).map((n) => `<button type="button" class="chip" data-sup-new="${esc(n)}">+ ${esc(n)}</button>`).join("")}</div>` : ""}
      <button class="btn fill" id="sup-add">${t("Supplement hinzufügen")}</button>
    </div>`;
  $("#view-vorrat").querySelectorAll("[data-sup]").forEach((b) => (b.onclick = () => openSupplySheet(state.supplies.find((x) => x.id === b.dataset.sup))));
  $("#view-vorrat").querySelectorAll("[data-refill]").forEach((b) => (b.onclick = () => openRefill(state.supplies.find((x) => x.id === b.dataset.refill))));
  $("#view-vorrat").querySelectorAll("[data-sup-new]").forEach((b) => (b.onclick = () => openSupplySheet({ name: b.dataset.supNew })));
  $("#sup-add").onclick = () => openSupplySheet();
}

const MEHR_TABS = [["allgemein", "Allgemein"], ["gebet", "Gebet"], ["kalender", "Kalender"], ["konto", "Konto"]];
try { state.mehrTab = localStorage.getItem("tagesplan-mehr-tab"); } catch {}
function renderMehr() {
  const s = state.settings ?? {};
  const feed = `${SUPABASE_URL}/functions/v1/kalender?token=${s.calendar_token}`;
  const tab = MEHR_TABS.some(([k]) => k === state.mehrTab) ? state.mehrTab : "allgemein";
  const grp = (k) => `<div class="mehr-group" data-group="${k}" ${tab === k ? "" : "hidden"}>`;
  $("#view-mehr").innerHTML = `
    <div class="seg mehr-tabs" id="mehr-tabs" role="tablist">${MEHR_TABS.map(([k, n]) => `<button type="button" role="tab" data-mtab="${k}" class="${tab === k ? "on" : ""}" aria-selected="${tab === k}">${t(n)}</button>`).join("")}</div>
    ${grp("allgemein")}
    <div class="card">
      <p class="eyebrow">${t("Sprache")}</p>
      <div class="seg" id="lang-seg">
        <button type="button" data-lang="de" class="${LANG === "de" ? "on" : ""}">Deutsch</button>
        <button type="button" data-lang="tr" class="${LANG === "tr" ? "on" : ""}">Türkçe</button>
      </div>
    </div>
    <div class="card">
      <p class="eyebrow">${t("Darstellung")}</p>
      <div class="seg" id="theme-seg">
        ${[["auto", "Automatisch"], ["light", "Hell"], ["dark", "Dunkel"]].map(([v, n]) => `<button type="button" data-theme="${v}" class="${themePref === v ? "on" : ""}">${t(n)}</button>`).join("")}
      </div>
    </div>
    <div class="card">
      <p class="eyebrow">${t("Mitteilungen")}</p>
      <p id="push-state" class="small">${state.pushText ?? t("Prüfe …")}</p>
      <button class="btn fill" id="push-on">${state.pushBtn ?? t("Mitteilungen einschalten")}</button>
      <button class="btn" id="push-test">${t("Test senden")}</button>
      <label class="small muted" style="display:block;margin-top:12px">${t("Wichtiges erneut melden alle")}</label>
      <form><select id="nag">${[10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${(s.nag_minutes ?? 20) === m ? "selected" : ""}>${t("{n} Minuten", { n: m })}</option>`).join("")}</select></form>
      <p class="small muted">${t("Gebete erinnern bis zum nächsten Gebet, Wichtiges bis du es abhakst (höchstens 5 Std., nachts ab 23:30 ist Ruhe).")}</p>
    </div>
    </div>
    ${grp("gebet")}
    <div class="card">
      <p class="eyebrow">${t("Gebetszeiten")}</p>
      <p>${s.lat != null ? t("Standort gesetzt ({x}).", { x: `${s.lat.toFixed(2)}, ${s.lng.toFixed(2)}` }) : t("Noch kein Standort gesetzt.")}</p>
      <button class="btn fill" id="set-loc">${t("Aktuellen Standort verwenden")}</button>
      <label class="small muted" style="display:block;margin-top:12px">${t("Berechnung")}</label>
      <form><select id="method">
        ${[[13, "Diyanet (Türkei)"], [3, "Muslim World League"], [2, "ISNA (Nordamerika)"], [4, "Umm al-Qura"], [5, "Ägypten"]]
          .map(([v, n]) => `<option value="${v}" ${s.prayer_method === v ? "selected" : ""}>${t(n)}</option>`).join("")}
      </select></form>
    </div>
    <div class="card">
      <p class="eyebrow">${t("Zikir")}</p>
      <label class="small muted" style="display:block">${t("Tagesziel")}</label>
      <form id="zikr-goal-form" class="shop-add"><input id="zikr-goal" inputmode="numeric" pattern="[0-9]*" value="${zikir.goal()}" autocomplete="off"><button type="submit" class="primary" aria-label="${t("Speichern")}">✓</button></form>
      <p class="small muted">${t("Gilt ab heute. Frühere Tage behalten ihr altes Ziel in der Statistik.")}</p>
      <button type="button" class="btn" data-goto="zikir">${t("Zur Zikir-Seite")}</button>
    </div>
    </div>
    ${grp("kalender")}
    <div class="dark-block">
      <p class="eyebrow">${t("Kalender verknüpfen")}</p>
      <p>${t("Abonniere diesen Link in deinem Kalender. Termine, Routinen und Gebetszeiten erscheinen dort mit Erinnerung und aktualisieren sich von selbst.")}</p>
      <p class="small">${t("iPhone: Einstellungen › Kalender › Accounts › Account hinzufügen › Andere › Kalenderabo hinzufügen.")}</p>
    </div>
    <div class="card">
      <code class="link">${esc(feed)}</code>
      <button class="btn fill" id="open-feed">${t("Im Kalender öffnen")}</button>
      <button class="btn" id="copy-feed">${t("Link kopieren")}</button>
    </div>
    <div class="card">
      <p class="eyebrow">${t("Homescreen-Widget")}</p>
      <p class="small">${t("Nächstes Gebet und nächste Aufgabe auf dem Homescreen, über die kostenlose App Scriptable.")}</p>
      <button class="btn fill" id="widget-setup">${t("Widget einrichten")}</button>
    </div>
    </div>
    ${grp("konto")}
    <div class="card">
      <p class="eyebrow">${t("Passwort ändern")}</p>
      <form id="pw-form">
        <div class="pw"><input id="pw-new" type="password" autocomplete="new-password" placeholder="${t("Neues Passwort (mind. 10 Zeichen)")}" minlength="10" required><button type="button" class="eye" data-eye aria-label="Passwort anzeigen"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <div class="pw"><input id="pw-repeat" type="password" autocomplete="new-password" placeholder="${t("Neues Passwort wiederholen")}" minlength="10" required><button type="button" class="eye" data-eye aria-label="Passwort anzeigen"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <button class="btn fill">${t("Passwort speichern")}</button>
      </form>
    </div>
    <div class="card">
      <p class="eyebrow">${t("App-Sperre")}</p>
      <p class="small" id="lock-state">${lockId() ? t("Beim Öffnen fragt die App nach Face ID.") : t("Sperrt die App beim Öffnen und nach einer Minute im Hintergrund. Entsperren mit Face ID oder Code des iPhones.")}</p>
      <button class="btn ${lockId() ? "" : "fill"}" id="lock-toggle">${t(lockId() ? "App-Sperre ausschalten" : "Mit Face ID sperren")}</button>
    </div>
    </div>
    ${grp("allgemein")}
    <div class="card">
      <p class="eyebrow">${t("Wasser und Schlaf")}</p>
      <label class="small muted" style="display:block">${t("Wasser pro Tag")}</label>
      <form><select id="water-goal">${[8, 10, 12, 14, 16].map((n) => `<option value="${n}" ${(s.water_goal ?? 12) === n ? "selected" : ""}>${t("{n} Gläser ({l} l)", { n, l: wellness.liters(n) })}</option>`).join("")}</select></form>
      <label class="small muted" style="display:block;margin-top:12px">${t("Schlafziel")}</label>
      <form><select id="sleep-h">${[6, 6.5, 7, 7.5, 8, 8.5, 9].map((n) => `<option value="${n}" ${Number(s.sleep_hours ?? 7.5) === n ? "selected" : ""}>${t("{n} Std.", { n: n.toLocaleString(LOCALE()) })}</option>`).join("")}</select></form>
      <p class="small muted">${t("Die Schlafenszeit richtet sich nach Fajr: 15 Minuten vorher aufstehen, frühestens nach Isha ins Bett.")}</p>
    </div>
    </div>
    ${grp("konto")}
    <div class="card">
      <p class="eyebrow">${t("Deine Daten")}</p>
      <p class="small">${t("Alles als Datei sichern: Routinen, Termine, Training, Körperwerte, Einkäufe, Fristen und Tageswerte.")}</p>
      <button class="btn" id="export">${t("Daten exportieren")}</button>
    </div>
    <div class="card"><p class="small muted">${t("Angemeldet als {x}", { x: esc(state.user?.email) })}</p><button class="btn danger" id="logout">${t("Abmelden")}</button></div>
    </div>`;
  document.querySelectorAll("#mehr-tabs [data-mtab]").forEach((b) => (b.onclick = () => {
    state.mehrTab = b.dataset.mtab;
    try { localStorage.setItem("tagesplan-mehr-tab", state.mehrTab); } catch {}
    renderMehr();
  }));
  $("#zikr-goal-form").onsubmit = async (e) => {
    e.preventDefault();
    $("#zikr-goal").blur();
    const r = await zikir.setGoal(Number($("#zikr-goal").value.replace(/\D/g, "")) || 0);
    toast(r.msg);
  };
  $("#pw-form").onsubmit = async (e) => {
    e.preventDefault();
    const pw = $("#pw-new").value;
    if (pw !== $("#pw-repeat").value) return toast(t("Die beiden Passwörter sind nicht gleich."));
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) return toast(/different from the old/i.test(error.message) ? t("Das ist schon dein aktuelles Passwort.") : error.message);
    e.target.reset();
    toast(t("Passwort geändert"));
  };
  $("#set-loc").onclick = () => navigator.geolocation.getCurrentPosition(async (p) => {
    await saveSettings({ lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4) });
    toast(t("Standort gespeichert"));
  }, () => toast(t("Standort nicht freigegeben")));
  $("#nag").onchange = (e) => saveSettings({ nag_minutes: Number(e.target.value) });
  $("#push-on").onclick = enablePush;
  $("#push-test").onclick = sendTestPush;
  updatePushState();
  $("#method").onchange = (e) => saveSettings({ prayer_method: Number(e.target.value) });
  $("#copy-feed").onclick = () => navigator.clipboard.writeText(feed).then(() => toast(t("Link kopiert")));
  $("#open-feed").onclick = () => { location.href = feed.replace(/^https:/, "webcal:"); };
  $("#logout").onclick = () => db.auth.signOut();
  document.querySelectorAll("#theme-seg button").forEach((b) => (b.onclick = () => { setTheme(b.dataset.theme); renderMehr(); }));
  document.querySelectorAll("#lang-seg button").forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); $("#view-termine").innerHTML = ""; render(); saveSettings({ lang: LANG }); }));
  $("#lock-toggle").onclick = toggleLock;
  $("#export").onclick = exportData;
  $("#water-goal").onchange = (e) => saveSettings({ water_goal: Number(e.target.value) });
  $("#sleep-h").onchange = async (e) => { await saveSettings({ sleep_hours: Number(e.target.value) }); await updateSleepRoutine(); const p = wellness.sleep(); if (p) toast(t("Schlafenszeit {b}, aufstehen {w} vor Fajr", { b: p.bed, w: p.wake })); };
  $("#widget-setup").onclick = openWidgetSetup;
}

// ---------- Supplement-Vorrat ----------
const fmtNum = (n) => (Math.round(n * 10) / 10).toLocaleString(LOCALE());
const daysSince = (iso) => Math.max(0, Math.round((Date.parse(isoDate(new Date()) + "T12:00") - Date.parse(iso + "T12:00")) / 864e5));
const supplyLeft = (x) => Math.max(0, Number(x.stock) - Number(x.per_day) * daysSince(x.counted_on));
const supplyDays = (x) => (Number(x.per_day) > 0 ? Math.floor(supplyLeft(x) / Number(x.per_day)) : Infinity);
const lowSupplies = () => (state.supplies ?? []).filter((x) => supplyDays(x) <= (x.warn_days ?? 7));
const UNITS = ["Kapseln", "Tabletten", "Tropfen", "ml", "g", "Portionen"];

function openSupplySheet(x = {}) {
  x = x ?? {};
  const left = x.id ? supplyLeft(x) : "";
  form.innerHTML = `<h3>${t(x.id ? "Vorrat bearbeiten" : "Supplement hinzufügen")}</h3>
    <input name="name" placeholder="${t("Name, z. B. Magnesium")}" required value="${esc(x.name)}">
    <div class="row">
      <div><label>${t("Bestand jetzt")}</label><input name="stock" type="number" inputmode="decimal" min="0" step="any" required value="${x.id ? fmtNum(left).replace(",", ".") : ""}"></div>
      <div><label>${t("Einheit")}</label><select name="unit">${UNITS.map((u) => `<option value="${u}" ${(x.unit ?? "Kapseln") === u ? "selected" : ""}>${t(u)}</option>`).join("")}</select></div>
    </div>
    <div class="row">
      <div><label>${t("Pro Tag")}</label><input name="per_day" type="number" inputmode="decimal" min="0" step="any" required value="${x.per_day ?? 1}"></div>
      <div><label>${t("Warnen ab (Tage)")}</label><input name="warn_days" type="number" inputmode="numeric" min="0" max="60" value="${x.warn_days ?? 7}"></div>
    </div>
    <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>
    ${x.id ? `<button type="button" class="ghost danger" id="del">${t("Löschen")}</button>` : ""}
    <button type="button" class="ghost" id="cancel">${t("Abbrechen")}</button>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const row = { name: f.get("name").trim(), unit: f.get("unit"), stock: Number(String(f.get("stock")).replace(",", ".")), per_day: Number(String(f.get("per_day")).replace(",", ".")),
      warn_days: Number(f.get("warn_days") || 7), counted_on: isoDate(new Date()) };
    const { error } = x.id ? await db.from("supplies").update(row).eq("id", x.id) : await db.from("supplies").insert(row);
    if (error) return toast(error.message);
    closeSheet(sheet); refresh();
  };
  bindSheetButtons(async () => { await db.from("supplies").delete().eq("id", x.id); });
  openSheet(sheet);
}

function openRefill(x) {
  form.innerHTML = `<h3>${t("{x} auffüllen", { x: esc(x.name) })}</h3>
    <p class="small muted">${t("Noch {n} {u}. Wie viele kommen dazu?", { n: fmtNum(supplyLeft(x)), u: esc(t(x.unit)) })}</p>
    <div class="chips quick">${[30, 60, 90, 120, 180].map((n) => `<button type="button" class="chip" data-n="${n}">+${n}</button>`).join("")}</div>
    <input name="amount" type="number" inputmode="decimal" min="0" step="any" placeholder="${t("Menge")}">
    <div class="sheet-actions"><button class="primary" value="save">${t("Auffüllen")}</button></div>
    <button type="button" class="ghost" id="cancel">${t("Abbrechen")}</button>`;
  form.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => { form.amount.value = b.dataset.n; form.requestSubmit(); }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const n = Number(String(form.amount.value).replace(",", "."));
    if (!n) return;
    closeSheet(sheet);
    await refillSupply(x, n, "add");
  };
  bindSheetButtons();
  openSheet(sheet);
}

// "add": Menge dazu, "set": so viel ist jetzt da
async function refillSupply(x, n, mode) {
  const before = { stock: x.stock, counted_on: x.counted_on };
  const stock = mode === "add" ? supplyLeft(x) + n : n;
  const { error } = await db.from("supplies").update({ stock, counted_on: isoDate(new Date()) }).eq("id", x.id);
  if (error) return toast(error.message);
  toast(t("{x}: jetzt {n} {u}", { x: x.name, n: fmtNum(stock), u: t(x.unit) }), async () => { await db.from("supplies").update(before).eq("id", x.id); refresh(); });
  refresh();
}

// ---------- Push-Mitteilungen ----------
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

async function updatePushState() {
  const el = $("#push-state");
  if (!el) return;
  // Letzten Stand merken, damit beim Öffnen von Mehr nichts flackert
  const show = (text, btn) => {
    state.pushText = text; state.pushBtn = btn ?? state.pushBtn;
    if ($("#push-state")) $("#push-state").textContent = text;
    if (btn && $("#push-on")) $("#push-on").textContent = btn;
  };
  if (isIOS() && !standalone()) return show(t("Auf dem iPhone gehen Mitteilungen nur, wenn die App über Teilen › „Zum Home-Bildschirm“ installiert ist und von dort geöffnet wird."));
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return show(t("Dieser Browser kann keine Mitteilungen."));
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  show(Notification.permission === "denied" ? t("Mitteilungen sind blockiert. Bitte in den Einstellungen des Handys für Tagesplan erlauben.")
    : sub ? t("Mitteilungen sind an für dieses Gerät.") : t("Mitteilungen sind aus."), t(sub ? "Neu verbinden" : "Mitteilungen einschalten"));
}

async function enablePush() {
  try {
    if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") return updatePushState();
    const reg = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(atob(VAPID_PUBLIC.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    const j = sub.toJSON();
    const { error } = await db.from("push_subscriptions").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    if (error) throw error;
    toast(t("Mitteilungen sind an"));
    sendTestPush();
  } catch (e) { toast(t("Mitteilungen gingen nicht an: {x}", { x: e.message ?? e })); }
  updatePushState();
}

async function sendTestPush() {
  const { data } = await db.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/erinnern?test=1`, {
    method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token}`, apikey: SUPABASE_KEY },
  }).catch(() => null);
  const ok = res && res.ok ? (await res.json()).ok : 0;
  toast(t(ok ? "Testmitteilung geschickt" : "Kein Gerät verbunden. Erst Mitteilungen einschalten."));
}

async function saveSettings(patch) {
  const { data, error } = await db.from("settings").update(patch).eq("user_id", state.user.id).select().single();
  if (error) return toast(error.message);
  state.settings = data ?? { ...state.settings, ...patch };
  await refresh();
}

// ---------- Aktionen ----------
async function setRoutineDone(id, on, date = isoDate(state.day)) {
  if (on) await db.from("completions").upsert({ routine_id: id, on_date: date });
  else await db.from("completions").delete().eq("routine_id", id).eq("on_date", date);
}

// Aufgabe abhaken; bei einer Serie gleich die nächste Folge anlegen bzw. beim Zurücknehmen wieder entfernen
async function setItemDone(id, on) {
  const raw = findEntry(id)?.raw ?? findEntry(id) ?? (state.upcoming ?? []).find((i) => i.id === id);
  await db.from("items").update({ done: on }).eq("id", id);
  if (raw) raw.done = on;
  if (raw?.series_id && raw.repeat) {
    if (on) await advanceSeries(true);
    else await db.from("items").delete().eq("series_id", raw.series_id).eq("done", false).gt("on_date", raw.on_date);
    state.upcoming = null;
  }
}

const findEntry = (id) => [...state.entries, ...state.open].find((e) => e.id === id) ?? (state.termineCache ?? []).find((e) => e.id === id);

function openTraining(startIt = false) {
  switchView("training");
  if (startIt) training.start();
}
document.addEventListener("click", (ev) => { if (ev.target.closest("[data-open-training]")) openTraining(); });
document.addEventListener("click", (ev) => { if (ev.target.closest("[data-open-shop]")) switchView("einkauf"); });

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-toggle],[data-edit-item],[data-edit-routine],[data-day],[data-open-day],[data-goto],[data-detail],#new-routine,#new-item");
  if (!t) return;
  if (t.dataset.toggle) {
    const [kind, id] = t.dataset.toggle.split(":");
    const on = !findEntry(id)?.done;
    t.classList.toggle("on", on);
    t.innerHTML = on ? CHECK_SVG : "";
    if (navigator.vibrate) navigator.vibrate(10);
    if (kind === "routine") await setRoutineDone(id, on);
    else await setItemDone(id, on);
    await refresh();
  } else if (t.dataset.detail) {
    const e = findEntry(t.dataset.detail);
    if (e) openDetail(e.raw ? e : toEntry(e));
  } else if (t.dataset.editItem) {
    const e = findEntry(t.dataset.editItem);
    openItemSheet(e?.raw ?? e);
  } else if (t.dataset.editRoutine) {
    openRoutineSheet(state.routines.find((r) => r.id === t.dataset.editRoutine));
  } else if (t.dataset.day) {
    state.day = new Date(t.dataset.day + "T12:00");
    refresh();
  } else if (t.dataset.openDay) {
    state.day = new Date(t.dataset.openDay + "T12:00");
    switchView("heute");
  } else if (t.dataset.goto) switchView(t.dataset.goto);
  else if (t.id === "new-routine") openRoutineSheet();
  else if (t.id === "new-item") openItemSheet();
});

// Plus oben legt je nach Seite das Passende an
$("#add").onclick = () => ({
  einkauf: () => shopping.openNew(), training: () => training.newExercise(), vorrat: () => openSupplySheet(), plan: () => openRoutineSheet(),
  glaube: () => glaube.openAdd(), zikir: () => zikir.openAdd(), koran: () => koran.openSearch(), fristen: () => deadlines.openEdit(),
}[state.view] ?? (() => openItemSheet()))();
$("#greeting").onclick = () => { state.day = new Date(); switchView("heute"); };

document.querySelectorAll(".tabs > button").forEach((b) => (b.onclick = () => switchView(b.dataset.view)));

// ---------- Seitenmenü ----------
const ICON = {
  heute: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  termine: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  plan: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  training: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  einkauf: '<path d="M3 4h2.5l2.2 11.2a1.5 1.5 0 0 0 1.5 1.3h8.6a1.5 1.5 0 0 0 1.5-1.2L21 8H6.3"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/>',
  vorrat: '<rect x="7" y="3" width="10" height="4" rx="1"/><path d="M8 7h8v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"/><path d="M8 12h8"/>',
  glaube: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M14.5 7.2a3 3 0 1 0 0 5.6 3.6 3.6 0 1 1 0-5.6z"/>',
  koran: '<path d="M12 6.5C10 5 7 4.5 3 5v14c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5z"/><path d="M12 6.5v14"/>',
  zikir: '<circle cx="12" cy="4.5" r="1.8"/><circle cx="17.3" cy="7.6" r="1.8"/><circle cx="17.3" cy="13.7" r="1.8"/><circle cx="12" cy="16.8" r="1.8"/><circle cx="6.7" cy="13.7" r="1.8"/><circle cx="6.7" cy="7.6" r="1.8"/><path d="M12 18.6V22"/>',
  fristen: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M14 3v5h5M19 8v2"/><circle cx="17" cy="17" r="4"/><path d="M17 15.5V17l1 1"/>',
  rueckblick: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  mehr: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const PAGES = {
  heute: { label: "Tag" }, termine: { label: "Termine" }, plan: { label: "Routinen" }, training: { label: "Training" },
  einkauf: { label: "Einkauf" }, vorrat: { label: "Supplement-Vorrat" }, glaube: { label: "Koran & Ramadan" }, koran: { label: "Koran lesen" }, zikir: { label: "Zikir" }, fristen: { label: "Fristen & Verträge" },
  rueckblick: { label: "Wochenrückblick" }, mehr: { label: "Einstellungen" },
};
function navCount(k) {
  if (k === "einkauf") return shopping.openCount()?.length || "";
  if (k === "vorrat") return lowSupplies().length || "";
  if (k === "training") return training.active() ? "●" : "";
  if (k === "fristen") return deadlines.list().filter((d) => !d.done && d.item_id && remindSoon(d)).length || "";
  return "";
}
function updateNav() {
  const list = $("#sidenav-list");
  if (!list) return;
  list.innerHTML = Object.entries(PAGES).map(([k, p]) => `<button type="button" data-nav="${k}" class="${state.view === k ? "on" : ""}">
    <svg viewBox="0 0 24 24">${ICON[k]}</svg><span>${t(p.label)}</span>${navCount(k) ? `<em class="${k === "vorrat" ? "warn" : ""}">${navCount(k)}</em>` : ""}</button>`).join("");
  list.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => switchView(b.dataset.nav)));
}
function openNav() {
  updateNav();
  document.body.classList.add("nav-open");
  $("#sidenav").setAttribute("aria-hidden", "false");
  $("#menu-btn").setAttribute("aria-expanded", "true");
}
function closeNav() {
  if (!document.body.classList.contains("nav-open")) return;
  document.body.classList.remove("nav-open");
  $("#sidenav").setAttribute("aria-hidden", "true");
  $("#menu-btn").setAttribute("aria-expanded", "false");
}
$("#menu-btn").onclick = () => (document.body.classList.contains("nav-open") ? closeNav() : openNav());
$("#nav-scrim").onclick = closeNav;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });
// Nach rechts wischen schließt das Menü
{
  let x0 = null;
  $("#sidenav").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $("#sidenav").addEventListener("touchend", (e) => { if (x0 != null && e.changedTouches[0].clientX - x0 > 60) closeNav(); x0 = null; });
}
function switchView(v) {
  if (state.view === "zikir" && v !== "zikir") zikir.flush();
  state.view = v;
  document.querySelectorAll(".tabs > button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  for (const name of Object.keys(PAGES)) $(`#view-${name}`).hidden = name !== v;
  closeNav();
  window.scrollTo(0, 0);
  refresh();
}

// ---------- Blätter: hochfahren, runterwischen ----------
const sheet = $("#sheet"), form = $("#sheet-form");

function openSheet(d) {
  d.classList.remove("closing");
  d.style.transform = "";
  if (!d.querySelector(".sheet-x, .sheet-close")) {
    const x = document.createElement("button");
    x.type = "button"; x.className = "sheet-x"; x.setAttribute("aria-label", t("Schließen"));
    x.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
    x.onclick = () => { if (d.id === "voice") stopListening(); closeSheet(d); };
    d.prepend(x);
  }
  if (!d.open) d.showModal();
}
function closeSheet(d) {
  if (!d.open || d.classList.contains("closing")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { d.close(); return; }
  d.classList.add("closing");
  setTimeout(() => { d.classList.remove("closing"); d.style.transform = ""; d.close(); }, 220);
}
for (const d of [sheet, $("#voice"), $("#picker")]) {
  // Tipp neben das Blatt schließt es
  d.addEventListener("click", (e) => { if (e.target === d) { if (d.id === "voice") stopListening(); closeSheet(d); } });
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  // Nach unten wischen schließt es
  let y0 = null, dy = 0;
  d.addEventListener("touchstart", (e) => { y0 = d.scrollTop <= 0 && e.target.closest("input,textarea,select") == null ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  d.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    d.style.transition = "none";
    d.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  d.addEventListener("touchend", () => {
    if (y0 == null) return;
    d.style.transition = "";
    if (dy > 110) { if (d.id === "voice") stopListening(); closeSheet(d); } else d.style.transform = "";
    y0 = null;
  });
}

function openDetail(e) {
  const raw = e.raw ?? {};
  const isRoutine = e.kind === "routine";
  const kindLabel = e.kind === "termin" ? t("Termin") : e.kind === "aufgabe" ? t("Aufgabe") : CATEGORIES[e.category] ?? t("Routine");
  const when = isRoutine
    ? `${raw.days?.length === 7 ? t("Täglich") : (raw.days ?? []).map((d) => DAY_SHORT[d - 1]).join(", ")}${e.time ? " · " + e.time : ""}${raw.anchor_prayer ? ` (${routineWhen(raw)})` : raw.prayer ? ` (${t("Gebetszeit")})` : ""}`
    : `${fmtDay(raw.on_date, { weekday: "long", day: "numeric", month: "long" })}${raw.start_time ? " · " + hhmm(raw.start_time) : ""}${raw.end_time ? "–" + hhmm(raw.end_time) : ""}`;
  const remind = raw.remind_before ? (raw.remind_before >= 60 ? t("{n} Std. vorher", { n: raw.remind_before / 60 }) : t("{n} Min. vorher", { n: raw.remind_before })) : null;
  const rows = [
    [t(e.kind === "aufgabe" ? "Fällig" : "Wann"), when],
    raw.location ? [t("Ort"), `<a href="https://maps.apple.com/?q=${encodeURIComponent(raw.location)}" target="_blank" rel="noopener">${esc(raw.location)}</a>`] : null,
    [t("Priorität"), t(e.priority === "hoch" ? "Hoch, erinnert bis erledigt" : "Normal")],
    remind ? [t("Erinnerung"), remind] : null,
    !isRoutine && raw.area ? [t("Bereich"), AREAS[raw.area] ?? esc(raw.area)] : null,
    !isRoutine && raw.repeat ? [t("Wiederholung"), t(REPEATS[raw.repeat])] : null,
    raw.notes ? [t("Notiz"), esc(raw.notes).replace(/\n/g, "<br>")] : null,
  ].filter(Boolean);
  const cl = isRoutine ? [] : raw.checklist ?? [];
  form.innerHTML = `<p class="eyebrow">${kindLabel}</p>
    <h3 class="detail-title">${esc(e.title)}</h3>
    <dl class="details">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    ${cl.length ? `<p class="eyebrow" style="margin-top:14px">${t("Checkliste")}</p><div class="checklist">${cl.map((c, i) =>
      `<label class="cl-item"><input type="checkbox" data-cl="${i}" ${c.d ? "checked" : ""}><span>${esc(c.t)}</span></label>`).join("")}</div>` : ""}
    ${isRoutine && raw.category === "training" && !e.done ? `<button type="button" class="primary" id="d-train">${t(training.active() ? "Training fortsetzen" : "Training starten")}</button>` : ""}
    <button type="button" class="${isRoutine && raw.category === "training" && !e.done ? "ghost" : "primary"}" id="d-done">${t(e.done ? "Wieder öffnen" : "Erledigt")}</button>
    <div class="row">
      <button type="button" class="ghost" id="d-edit">${t("Bearbeiten")}</button>
      ${isRoutine ? "" : `<button type="button" class="ghost danger" id="d-del">${t("Löschen")}</button>`}
    </div>`;
  form.onsubmit = (ev) => ev.preventDefault();
  form.querySelectorAll("[data-cl]").forEach((box) => (box.onchange = async () => {
    cl[Number(box.dataset.cl)].d = box.checked;
    await db.from("items").update({ checklist: cl }).eq("id", e.id);
    refresh();
  }));
  $("#d-done").onclick = async () => {
    if (isRoutine) await setRoutineDone(e.id, !e.done);
    else await setItemDone(e.id, !e.done);
    closeSheet(sheet); refresh();
  };
  const dt = $("#d-train");
  if (dt) dt.onclick = () => { sheet.close(); openTraining(!training.active()); };
  $("#d-edit").onclick = () => { sheet.close(); isRoutine ? openRoutineSheet(raw) : openItemSheet(raw); };
  const del = $("#d-del");
  if (del) del.onclick = () => deleteEntry(e.kind, e.id, raw.id ? raw : undefined);
  openSheet(sheet);
}

// ---------- Formulare ----------
const prioSeg = (p) => `<label>${t("Priorität")}</label>
    <div class="seg" id="prio-seg">
      <button type="button" data-p="normal" class="${p !== "hoch" ? "on" : ""}">${t("Normal")}</button>
      <button type="button" data-p="hoch" class="${p === "hoch" ? "on" : ""}">${t("Hoch (nervt)")}</button>
    </div>`;
function bindPrio(initial) {
  let prio = initial === "hoch" ? "hoch" : "normal";
  form.querySelectorAll("#prio-seg button").forEach((b) => (b.onclick = () => {
    prio = b.dataset.p;
    form.querySelectorAll("#prio-seg button").forEach((x) => x.classList.toggle("on", x === b));
  }));
  return () => prio;
}

function openItemSheet(item = {}, preset = {}) {
  item = item ?? {};
  const it = { kind: "aufgabe", on_date: isoDate(state.day), ...preset, ...item };
  form.innerHTML = `<h3>${t(item.id ? "Bearbeiten" : "Neu anlegen")}</h3>
    ${item.id ? "" : `<div class="seg" id="kind-seg">
      <button type="button" data-k="aufgabe" class="${it.kind === "aufgabe" ? "on" : ""}">${t("Aufgabe")}</button>
      <button type="button" data-k="termin" class="${it.kind === "termin" ? "on" : ""}">${t("Termin")}</button>
      <button type="button" data-k="routine">${t("Routine")}</button>
    </div>
    <button type="button" class="ghost imp-link" id="from-doc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>${t("Aus Foto oder PDF übernehmen")}</span></button>`}
    <input name="title" placeholder="${t("Was?")}" required value="${esc(it.title)}">
    <label id="date-label">${t(it.kind === "aufgabe" ? "Fällig am" : "Datum")}</label><input name="on_date" type="date" required value="${it.on_date}">
    <div class="row"><div><label>${t("Von")}</label><input name="start_time" type="time" value="${hhmm(it.start_time)}"></div>
    <div><label>${t("Bis")}</label><input name="end_time" type="time" value="${hhmm(it.end_time)}"></div></div>
    <div id="loc-wrap" ${it.kind === "termin" ? "" : "hidden"}><label>${t("Ort")}</label><input name="location" placeholder="${t("z. B. Praxis Dr. Müller, Neuwied")}" value="${esc(it.location)}"></div>
    <label>${t("Erinnerung")}</label>
    <select name="remind_before">
      ${[["", t("Zur Uhrzeit")], [15, t("{n} Min. vorher", { n: 15 })], [30, t("{n} Min. vorher", { n: 30 })], [60, t("{n} Std. vorher", { n: 1 })], [120, t("{n} Std. vorher", { n: 2 })], [1440, t("1 Tag vorher")]]
        .map(([v, n]) => `<option value="${v}" ${String(it.remind_before ?? (it.kind === "termin" && !item.id ? 15 : "")) === String(v) ? "selected" : ""}>${n}</option>`).join("")}
    </select>
    <label>${t("Wiederholung")}</label>
    <select name="repeat"><option value="">${t("Einmalig")}</option>${Object.entries(REPEATS).map(([k, v]) => `<option value="${k}" ${it.repeat === k ? "selected" : ""}>${t(v)}</option>`).join("")}</select>
    ${prioSeg(it.priority)}
    <label>${t("Bereich")}</label>
    <select name="area"><option value="">${t("Kein Bereich")}</option>${Object.entries(AREAS).map(([k, v]) => `<option value="${k}" ${it.area === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    <label>${t("Checkliste")}</label>
    <div id="cl-list"></div>
    <button type="button" class="ghost" id="cl-add" style="text-align:left;margin-top:0">${t("+ Punkt hinzufügen")}</button>
    <label>${t("Notiz")}</label><textarea name="notes" rows="2">${esc(it.notes)}</textarea>
    <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>
    ${item.id ? `<button type="button" class="ghost danger" id="del">${t("Löschen")}</button>` : ""}
    <button type="button" class="ghost" id="cancel">${t("Abbrechen")}</button>`;
  let kind = it.kind;
  const getPrio = bindPrio(it.priority);
  const clRow = (c = { t: "", d: false }) => {
    const row = document.createElement("div");
    row.className = "cl-row";
    row.innerHTML = `<input type="checkbox" ${c.d ? "checked" : ""} aria-label="${t("Erledigt")}"><input class="cl-text" placeholder="${t("Punkt")}" value="${esc(c.t)}"><button type="button" class="cl-del" aria-label="${t("Entfernen")}">×</button>`;
    row.querySelector(".cl-del").onclick = () => row.remove();
    $("#cl-list").append(row);
    return row;
  };
  (it.checklist ?? []).forEach((c) => clRow(c));
  $("#cl-add").onclick = () => clRow().querySelector(".cl-text").focus();
  const getChecklist = () => [...form.querySelectorAll(".cl-row")]
    .map((r) => ({ t: r.querySelector(".cl-text").value.trim(), d: r.querySelector("input[type=checkbox]").checked }))
    .filter((c) => c.t);
  const fromDoc = form.querySelector("#from-doc");
  if (fromDoc) fromDoc.onclick = () => importer.open();
  form.querySelectorAll("#kind-seg button").forEach((b) => (b.onclick = () => {
    if (b.dataset.k === "routine") { sheet.close(); openRoutineSheet({ title: form.title.value }); return; }
    kind = b.dataset.k;
    $("#date-label").textContent = t(kind === "aufgabe" ? "Fällig am" : "Datum");
    $("#loc-wrap").hidden = kind !== "termin";
    form.querySelectorAll("#kind-seg button").forEach((x) => x.classList.toggle("on", x === b));
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const row = { kind, title: f.get("title").trim(), on_date: f.get("on_date"), start_time: f.get("start_time") || null, end_time: f.get("end_time") || null, notes: f.get("notes").trim() || null,
      location: kind === "termin" ? f.get("location").trim() || null : null,
      remind_before: f.get("remind_before") ? Number(f.get("remind_before")) : null, priority: getPrio(),
      area: f.get("area") || null, checklist: getChecklist(), repeat: f.get("repeat") || null };
    if (row.repeat) row.series_id = it.series_id ?? crypto.randomUUID();
    const { error } = item.id ? await db.from("items").update(row).eq("id", item.id) : await db.from("items").insert(row);
    if (error) return toast(error.message);
    closeSheet(sheet); refresh();
  };
  const del = form.querySelector("#del");
  if (del) del.onclick = () => deleteEntry(item.kind, item.id, item);
  form.querySelector("#cancel").onclick = () => closeSheet(sheet);
  enhancePickers(form);
  openSheet(sheet);
}

function openRoutineSheet(r = {}) {
  r = r ?? {};
  const rt = { category: "sonstiges", days: [1, 2, 3, 4, 5, 6, 7], active: true, ...r };
  let days = [...rt.days];
  form.innerHTML = `<h3>${t(r.id ? "Routine bearbeiten" : "Neue Routine")}</h3>
    <input name="title" placeholder="${t("Was?")}" required value="${esc(rt.title)}">
    <div class="row">
      <div><label>${t("Bereich")}</label><select name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${rt.category === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
    </div>
    ${rt.prayer ? `<p class="small muted">${t("Die Uhrzeit kommt automatisch aus den Gebetszeiten.")}</p>` : `
    <label>${t("Zeitpunkt")}</label>
    <select name="anchor">
      <option value="">${t("Feste Uhrzeit")}</option>
      ${Object.entries(PRAYER_NAMES).map(([k, v]) => `<option value="${k}" ${rt.anchor_prayer === k ? "selected" : ""}>${t("Nach {x}", { x: v })}</option>`).join("")}
    </select>
    <div class="row">
      <div id="fix-time" ${rt.anchor_prayer ? "hidden" : ""}><label>${t("Uhrzeit")}</label><input name="at_time" type="time" value="${hhmm(rt.at_time)}"></div>
      <div id="anchor-off" ${rt.anchor_prayer ? "" : "hidden"}><label>${t("Minuten danach (minus = vorher)")}</label><input name="anchor_offset" type="number" min="-720" max="720" step="5" value="${rt.anchor_offset ?? 15}"></div>
    </div>`}
    ${prioSeg(rt.priority)}
    <label>${t("Wiederholen an")}</label>
    <div class="seg" id="days-seg">${DAY_SHORT.map((d, i) => `<button type="button" data-d="${i + 1}" class="${days.includes(i + 1) ? "on" : ""}">${d}</button>`).join("")}</div>
    <label>${t("Notiz")}</label><textarea name="notes" rows="2">${esc(rt.notes)}</textarea>
    <label class="switch">${t("Aktiv")}<input type="checkbox" name="active" ${rt.active ? "checked" : ""}></label>
    <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>
    ${r.id ? `<button type="button" class="ghost danger" id="del">${t("Löschen")}</button>` : ""}
    <button type="button" class="ghost" id="cancel">${t("Abbrechen")}</button>`;
  const getPrio = bindPrio(rt.priority);
  const anchorSel = form.querySelector('[name="anchor"]');
  if (anchorSel) anchorSel.onchange = () => {
    $("#fix-time").hidden = !!anchorSel.value;
    $("#anchor-off").hidden = !anchorSel.value;
  };
  form.querySelectorAll("#days-seg button").forEach((b) => (b.onclick = () => {
    const d = Number(b.dataset.d);
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    b.classList.toggle("on", days.includes(d));
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!days.length) return toast(t("Mindestens einen Tag wählen"));
    const f = new FormData(form);
    const row = { title: f.get("title").trim(), category: f.get("category"), days, notes: f.get("notes").trim() || null, active: f.get("active") === "on", priority: getPrio() };
    if (!rt.prayer) {
      row.anchor_prayer = f.get("anchor") || null;
      row.anchor_offset = Number(f.get("anchor_offset") || 15);
      row.at_time = row.anchor_prayer ? null : f.get("at_time") || null;
    }
    const { error } = r.id ? await db.from("routines").update(row).eq("id", r.id) : await db.from("routines").insert(row);
    if (error) return toast(error.message);
    closeSheet(sheet); refresh();
  };
  bindSheetButtons(async () => { await db.from("routines").delete().eq("id", r.id); });
  enhancePickers(form);
  openSheet(sheet);
}

// ---------- Eigene Datums- und Uhrzeitauswahl ----------
// Ersetzt input[type=date|time] durch einen Knopf; der Wert bleibt in einem versteckten Feld mit gleichem Namen.
const picker = $("#picker"), pbody = $("#picker-body");
const fmtPick = (input) => input.dataset.kind === "date"
  ? !input.value ? t("Kein Datum") : fmtDay(input.value, { weekday: "short", day: "numeric", month: "long", year: input.value.slice(0, 4) === String(new Date().getFullYear()) ? undefined : "numeric" })
  : input.value || "–:–";

function enhancePickers(root) {
  root.querySelectorAll('input[type="date"], input[type="time"]').forEach((input) => {
    input.dataset.kind = input.type;
    input.type = "hidden";
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pick pick-${input.dataset.kind}`;
    const paint = () => { b.textContent = fmtPick(input); b.classList.toggle("empty", !input.value); };
    paint();
    b.onclick = () => (input.dataset.kind === "date" ? pickDate : pickTime)(input, paint);
    input.after(b);
  });
}

function pickDate(input, done) {
  const today = new Date();
  let view = new Date((input.value || isoDate(today)) + "T12:00");
  view.setDate(1);
  const set = (iso) => { input.value = iso; done(); closeSheet(picker); };
  const draw = () => {
    const first = (view.getDay() + 6) % 7;
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    let cells = "";
    for (let k = 0; k < first; k++) cells += `<span></span>`;
    for (let d = 1; d <= days; d++) {
      const iso = isoDate(new Date(view.getFullYear(), view.getMonth(), d));
      cells += `<button type="button" data-iso="${iso}" class="${iso === input.value ? "sel" : ""} ${iso === isoDate(today) ? "today" : ""}">${d}</button>`;
    }
    const quick = [["Heute", 0], ["Morgen", 1], ["Übermorgen", 2], ["Nächste Woche", 7]];
    pbody.innerHTML = `<h3>${t("Datum wählen")}</h3>
      <div class="chips quick">${quick.map(([n, k]) => `<button type="button" class="chip" data-iso="${isoDate(addDays(today, k))}">${t(n)}</button>`).join("")}${input.value && !input.required ? `<button type="button" class="chip" data-iso="">${t("Kein Datum")}</button>` : ""}</div>
      <div class="cal-head">
        <button type="button" class="cal-nav" data-m="-1" aria-label="‹">‹</button>
        <b>${view.toLocaleDateString(LOCALE(), { month: "long", year: "numeric" })}</b>
        <button type="button" class="cal-nav" data-m="1" aria-label="›">›</button>
      </div>
      <div class="cal">${DAY_SHORT.map((d) => `<i>${d}</i>`).join("")}${cells}</div>`;
    pbody.querySelectorAll("[data-iso]").forEach((b) => (b.onclick = () => set(b.dataset.iso)));
    pbody.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { view.setMonth(view.getMonth() + Number(b.dataset.m)); draw(); }));
  };
  draw();
  openSheet(picker);
}

function pickTime(input, done) {
  let [h, m] = input.value ? input.value.split(":").map(Number) : [null, null];
  const now = new Date();
  const soon = `${String((now.getHours() + 1) % 24).padStart(2, "0")}:00`;
  const draw = () => {
    pbody.innerHTML = `<h3>${t("Uhrzeit wählen")}</h3>
      <div class="chips quick">${[soon, "08:00", "12:00", "18:00", "20:00"].filter((v, i, a) => a.indexOf(v) === i)
        .map((v) => `<button type="button" class="chip" data-v="${v}">${v}</button>`).join("")}</div>
      <label>${t("Stunde")}</label>
      <div class="grid-pick">${Array.from({ length: 24 }, (_, k) => `<button type="button" data-h="${k}" class="${k === h ? "sel" : ""}">${String(k).padStart(2, "0")}</button>`).join("")}</div>
      <label>${t("Minute")}</label>
      <div class="grid-pick">${Array.from({ length: 12 }, (_, k) => k * 5).map((k) => `<button type="button" data-min="${k}" class="${k === m ? "sel" : ""}">:${String(k).padStart(2, "0")}</button>`).join("")}</div>
      <div class="pick-time-show">${h == null ? "–:–" : `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`}</div>
      <div class="sheet-actions"><button type="button" class="primary" id="pt-ok" ${h == null ? "disabled" : ""}>${t("Übernehmen")}</button></div>
      ${input.required ? "" : `<button type="button" class="ghost" id="pt-clear">${t("Keine Uhrzeit")}</button>`}`;
    pbody.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { input.value = b.dataset.v; done(); closeSheet(picker); }));
    pbody.querySelectorAll("[data-h]").forEach((b) => (b.onclick = () => { h = Number(b.dataset.h); m ??= 0; draw(); }));
    pbody.querySelectorAll("[data-min]").forEach((b) => (b.onclick = () => { m = Number(b.dataset.min); h ??= now.getHours(); draw(); }));
    $("#pt-ok").onclick = () => { input.value = `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`; done(); closeSheet(picker); };
    const clear = $("#pt-clear");
    if (clear) clear.onclick = () => { input.value = ""; done(); closeSheet(picker); };
  };
  draw();
  openSheet(picker);
}

function bindSheetButtons(onDelete) {
  form.querySelector("#cancel").onclick = () => closeSheet(sheet);
  const del = form.querySelector("#del");
  if (del) del.onclick = async () => { if (confirm(t("Wirklich löschen?"))) { await onDelete(); closeSheet(sheet); refresh(); } };
}

// ---------- Training ----------
const training = createTraining({
  db, t, esc, $, toast, openSheet, closeSheet, sheet, form, isoDate, fmtDay, LOCALE,
  // Nach dem Training die Trainings-Routine von heute abhaken
  onFinish: async () => {
    const wd = weekday(new Date());
    const r = state.routines.find((x) => x.active && x.category === "training" && x.days.includes(wd) && /kraft|training|gym|studio|rücken|brust|bein/i.test(x.title));
    if (r) await setRoutineDone(r.id, true, isoDate(new Date()));
  },
});

// ---------- Einkauf ----------
const shopping = createShopping({
  db, t, esc, $, toast, openSheet, closeSheet, sheet, form, LOCALE, fmtDay,
  enhancePickers: (f) => enhancePickers(f),
  lowSupplies: () => lowSupplies(), supplyDays: (x) => supplyDays(x),
  onChange: () => { if (state.view === "heute") renderDay(); },
  onPlanned: () => { state.upcoming = null; refresh(); },
  onScan: () => scanner.open(),
});

// ---------- Tageswerte, Koran, Ramadan, Wasser, Schlaf, Fristen, Rückblick, Scanner ----------
const daylog = createDayLog(db);
const common = { db, t, esc, $, toast, openSheet, closeSheet, sheet, form, fmtDay, LOCALE, enhancePickers: (f) => enhancePickers(f), today: () => isoDate(new Date()), onChange: () => render() };
const glaube = createGlaube({ ...common, daylog, settings: () => state.settings, saveSettings, getPt: () => state.pt });
const wellness = createWellness({ ...common, daylog, settings: () => state.settings, getPt: () => state.pt });
const zikir = createZikir({ ...common, daylog, settings: () => state.settings, saveSettings });
const koran = createKoran({ ...common, glaube });
const deadlines = createDeadlines({ ...common, onChange: () => { state.upcoming = null; refresh(); }, onImport: () => importer.open() });
const importer = createImport({ ...common, deadlines, lang: () => LANG, openItemSheet: (a, b) => openItemSheet(a, b), onChange: () => { state.upcoming = null; refresh(); } });
const review = createReview({ ...common, daylog, routines: () => state.routines, settings: () => state.settings, budget: () => null });
const scanner = createScanner({ ...common, DEMO, onAdd: async (name, res) => {
  const r = await shopping.add([{ name, note: res.verdict === "pruefen" ? t("Zutaten prüfen") : null }]);
  render();
  return r;
} });
const remindSoon = (d) => { const days = Math.round((Date.parse(d.due_date + "T12:00") - Date.now()) / 864e5); return days - (d.notice_months ?? 0) * 30 <= (d.lead_days ?? 30); };
document.addEventListener("click", async (ev) => {
  const f = ev.target.closest("[data-fast]");
  if (f) { const r = await glaube.setFast(f.dataset.fast); toast(r.msg, r.undo); render(); return; }
  if (ev.target.closest("[data-quran-add]")) glaube.openAdd();
});

// Schlafenszeit als Routine, an Fajr gekoppelt (einmalig anlegen; gelöscht bleibt gelöscht)
async function ensureSleepRoutine() {
  const key = "tagesplan-sleep-v1";
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch { return; }
  if (state.routines.some((r) => r.anchor_prayer === "fajr" && (r.anchor_offset ?? 0) < 0)) return;
  await db.from("routines").insert({ title: "Schlafen gehen", category: "schlaf", anchor_prayer: "fajr", anchor_offset: sleepOffset(Number(state.settings?.sleep_hours ?? 7.5)),
    days: [1, 2, 3, 4, 5, 6, 7], prayer: null, at_time: null, notes: "Handy weg, Licht aus. So kommst du ausgeschlafen zu Fajr." });
  refresh();
}
async function updateSleepRoutine() {
  const r = state.routines.find((x) => x.anchor_prayer === "fajr" && (x.anchor_offset ?? 0) < 0);
  if (r) await db.from("routines").update({ anchor_offset: sleepOffset(Number(state.settings?.sleep_hours ?? 7.5)) }).eq("id", r.id);
  await refresh();
}

// Knappe Supplements landen von selbst auf der Einkaufsliste (einmal pro Zählung)
let autoBusy = false;
async function autoSupplies() {
  if (autoBusy || !state.shopLoaded || !state.supplies) return;
  autoBusy = true;
  try {
    const have = new Set((shopping.names() ?? []).map((n) => n.toLowerCase()));
    for (const x of lowSupplies()) {
      const key = `tagesplan-supauto:${x.id}`;
      let mark = null;
      try { mark = localStorage.getItem(key); } catch {}
      if (mark === x.counted_on) continue;
      try { localStorage.setItem(key, x.counted_on); } catch {}
      if (have.has(x.name.toLowerCase())) continue;
      const d = supplyDays(x);
      await shopping.add([{ name: x.name, store: "Online", category: "gesundheit", urgent: d <= 2, note: d <= 0 ? t("Vorrat leer") : t("Vorrat reicht noch {n} Tage", { n: d }) }]);
      toast(t("{x} wird knapp und steht jetzt auf der Einkaufsliste", { x: x.name }));
    }
  } finally { autoBusy = false; }
}

// Offline-Anzeige
function onOutbox(n, res) {
  updateNet();
  if (res?.sent) { toast(t("{n} Änderungen nachgeschickt", { n: res.sent })); refresh(); }
  if (res?.failed) toast(t("{n} Änderungen konnten nicht gespeichert werden", { n: res.failed }));
}
function updateNet() {
  const el = $("#net");
  if (!el) return;
  const off = !db.isOnline(), n = db.pending();
  el.hidden = !off && !n;
  el.textContent = off ? (n ? t("Offline · {n} warten", { n }) : t("Offline")) : t("Sende {n} …", { n });
}
addEventListener("online", () => { updateNet(); db.sync(); });
addEventListener("offline", updateNet);

// ---------- Sprache ----------
const voice = $("#voice");
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, silenceTimer = null;

// Drei Beispiele passend zur Seite
const EXAMPLES = {
  heute: ["Termin morgen um 15 Uhr Zahnarzt", "Asr erledigt", "Ein Glas Wasser", "Koran 5 Seiten gelesen"],
  termine: ["Termin am 20.10. um 14 Uhr Zahnarzt", "Aufgabe Steuer bis Freitag, wichtig", "Brief scannen"],
  plan: ["Täglich um 21 Uhr Buch lesen", "Pausiere Retinol", "Teile die Routinen nach Tageszeit auf"],
  training: ["Starte Training", "Latziehen 50 kg 12 Wiederholungen", "Gewicht 99,5"],
  einkauf: ["Milch, 6 Eier und 500 g Hack auf die Einkaufsliste", "Milch gekauft", "Scanne Barcode"],
  vorrat: ["Magnesium aufgefüllt 60", "Wie lange reicht Magnesium", "Noch 40 Ashwagandha"],
  glaube: ["Koran 5 Seiten gelesen", "Koran-Ziel bis 30. März", "Heute gefastet"],
  koran: ["Sure 36 öffnen", "Sure 2 Ayet 255", "Koran Seite 250 aufschlagen"],
  zikir: ["1000 Zikir gemacht", "Wie viel Zikir heute", "Zikir-Ziel 6000"],
  fristen: ["TÜV am 12.3.2027", "Handyvertrag endet am 1.8.2027 Kündigungsfrist 3 Monate", "Brief scannen"],
  rueckblick: ["Zeig den Wochenrückblick", "Wann soll ich schlafen", "2 Gläser Wasser"],
  mehr: ["Sprich Türkisch", "Dunkler Modus", "Schlafziel 8 Stunden"],
};
const EXAMPLES_TR = {
  heute: ["Yarın saat 15'te diş doktoru randevusu", "İkindiyi kıldım", "Bir bardak su içtim", "Kuran 5 sayfa okudum"],
  termine: ["Yarın saat 15'te diş doktoru randevusu", "Vergi görevi cumaya kadar, önemli", "Belge oku"],
  plan: ["Her gün saat 21'de kitap oku", "Retinol'ü durdur", "Rutinleri vakte göre sırala"],
  training: ["Antrenmana başla", "Lat çekme 50 kilo 12 tekrar", "Kilom 99,5"],
  einkauf: ["Alışveriş listesine süt ve yumurta ekle", "Süt aldım", "Barkod tara"],
  vorrat: ["Magnezyum doldurdum 60", "Magnezyum ne kadar yeter", "40 tane ashwagandha kaldı"],
  glaube: ["Kuran 5 sayfa okudum", "Kuran hatmi 30 mart'a kadar", "Oruç tuttum"],
  koran: ["Yasin suresini aç", "Bakara suresi 255. ayet", "Kuran 250. sayfa aç"],
  zikir: ["1000 zikir çektim", "Bugün ne kadar zikir", "Zikir hedefi 6000"],
  fristen: ["Muayene 12.3.2027", "Telefon sözleşmesi 1.8.2027 fesih süresi 3 ay", "Belge oku"],
  rueckblick: ["Haftalık özeti göster", "Ne zaman yatmalıyım", "2 bardak su"],
  mehr: ["Almancaya geç", "Koyu mod", "Uyku hedefi 8 saat"],
};
function fillExamples() {
  const list = (LANG === "tr" ? EXAMPLES_TR : EXAMPLES)[state.view] ?? EXAMPLES.heute;
  const box = voice.querySelector(".examples");
  box.innerHTML = list.map((x) => `<button type="button">${esc(LANG === "tr" ? x : t(x))}</button>`).join("");
  box.querySelectorAll("button").forEach((b) => (b.onclick = () => { $("#cmd-input").value = b.textContent; showPreview(); }));
}

$("#mic").onclick = () => {
  fillExamples();
  loadUpcoming();
  $("#cmd-input").value = "";
  $("#preview").hidden = true;
  openSheet(voice);
  startListening();
};
$("#voice-help").onclick = () => { stopListening(); voice.close(); openHelp(); };
$("#voice-close").onclick = () => { stopListening(); closeSheet(voice); };
$("#voice-orb").onclick = () => (rec ? stopListening() : startListening());
voice.querySelectorAll(".examples button").forEach((b) => (b.onclick = () => { $("#cmd-input").value = b.textContent; showPreview(); }));
$("#cmd-input").addEventListener("input", showPreview);
$("#cmd-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#cmd-form").requestSubmit(); } });

function startListening() {
  if (!Recognition) {
    $("#voice-state").textContent = t("Tipp ins Feld und nutze das Mikro deiner Tastatur.");
    $("#cmd-input").focus();
    return;
  }
  try {
    rec = new Recognition();
    rec.lang = LOCALE();
    rec.interimResults = true;
    // Weiter zuhören, auch bei kurzen Pausen; erst nach 2,5 s Stille übernehmen
    rec.continuous = true;
    const SILENCE = 2500;
    let said = "";
    const arm = () => {
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => { stopListening(); if ($("#cmd-input").value.trim()) $("#cmd-form").requestSubmit(); }, SILENCE);
    };
    rec.onresult = (e) => {
      let interim = "";
      for (let k = e.resultIndex; k < e.results.length; k++) {
        if (e.results[k].isFinal) said += e.results[k][0].transcript + " ";
        else interim += e.results[k][0].transcript;
      }
      $("#cmd-input").value = (said + interim).replace(/\s+/g, " ").trim();
      showPreview();
      arm();
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") $("#voice-state").textContent = t("Nichts gehört. Nochmal tippen.");
      else if (e.error !== "aborted") { $("#voice-state").textContent = t("Mikro hier nicht verfügbar. Nutze das Mikro deiner Tastatur."); $("#cmd-input").focus(); }
    };
    rec.onend = () => { clearTimeout(silenceTimer); rec = null; $("#voice-orb").classList.remove("listening"); if ($("#voice-state").textContent === t("Ich höre zu …")) $("#voice-state").textContent = t("Tippe zum Sprechen"); };
    rec.start();
    $("#voice-orb").classList.add("listening");
    $("#voice-state").textContent = t("Ich höre zu …");
  } catch { rec = null; }
}
function stopListening() { clearTimeout(silenceTimer); if (rec) rec.stop(); }

// Türkisch zuerst, deutsche Befehle klappen trotzdem
function parseCmd(text, now, cands) {
  if (LANG !== "tr") return parse(text, now, cands);
  const r = parseTr(text, now, cands);
  return r.type === "unbekannt" ? parse(text, now, cands) : r;
}

function candidates() {
  return [...state.entries.filter((e) => !e.done), ...state.open, ...state.entries.filter((e) => e.done)];
}

// Alles, worauf sich ein Befehl beziehen kann: heutige Einträge, Routinen, kommende Termine und Aufgaben
async function loadUpcoming() {
  const { data } = await db.from("items").select("*")
    .gte("on_date", isoDate(addDays(new Date(), -14))).lte("on_date", isoDate(addDays(new Date(), 120))).order("on_date");
  state.upcoming = data ?? [];
}
function targets() {
  const seen = new Set(), out = [];
  const add = (e) => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } };
  [...state.entries, ...state.open].forEach(add);
  (state.upcoming ?? []).forEach((i) => add({ kind: i.kind, id: i.id, title: i.title, done: i.done, raw: i, on_date: i.on_date, priority: i.priority }));
  state.routines.forEach((r) => add({ kind: "routine", id: r.id, title: r.title, prayer: r.prayer, done: false, raw: r, priority: r.priority }));
  return out;
}
const intentOf = (text) => parseIntent(text, new Date(), targets(), LANG, state.supplies ?? [],
  { exercises: training.exercises(), workouts: training.workouts(), running: !!training.active(), shop: shopping.names() });

// Text ohne "jeden Monat" usw. parsen, die Wiederholung hängt sich an Termin oder Aufgabe
function parseFull(text) {
  const r = extractRepeat(text);
  const cmd = parseCmd(r.text || text, new Date(), candidates());
  if (r.repeat && (cmd.type === "termin" || cmd.type === "aufgabe")) cmd.repeat = r.repeat;
  return cmd;
}

function describe(cmd) {
  const x = cmd.target ? cmd.target.title : "";
  if (cmd.type === "hilfe") return [t("Hilfe"), t("Zeigt, was du sagen kannst")];
  if (cmd.type === "sprache") return [t("Sprache"), cmd.lang === "tr" ? "Türkçe" : "Deutsch"];
  if (cmd.type === "theme") return [t("Darstellung"), t({ auto: "Automatisch", light: "Hell", dark: "Dunkel" }[cmd.theme])];
  if (cmd.type === "gruppe") return [t("Routinen"), t(cmd.g === "zeit" ? "Nach Tageszeit" : "Nach Bereich")];
  if (cmd.type === "zeige") return [t("Anzeigen"), cmd.date ? fmtDay(cmd.date, { weekday: "long", day: "numeric", month: "long" }) : t({ heute: "Tag", termine: "Termine", plan: "Routinen", mehr: "Einstellungen", monat: "Monat", verlauf: "Verlauf", vorrat: "Supplement-Vorrat", training: "Training", einkauf: "Einkaufsliste", glaube: "Koran & Ramadan", koran: "Koran lesen", zikir: "Zikir", fristen: "Fristen & Verträge", rueckblick: "Wochenrückblick" }[cmd.view])];
  if (cmd.type === "suche") return [t("Suche"), cmd.q];
  if (cmd.type === "wasser") return [t("Wasser"), cmd.action === "status" ? t("Stand anzeigen") : t("+{n} Gläser ({l} l)", { n: cmd.n, l: wellness.liters(cmd.n) })];
  if (cmd.type === "scan") return [t("Packung scannen"), t("Halal-Prüfung")];
  if (cmd.type === "import") return [t("Dokument"), t("Termine aus Foto, PDF oder Text übernehmen")];
  if (cmd.type === "schlaf") return [t("Schlaf"), cmd.action === "set" ? t("Ziel {n} Std.", { n: cmd.hours }) : t("Schlafenszeit anzeigen")];
  if (cmd.type === "frist") return [t("Frist"), `${cmd.title} · ${fmtDay(cmd.due, { day: "numeric", month: "short", year: "numeric" })}${cmd.notice ? " · " + t("{n} Monate Kündigungsfrist", { n: cmd.notice }) : ""}`];
  if (cmd.type === "zikir") {
    const f = (n) => Number(n).toLocaleString(LOCALE());
    if (cmd.action === "add") return [t("Zikir"), "+" + f(cmd.n)];
    if (cmd.action === "set") return [t("Zikir"), t("Tagesstand {n}", { n: f(cmd.n) })];
    if (cmd.action === "goal") return [t("Zikir-Tagesziel"), f(cmd.n)];
    return [t("Zikir"), t("Stand anzeigen")];
  }
  if (cmd.type === "glaube") {
    if (cmd.action === "pages") return [t("Koran"), t("+{n} Seiten", { n: cmd.pages })];
    if (cmd.action === "page") return [t("Koran"), t("Seite {p}", { p: cmd.page })];
    if (cmd.action === "goal") return [t("Koran-Ziel"), fmtDay(cmd.target, { day: "numeric", month: "long", year: "numeric" })];
    if (cmd.action === "status") return [t("Koran"), t("Stand anzeigen")];
    if (cmd.action === "fast") return [t("Fasten"), t({ ja: "Gefastet", nein: "Nicht gefastet", nachholen: "Nachgeholt" }[cmd.value])];
    if (cmd.action === "ramadan") return [t("Ramadan-Modus"), t({ an: "An", aus: "Aus", auto: "Automatisch" }[cmd.mode])];
  }
  if (cmd.type === "einkauf") {
    const names = (cmd.items ?? []).map((x) => x.name + (x.qty ? ` (${x.qty})` : "")).join(", ");
    if (cmd.action === "show") return [t("Anzeigen"), t("Einkaufsliste")];
    if (cmd.action === "share") return [t("Teilen"), t("Einkaufsliste")];
    if (cmd.action === "budget") return [t("Budget für Einkäufe"), cmd.amount.toLocaleString(LOCALE(), { style: "currency", currency: "EUR" })];
    if (cmd.action === "finish") return [t("Einkauf abschließen"), cmd.amount != null ? cmd.amount.toLocaleString(LOCALE(), { style: "currency", currency: "EUR" }) : t("ohne Betrag")];
    const by = cmd.items?.[0]?.need_by ? " · " + t("bis {d}", { d: fmtDay(cmd.items[0].need_by, { weekday: "short" }) }) : "";
    return [t({ add: "Auf die Einkaufsliste", check: "Im Wagen", remove: "Von der Liste streichen" }[cmd.action]), (cmd.items?.some((x) => x.urgent) ? "❗ " : "") + names + by];
  }
  if (cmd.type === "training") {
    if (cmd.action === "start") return [t("Training"), t("Starten") + (cmd.workout ? ": " + cmd.workout.name : "")];
    if (cmd.action === "stop") return [t("Training"), t("Beenden")];
    if (cmd.action === "analysis") return [t("Training"), t("Analyse")];
    if (cmd.action === "resume") return [t("Training"), t("Fortsetzen")];
    if (cmd.action === "body") return [t("Körper"), [cmd.weight_kg != null ? fmtNum(cmd.weight_kg) + " kg" : "", cmd.waist_cm != null ? t("Bauch") + " " + fmtNum(cmd.waist_cm) + " cm" : ""].filter(Boolean).join(" · ")];
    if (cmd.action === "remove") return [t("Übung entfernen"), cmd.exercise.name];
    if (cmd.action === "move") return [t(cmd.dir === "first" ? "Als Nächstes" : "Ans Ende"), cmd.exercise.name];
    return [t("Satz"), `${cmd.exercise?.name ?? t("letzte Übung")} · ${cmd.sets > 1 ? cmd.sets + " × " : ""}${cmd.kg != null ? fmtNum(cmd.kg) + " kg" : ""}${cmd.reps != null ? " × " + cmd.reps : ""}${cmd.rir != null ? " · " + t("{n} übrig", { n: cmd.rir }) : ""}`];
  }
  if (cmd.type === "vorrat") {
    const name = cmd.supply?.name ?? cmd.name;
    if (cmd.mode === "info") return [t("Vorrat"), name];
    return [t(cmd.mode === "add" ? "Auffüllen" : "Bestand"), `${name} · ${cmd.mode === "add" ? "+" : ""}${fmtNum(cmd.amount)}${cmd.supply ? "" : " · " + t("neu")}`];
  }
  if (cmd.type === "detail") return [t("Anzeigen"), x];
  if (cmd.type === "loeschen") return [t("Löschen"), x];
  if (cmd.type === "offen") return [t("Wieder öffnen"), x];
  if (cmd.type === "verschieben") return [t("Verschieben"), `${x} → ${[cmd.date ? fmtDay(cmd.date) : "", cmd.time ?? ""].filter(Boolean).join(" · ")}`];
  if (cmd.type === "pause") return [t(cmd.active ? "Aktivieren" : "Pausieren"), x];
  if (cmd.type === "prio") return [t("Priorität"), `${x} · ${t(cmd.priority === "hoch" ? "Wichtig" : "Normal")}`];
  if (cmd.type === "erinnerung") return [t("Erinnerung"), `${x} · ${cmd.minutes >= 60 ? t("{n} Std. vorher", { n: cmd.minutes / 60 }) : t("{n} Min. vorher", { n: cmd.minutes })}`];
  if (cmd.type === "checkliste") return [t("Checkliste"), `${x} + ${cmd.item}`];
  if (cmd.type === "erledigt") return [t("Abhaken"), cmd.match.title];
  if (cmd.type === "routine") return [t("Neue Routine"), `${cmd.title} · ${cmd.days.length === 7 ? t("täglich") : cmd.days.map((d) => DAY_SHORT[d - 1]).join(", ")}${cmd.time ? " · " + cmd.time : ""}`];
  if ((cmd.type === "termin" || cmd.type === "aufgabe") && extractPrio(cmd.title).priority) {
    const d = describe({ ...cmd, title: extractPrio(cmd.title).title });
    return [d[0], d[1] + " · " + t("Wichtig")];
  }
  const rp = cmd.repeat ? ` · ↻ ${t(REPEATS[cmd.repeat])}` : "";
  if (cmd.type === "termin") return [t("Termin"), `${cmd.title} · ${fmtDay(cmd.date)}${cmd.time ? " · " + cmd.time : ""}${cmd.end ? "–" + cmd.end : ""}${cmd.location ? " · " + cmd.location : ""}${rp}`];
  if (cmd.type === "aufgabe") return [t("Aufgabe"), `${cmd.title} · ${t("fällig {d}", { d: fmtDay(cmd.date) })}${cmd.time ? " · " + cmd.time : ""}${rp}`];
  return null;
}

function showPreview() {
  const v = $("#cmd-input").value.trim();
  const p = $("#preview");
  if (!v) { p.hidden = true; return; }
  const d = describe(intentOf(v) ?? parseFull(v));
  p.hidden = !d;
  if (d) p.innerHTML = `<b>${d[0]}</b>${esc(d[1])}`;
}

$("#cmd-form").onsubmit = async (e) => {
  e.preventDefault();
  const v = $("#cmd-input").value.trim();
  if (!v) return;
  closeSheet(voice);
  await runCommand(v);
};

async function runCommand(text) {
  if (!state.upcoming) await loadUpcoming();
  const intent = intentOf(text);
  if (intent) return runIntent(intent);
  const cmd = parseFull(text);

  if (cmd.type === "erledigt") {
    const e = cmd.match;
    const date = e.kind === "routine" ? isoDate(state.day) : null;
    if (e.kind === "routine") await setRoutineDone(e.id, true, date);
    else await setItemDone(e.id, true);
    toast(t("Abgehakt: {x}", { x: e.title }), async () => {
      if (e.kind === "routine") await setRoutineDone(e.id, false, date);
      else await setItemDone(e.id, false);
      refresh();
    });
  } else if (cmd.type === "routine") {
    const { data, error } = await db.from("routines").insert({ title: cmd.title, days: cmd.days, at_time: cmd.time, category: cmd.category }).select().single();
    if (error) return toast(error.message);
    toast(t("Routine angelegt: {x}", { x: cmd.title }), async () => { await db.from("routines").delete().eq("id", data.id); refresh(); });
  } else if (cmd.type === "termin" || cmd.type === "aufgabe") {
    // "… wichtig" macht den Eintrag gleich zu hoher Priorität
    const p = extractPrio(cmd.title);
    cmd.title = p.title;
    const row = { kind: cmd.type, title: cmd.title, on_date: cmd.date, start_time: cmd.time, end_time: cmd.end, priority: p.priority ?? "normal", location: cmd.location ?? null,
      repeat: cmd.repeat ?? null, series_id: cmd.repeat ? crypto.randomUUID() : null };
    const { data, error } = await db.from("items").insert(row).select().single();
    if (error) return toast(error.message);
    toast(`${t(cmd.type === "termin" ? "Termin" : "Aufgabe")}: ${cmd.title}, ${fmtDay(cmd.date)}${cmd.time ? " " + cmd.time : ""}${cmd.repeat ? " ↻" : ""}`, async () => {
      await db.from("items").delete().eq("id", data.id);
      refresh();
    });
  } else {
    const r = extractRepeat(text);
    openItemSheet({}, { title: r.text || text, repeat: r.repeat });
    return;
  }
  refresh();
}

// Befehle, die vorhandene Einträge ändern oder etwas anzeigen; jede Änderung lässt sich rückgängig machen
async function runIntent(c) {
  const e = c.target, raw = e?.raw ?? {};
  const table = e?.kind === "routine" ? "routines" : "items";
  const update = async (patch, msg) => {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, raw[k] ?? null]));
    const { error } = await db.from(table).update(patch).eq("id", e.id);
    if (error) return toast(error.message);
    Object.assign(raw, patch);
    toast(msg, async () => { await db.from(table).update(before).eq("id", e.id); Object.assign(raw, before); refresh(); });
    state.upcoming = null;
    refresh();
  };

  switch (c.type) {
    case "hilfe": return openHelp();
    case "sprache":
      setLang(c.lang); $("#view-termine").innerHTML = ""; render(); saveSettings({ lang: LANG });
      return toast(c.lang === "tr" ? "Dil: Türkçe" : "Sprache: Deutsch");
    case "theme":
      setTheme(c.theme);
      return toast(t({ auto: "Automatisch", light: "Hell", dark: "Dunkel" }[c.theme]));
    case "gruppe":
      setPlanGroup(c.g); switchView("plan");
      return toast(t(c.g === "zeit" ? "Routinen nach Tageszeit sortiert" : "Routinen nach Bereich sortiert"));
    case "zeige":
      if (c.date) state.day = new Date(c.date + "T12:00");
      if (c.view === "monat" || c.view === "verlauf") { state.termMode = c.view === "monat" ? "monat" : "verlauf"; state.search = ""; return switchView("termine"); }

      if (c.view === "termine") state.termMode = "liste";
      return switchView(c.view);
    case "training": {
      if (state.view !== "training") switchView("training");
      const msg = await training.runVoice(c);
      if (msg) toast(msg);
      return;
    }
    case "einkauf": {
      if (state.view !== "einkauf") switchView("einkauf");
      const r = await shopping.runVoice(c);
      if (r?.msg) toast(r.msg, r.undo ? async () => { await r.undo(); render(); } : null);
      return;
    }
    case "wasser": {
      if (c.action === "status") { const n = daylog.get(isoDate(new Date())).water ?? 0; return toast(t("Wasser: {n} von {g} Gläsern ({l} l)", { n, g: wellness.goal(), l: wellness.liters(n) })); }
      const r = await wellness.addWater(c.n);
      toast(r.msg, async () => { await r.undo(); render(); });
      return render();
    }
    case "zikir": {
      const r = await zikir.runVoice(c);
      if (r?.msg) toast(r.msg, r.undo ? async () => { await r.undo(); render(); } : null);
      return render();
    }
    case "koran": {
      const r = await koran.open(c);
      if (state.view === "koran") render(); else switchView("koran");
      if (r?.msg) toast(r.msg);
      return;
    }
    case "glaube": {
      const r = await glaube.runVoice(c);
      if (r?.msg) toast(r.msg, r.undo ? async () => { await r.undo(); render(); } : null);
      return render();
    }
    case "schlaf": {
      if (c.action === "set") { await saveSettings({ sleep_hours: Math.min(12, Math.max(4, c.hours)) }); await updateSleepRoutine(); }
      const p = wellness.sleep();
      return toast(p ? t("Schlafenszeit {b}, aufstehen {w} vor Fajr", { b: p.bed, w: p.wake }) : t("Für die Schlafenszeit einmal den Standort setzen."));
    }
    case "scan":
      if (state.view !== "einkauf") switchView("einkauf");
      return scanner.open();
    case "import":
      return importer.open();
    case "frist": {
      if (state.view !== "fristen") switchView("fristen");
      const r = await deadlines.runVoice(c);
      if (r?.msg) toast(r.msg, r.undo ?? null);
      state.upcoming = null;
      return refresh();
    }
    case "suche":
      state.search = c.q;
      return switchView("termine");
    case "vorrat": {
      let x = c.supply;
      if (c.mode === "info") return toast(`${x.name}: ${fmtNum(supplyLeft(x))} ${t(x.unit)} · ${supplyDays(x) <= 0 ? t("leer") : t("reicht {n} Tage", { n: supplyDays(x) })}`);
      if (!x) {
        const { data, error } = await db.from("supplies").insert({ name: c.name, stock: 0, per_day: 1, counted_on: isoDate(new Date()) }).select().single();
        if (error) return toast(error.message);
        x = data;
      }
      return refillSupply(x, c.amount, c.mode);
    }
    case "detail": return openDetail(e);
    case "offen":
      if (e.kind === "routine") { await setRoutineDone(e.id, false); refresh(); return toast(t("Wieder offen: {x}", { x: e.title }), async () => { await setRoutineDone(e.id, true); refresh(); }); }
      await setItemDone(e.id, false); refresh();
      return toast(t("Wieder offen: {x}", { x: e.title }), async () => { await setItemDone(e.id, true); refresh(); });
    case "loeschen":
      return deleteEntry(e.kind, e.id, e.kind === "routine" ? undefined : raw);
    case "verschieben": {
      if (e.kind === "routine") {
        if (!c.time) return toast(t("Für Routinen bitte eine Uhrzeit sagen."));
        if (raw.prayer) return toast(t("Gebetszeiten kommen automatisch."));
        return update({ at_time: c.time, anchor_prayer: null }, t("{x} jetzt um {t}", { x: e.title, t: c.time }));
      }
      const patch = {};
      if (c.date) patch.on_date = c.date;
      if (c.time) patch.start_time = c.time;
      if (c.end) patch.end_time = c.end;
      return update(patch, t("Verschoben: {x}", { x: e.title }) + ` → ${[c.date ? fmtDay(c.date) : "", c.time ?? ""].filter(Boolean).join(" ")}`);
    }
    case "pause": return update({ active: c.active }, t(c.active ? "Aktiviert: {x}" : "Pausiert: {x}", { x: e.title }));
    case "prio": return update({ priority: c.priority }, t(c.priority === "hoch" ? "Wichtig: {x}" : "Normal: {x}", { x: e.title }));
    case "erinnerung": return update({ remind_before: c.minutes }, `${t("Erinnerung")}: ${e.title} · ${c.minutes >= 60 ? t("{n} Std. vorher", { n: c.minutes / 60 }) : t("{n} Min. vorher", { n: c.minutes })}`);
    case "checkliste": return update({ checklist: [...(raw.checklist ?? []), { t: c.item, d: false }] }, t("{y} auf {x}", { x: e.title, y: c.item }));
  }
}

// ---------- Nach links wischen: Löschen-Knopf ----------
const SWIPE_W = 92;
let swipe = null, swOpen = null;
function closeSwipe() {
  if (!swOpen) return;
  const el = swOpen;
  el.style.transform = "";
  setTimeout(() => el._del?.remove(), 200);
  swOpen = null;
}
function delButton(el) {
  if (el._del?.isConnected) return el._del;
  const host = el.parentElement;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "swipe-del";
  b.textContent = t("Löschen");
  b.style.top = el.offsetTop + "px";
  b.style.height = el.offsetHeight + "px";
  b.onclick = (ev) => { ev.stopPropagation(); const [kind, id] = el.dataset.swipe.split(":"); closeSwipe(); deleteEntry(kind, id); };
  host.insertBefore(b, el);
  el._del = b;
  return b;
}
document.addEventListener("touchstart", (e) => {
  const el = e.target.closest("[data-swipe]");
  if (swOpen && el !== swOpen && !e.target.closest(".swipe-del")) closeSwipe();
  if (!el) { swipe = null; return; }
  swipe = { el, x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0, dir: null, base: el === swOpen ? -SWIPE_W : 0 };
}, { passive: true });
document.addEventListener("touchmove", (e) => {
  if (!swipe) return;
  const dx = e.touches[0].clientX - swipe.x0, dy = e.touches[0].clientY - swipe.y0;
  if (!swipe.dir && Math.abs(dx) + Math.abs(dy) > 8) swipe.dir = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  if (swipe.dir !== "x") return;
  e.preventDefault();
  swipe.dx = dx;
  delButton(swipe.el);
  swipe.el.style.transition = "none";
  swipe.el.style.transform = `translateX(${Math.min(0, Math.max(-SWIPE_W - 30, swipe.base + dx))}px)`;
}, { passive: false });
document.addEventListener("touchend", () => {
  if (!swipe) return;
  const { el, dir, dx, base } = swipe;
  swipe = null;
  if (dir !== "x") return;
  el.style.transition = "";
  if (base + dx < -SWIPE_W / 2) { el.style.transform = `translateX(-${SWIPE_W}px)`; swOpen = el; el._swiped = Date.now(); }
  else { swOpen = el; closeSwipe(); el._swiped = Date.now(); }
});
// Nach einem Wisch nicht gleichzeitig die Details öffnen
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-swipe]");
  if (el && (el === swOpen || Date.now() - (el._swiped ?? 0) < 400)) { e.stopPropagation(); e.preventDefault(); if (el === swOpen) closeSwipe(); }
}, true);

async function deleteEntry(kind, id, given) {
  const isRoutine = kind === "routine";
  const raw = isRoutine ? state.routines.find((r) => r.id === id) : given ?? findEntry(id)?.raw ?? findEntry(id) ?? (state.upcoming ?? []).find((i) => i.id === id);
  if (!raw) return;
  if (isRoutine) {
    if (!confirm(t("Routine „{x}“ ganz löschen?", { x: raw.title }))) return;
    const { error } = await db.from("routines").delete().eq("id", id);
    if (error) return toast(error.message);
    if (sheet.open) closeSheet(sheet);
    toast(t("Gelöscht: {x}", { x: raw.title }), async () => { await db.from("routines").insert(raw); refresh(); });
    return refresh();
  }
  const undo = await removeItem(raw);
  if (!undo) return;
  if (sheet.open) closeSheet(sheet);
  state.upcoming = null;
  toast(t("Gelöscht: {x}", { x: raw.title }), async () => { await undo(); refresh(); });
  refresh();
}

// Nächstes Datum einer Serie ab heute
function nextOf(raw) {
  const today = isoDate(new Date());
  const step = (k) => { const d = new Date(raw.on_date + "T12:00"), day = d.getDate();
    if (raw.repeat === "taeglich") d.setDate(day + k);
    else if (raw.repeat === "woechentlich") d.setDate(day + 7 * k);
    else { d.setDate(1); d.setMonth(d.getMonth() + (raw.repeat === "monatlich" ? k : 12 * k)); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    return isoDate(d); };
  let k = 1, nd;
  do nd = step(k++); while (nd < today && k < 5000);
  const { id, created_at, done_at, ...rest } = raw;
  return { ...rest, on_date: nd, done: false, checklist: (raw.checklist ?? []).map((c) => ({ ...c, d: false })) };
}

// Löscht einen Eintrag; bei Serien wird gefragt: nur diesen oder auch alle künftigen. Gibt eine Rückgängig-Funktion zurück.
async function removeItem(raw) {
  if (!raw.series_id || !raw.repeat) {
    const { error } = await db.from("items").delete().eq("id", raw.id);
    if (error) { toast(error.message); return null; }
    return async () => { await db.from("items").insert(raw); };
  }
  const choice = await askSeries(raw);
  if (!choice) return null;
  const { data: rows } = await db.from("items").select("*").eq("series_id", raw.series_id);
  if (choice === "one") {
    let added = null;
    if (!(rows ?? []).some((r) => r.on_date > raw.on_date)) ({ data: added } = await db.from("items").insert(nextOf(raw)).select().single());
    await db.from("items").delete().eq("id", raw.id);
    return async () => { if (added) await db.from("items").delete().eq("id", added.id); await db.from("items").insert(raw); };
  }
  const gone = (rows ?? []).filter((r) => r.id === raw.id || (!r.done && r.on_date >= raw.on_date));
  for (const r of gone) await db.from("items").delete().eq("id", r.id);
  await db.from("items").update({ repeat: null }).eq("series_id", raw.series_id);
  return async () => { for (const r of gone) await db.from("items").insert(r); await db.from("items").update({ repeat: raw.repeat }).eq("series_id", raw.series_id); };
}

function askSeries(raw) {
  return new Promise((resolve) => {
    let answered = false;
    form.innerHTML = `<h3>${t("Wiederkehrender Eintrag")}</h3>
      <p class="small muted">${esc(raw.title)} · ${t(REPEATS[raw.repeat])}</p>
      <button type="button" class="primary" data-a="one">${t("Nur diesen löschen")}</button>
      <button type="button" class="ghost danger" data-a="all">${t("Diesen und alle künftigen")}</button>
      <button type="button" class="ghost" data-a="">${t("Abbrechen")}</button>`;
    form.onsubmit = (e) => e.preventDefault();
    form.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { answered = true; resolve(b.dataset.a || null); if (!b.dataset.a) closeSheet(sheet); }));
    sheet.addEventListener("close", () => { if (!answered) resolve(null); }, { once: true });
    openSheet(sheet);
  });
}

// Hilfe: was die Sprachsteuerung versteht, mit Beispielen zum Antippen
const HELP = {
  de: [
    ["Anlegen", ["Termin am 20.10. um 14 Uhr Zahnarzt Ort Praxis Müller Neuwied", "Aufgabe Steuer bis Freitag, wichtig", "Täglich um 21 Uhr Buch lesen", "Jeden Monat Miete überweisen am 1.", "Termin jedes Jahr am 5. März Geburtstag Mama"]],
    ["Abhaken", ["Asr erledigt", "Asr doch nicht erledigt"]],
    ["Ändern", ["Verschiebe Zahnarzt auf Freitag um 10", "Mach Steuer wichtig", "Pausiere Retinol", "Erinnere mich 30 Minuten vorher an Zahnarzt", "Füge Milch zur Einkaufsliste hinzu", "Lösche den Termin Zahnarzt"]],
    ["Anzeigen", ["Was steht morgen an", "Zeig mir die Termine", "Zeig den Monat", "Was habe ich erledigt", "Suche Zahnarzt", "Teile die Routinen nach Tageszeit auf", "Öffne die Einstellungen"]],
    ["Training", ["Starte Training", "Starte Brusttraining", "Starte Beintag", "Hammer Curls 14 kg 12 Wiederholungen", "Latziehen breit 50 kg 12 Wiederholungen", "3x12 mit 30 kg Seil nach unten", "40 kg 10 mal", "Seitstütz 45 Sekunden", "Laufband 10 Minuten Steigung 10", "Latziehen 50 kg 10 Wiederholungen 2 übrig", "Gewicht 99,5", "Bauchumfang 104", "Face Pulls entfernen", "Face Pulls als Nächstes", "Hyperextensions ans Ende", "Zeig die Analyse", "Training beenden", "Training fortsetzen"]],
    ["Einkauf", ["Milch, 6 Eier und 500 g Hack auf die Einkaufsliste", "Wir brauchen Brot", "Milch gekauft", "Streich Skyr von der Einkaufsliste", "Was muss ich einkaufen", "Einkauf abschließen 45 Euro", "Dringend Brot auf die Einkaufsliste", "Milch bis Samstag auf die Einkaufsliste", "Einkaufsbudget 400 Euro", "Einkaufsliste teilen", "Öffne Einkauf"]],
    ["Vorrat", ["Magnesium aufgefüllt 60", "Noch 40 Ashwagandha", "Wie lange reicht Magnesium", "Zeig den Vorrat"]],
    ["Wasser und Schlaf", ["Ein Glas Wasser", "2 Gläser Wasser getrunken", "Halber Liter Wasser", "Wie viel Wasser habe ich getrunken", "Wann soll ich schlafen", "Schlafziel 8 Stunden"]],
    ["Koran und Ramadan", ["Koran 5 Seiten gelesen", "Ein Juz gelesen", "Ich bin bei Seite 245 im Koran", "Koran-Ziel bis 30. März", "Heute gefastet", "Nicht gefastet", "Fasten nachgeholt", "Ramadan-Modus an", "Zeig Koran"]],
    ["Fristen", ["TÜV am 12.3.2027", "Handyvertrag endet am 1.8.2027 Kündigungsfrist 3 Monate", "Personalausweis läuft am 5.6.2029 ab", "Kfz-Versicherung 1.1.2027", "Öffne Fristen"]],
    ["Scanner und Rückblick", ["Scanne Barcode", "Ist das halal", "Brief scannen", "Termin aus PDF übernehmen", "Zeig den Wochenrückblick"]],
    ["Einstellungen", ["Sprich Türkisch", "Dunkler Modus", "Heller Modus"]],
  ],
  tr: [
    ["Ekle", ["Yarın saat 15'te diş doktoru randevusu yer Müller muayenehanesi", "Vergi görevi cumaya kadar, önemli", "Her gün saat 21'de kitap oku", "Her ay ayın 1'inde kira öde"]],
    ["İşaretle", ["İkindiyi kıldım", "İkindiyi kılmadım"]],
    ["Değiştir", ["Diş doktorunu cumaya ertele", "Vergi önemli", "Retinol'ü durdur", "Diş doktoru için 1 saat önce hatırlat", "Alışveriş listesine süt ekle", "Diş doktoru randevusunu sil"]],
    ["Göster", ["Yarın neler var", "Randevuları göster", "Aylık görünüm", "Geçmişi göster", "Diş doktoru bul", "Rutinleri vakte göre sırala", "Ayarları aç"]],
    ["Antrenman", ["Antrenmana başla", "Göğüs antrenmanını başlat", "Bacak omuz antrenmanını başlat", "Çekiç curl 14 kilo 12 tekrar", "Lat çekme geniş 50 kilo 12 tekrar", "Triseps halat aşağı 3 set 12 tekrar 30 kilo", "Koşu bandı 10 dakika eğim 10", "Lat çekme 50 kilo 10 tekrar 2 yedek", "Kilom 99,5", "Bel çevresi 104", "Face Pull çıkar", "Face Pull'u öne al", "Hiperekstansiyonu sona al", "Antrenman analizi", "Antrenmanı bitir", "Antrenmana devam et"]],
    ["Alışveriş", ["Alışveriş listesine süt ve yumurta ekle", "Ekmek lazım", "Süt aldım", "Alışveriş listesinden sütü sil", "Alışveriş listesini göster", "Alışverişi bitir 45 euro", "Acil ekmek lazım", "Alışveriş listesine cumartesiye kadar süt ekle", "Alışveriş bütçesi 400", "Alışveriş listesini paylaş"]],
    ["Stok", ["Magnezyum doldurdum 60", "40 tane ashwagandha kaldı", "Magnezyum ne kadar yeter", "Stoku göster"]],
    ["Su ve uyku", ["Bir bardak su içtim", "2 bardak su", "Yarım litre su", "Ne kadar su içtim", "Ne zaman yatmalıyım", "Uyku hedefi 8 saat"]],
    ["Kuran ve Ramazan", ["Kuran 5 sayfa okudum", "Bir cüz okudum", "Kuran 245. sayfadayım", "Kuran hatmi 30 mart'a kadar", "Oruç tuttum", "Oruç tutmadım", "Kaza orucu tuttum", "Ramazan modunu aç", "Kuran'ı göster"]],
    ["Süreler", ["Muayene 12.3.2027", "Telefon sözleşmesi 1.8.2027 fesih süresi 3 ay", "Kimlik 5.6.2029'da bitiyor", "Süreleri göster"]],
    ["Tarayıcı ve özet", ["Barkod tara", "Helal mi", "Belge oku", "Mektubu tara", "Haftalık özeti göster"]],
    ["Ayarlar", ["Almancaya geç", "Koyu mod", "Açık mod"]],
  ],
};
function openHelp() {
  form.innerHTML = `<h3>${t("Das verstehe ich")}</h3>
    ${HELP[LANG].map(([h, list]) => `<p class="eyebrow" style="margin-top:14px">${h}</p>
      <div class="help-list">${list.map((x) => `<button type="button" class="chip" data-say="${esc(x)}">${esc(x)}</button>`).join("")}</div>`).join("")}`;
  form.onsubmit = (ev) => ev.preventDefault();
  form.querySelectorAll("[data-say]").forEach((b) => (b.onclick = () => {
    sheet.close();
    $("#cmd-input").value = b.dataset.say;
    $("#preview").hidden = true;
    openSheet(voice);
    showPreview();
  }));
  openSheet(sheet);
}

// Auge: Passwort ein- und ausblenden
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-eye]");
  if (!b) return;
  const input = b.parentElement.querySelector("input");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  b.classList.toggle("on", show);
  b.setAttribute("aria-label", t(show ? "Passwort verbergen" : "Passwort anzeigen"));
});

// ---------- Hinweis ----------
let toastTimer;
function toast(msg, undo) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button>${t("Rückgängig")}</button>` : ""}`;
  // Als Popover liegt der Hinweis auch über offenen Blättern (die sonst alles verdecken)
  const hide = () => { el.hidden = true; try { el.hidePopover?.(); } catch {} };
  el.hidden = false;
  try { el.hidePopover?.(); el.showPopover?.(); } catch {}
  if (undo) el.querySelector("button").onclick = () => { hide(); undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, undo ? 6000 : 3000);
}

document.addEventListener("visibilitychange", () => { if (document.hidden) zikir.flush(); if (!document.hidden && state.user) refresh(); if (!document.hidden) checkVersion(); });

// ---------- Hell / Dunkel ----------
let themePref = "auto";
try { themePref = localStorage.getItem("tagesplan-theme") || "auto"; } catch {}
const darkMQ = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const dark = themePref === "dark" || (themePref === "auto" && darkMQ.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#071F26" : "#F4F7F6";
}
function setTheme(p) {
  themePref = p;
  try { localStorage.setItem("tagesplan-theme", p); } catch {}
  applyTheme();
}
darkMQ.addEventListener?.("change", applyTheme);
applyTheme();

// ---------- App-Sperre mit Face ID (WebAuthn, nur auf diesem Gerät) ----------
const LOCK_KEY = "tagesplan-lock";
const LOCK_AFTER = 60 * 1000;
const lockId = () => { try { return localStorage.getItem(LOCK_KEY); } catch { return null; } };
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

async function toggleLock() {
  if (lockId()) {
    try { localStorage.removeItem(LOCK_KEY); } catch {}
    toast(t("App-Sperre aus"));
    return renderMehr();
  }
  try {
    if (!window.PublicKeyCredential || !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return toast(t("Face ID ist hier nicht verfügbar."));
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: "Tagesplan" }, challenge: rand(32),
      user: { id: rand(16), name: state.user?.email ?? "tagesplan", displayName: "Tagesplan" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000,
    } });
    localStorage.setItem(LOCK_KEY, b64u(cred.rawId));
    toast(t("App-Sperre an"));
  } catch (e) { toast(t("Face ID wurde nicht eingerichtet.")); }
  renderMehr();
}

function showLock() {
  if (!lockId() || $("#lock")) return;
  document.documentElement.classList.add("locked");
  const el = document.createElement("div");
  el.id = "lock";
  el.innerHTML = `<img src="ems-mark.png" alt="" width="64" height="64">
    <h2>${t("Tagesplan ist gesperrt")}</h2>
    <button class="primary" id="unlock">${t("Mit Face ID entsperren")}</button>
    <button class="ghost" id="lock-reset">${t("Mit Passwort neu anmelden")}</button>`;
  document.body.append(el);
  $("#unlock").onclick = unlock;
  $("#lock-reset").onclick = async () => {
    try { localStorage.removeItem(LOCK_KEY); } catch {}
    hideLock();
    await db.auth.signOut();
  };
  unlock();
}
function hideLock() { $("#lock")?.remove(); document.documentElement.classList.remove("locked"); }
let unlocking = false;
async function unlock() {
  if (unlocking) return;
  unlocking = true;
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: rand(32), allowCredentials: [{ type: "public-key", id: unb64u(lockId()) }], userVerification: "required", timeout: 60000,
    } });
    hideLock();
  } catch {} finally { unlocking = false; }
}
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (lockId() && Date.now() - hiddenAt > LOCK_AFTER) showLock();
});
showLock();

// ---------- Homescreen-Widget (Scriptable) ----------
function widgetScript(url) {
  return `// Tagesplan-Widget: nächstes Gebet und nächste Aufgabe
const URL_ = ${JSON.stringify(url)};
let d = null;
try { d = await new Request(URL_).loadJSON(); } catch (e) {}
const w = new ListWidget();
const g = new LinearGradient();
g.colors = [new Color("#1F7A8C"), new Color("#0B3D4A")]; g.locations = [0, 1];
w.backgroundGradient = g;
w.url = "https://xnomercy.github.io/ems-tagesplan/";
w.setPadding(14, 16, 14, 16);
const head = w.addText("Tagesplan"); head.textColor = new Color("#51B8C4"); head.font = Font.heavySystemFont(12);
w.addSpacer(8);
function line(label, value, sub) {
  const l = w.addText(label); l.textColor = new Color("#B9DCE2"); l.font = Font.semiboldSystemFont(11);
  const v = w.addText(value); v.textColor = Color.white(); v.font = Font.boldSystemFont(16); v.lineLimit = 1; v.minimumScaleFactor = 0.7;
  if (sub) { const s = w.addText(sub); s.textColor = new Color("#B9DCE2"); s.font = Font.systemFont(11); s.lineLimit = 1; }
  w.addSpacer(6);
}
if (!d) line("Offline", "–");
else {
  if (d.prayer) line(d.prayer.label, d.prayer.name + " " + d.prayer.time, d.prayer.in);
  if (d.task) line(d.task.label, d.task.title, d.task.when);
  if (d.ramadan) line(d.ramadan.label, d.ramadan.iftar);
}
w.addSpacer();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
Script.setWidget(w);
if (config.runsInApp) await w.presentMedium();
Script.complete();
`;
}
function openWidgetSetup() {
  const url = `${SUPABASE_URL}/functions/v1/widget?token=${state.settings?.calendar_token}&lang=${LANG}`;
  form.innerHTML = `<h3>${t("Widget einrichten")}</h3>
    <ol class="steps">
      <li>${t("Lade die kostenlose App Scriptable aus dem App Store.")}</li>
      <li>${t("Kopier das Skript und füge es in Scriptable mit + als neues Skript ein. Name: Tagesplan.")}</li>
      <li>${t("Homescreen lange drücken, + tippen, Scriptable wählen, mittleres Widget hinzufügen.")}</li>
      <li>${t("Widget antippen und als Skript Tagesplan wählen.")}</li>
    </ol>
    <div class="sheet-actions"><button type="button" class="primary" id="w-copy">${t("Skript kopieren")}</button></div>
    <button type="button" class="btn" id="w-link">${t("Nur den Link kopieren (für Kurzbefehle)")}</button>
    <p class="small muted">${t("Der Link enthält deinen geheimen Kalender-Schlüssel. Nicht weitergeben.")}</p>`;
  form.onsubmit = (e) => e.preventDefault();
  form.querySelector("#w-copy").onclick = () => navigator.clipboard.writeText(widgetScript(url)).then(() => toast(t("Skript kopiert")), () => toast(t("Kopieren nicht möglich")));
  form.querySelector("#w-link").onclick = () => navigator.clipboard.writeText(url + "&format=text").then(() => toast(t("Link kopiert")));
  openSheet(sheet);
}

// ---------- Daten exportieren ----------
async function exportData() {
  const names = ["routines", "items", "completions", "supplies", "exercises", "workouts", "workout_sessions", "workout_sets", "body_metrics", "daily_log", "deadlines", "shopping_lists", "shopping_items", "shopping_trips", "settings"];
  const res = await Promise.all(names.map((n) => db.from(n).select("*")));
  const out = { exportiert: new Date().toISOString(), app_version: APP_VERSION };
  names.forEach((n, i) => (out[n] = res[i].data ?? []));
  for (const st of out.settings) delete st.calendar_token;
  const name = `tagesplan-${isoDate(new Date())}.json`;
  const file = new File([JSON.stringify(out, null, 2)], name, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(t("Export gespeichert"));
}

// ---------- Neue Version ----------
async function checkVersion() {
  if (DEMO && !new URLSearchParams(location.search).has("v")) return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    const { v } = await res.json();
    if (v === APP_VERSION) return;
    const bar = $("#update");
    bar.innerHTML = `<span>${t("Neue Version verfügbar")}</span><button>${t("Aktualisieren")}</button>`;
    bar.hidden = false;
    bar.querySelector("button").onclick = async () => {
      bar.querySelector("button").textContent = "…";
      try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
      try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch {}
      location.reload();
    };
  } catch {}
}
setInterval(checkVersion, 10 * 60 * 1000);
checkVersion();

translateStatic();
document.documentElement.lang = LANG;
boot();
