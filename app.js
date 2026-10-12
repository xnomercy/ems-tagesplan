import { parse, isoDate } from "./parser.js";
import { parseTr } from "./parser-tr.js";
import { t, LANG, LOCALE, setLang, translateStatic } from "./i18n.js";

const SUPABASE_URL = "https://hpxdhtuabzqwyslzcmbt.supabase.co";
const SUPABASE_KEY = "sb_publishable_kKiQdntJd893YvBPFx7fhw_FYzlwwtz";
const DEMO = new URLSearchParams(location.search).has("demo");
// Bei jeder Veröffentlichung zusammen mit version.json und dem Cache-Namen in sw.js hochzählen
const APP_VERSION = "7";
const db = DEMO
  ? (await import("./mock.js")).db
  : (await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm")).createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = (t) => (t ? t.slice(0, 5) : "");
const weekday = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = Montag
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDay = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) => new Date(iso + "T00:00").toLocaleDateString(LOCALE(), opts);
const DAY_KEYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const DAY_SHORT = new Proxy([], { get: (_, k) => (k === "map" ? (fn) => DAY_KEYS.map((d, i) => fn(t(d), i)) : k in DAY_KEYS && /^\d+$/.test(k) ? t(DAY_KEYS[k]) : DAY_KEYS[k]) });
const L = (obj) => new Proxy(obj, { get: (o, k) => (typeof o[k] === "string" ? t(o[k]) : o[k]) });
const CATEGORIES = L({ gebet: "Gebet", lesen: "Lesen", training: "Training", supps: "Supplements", pflege: "Pflege", essen: "Essen", sonstiges: "Sonstiges" });
const AREAS = L({ arbeit: "Arbeit", privat: "Privat", gesundheit: "Gesundheit", familie: "Familie", finanzen: "Finanzen", haushalt: "Haushalt" });
const VAPID_PUBLIC = "BNV7U2HOxe9fvDt3Ni1eyeGrlVFLT5stsCgcKnU3pF9Ajqu5OWhv0b6qoLrtdcpFtH3J_3gK9CMu4uFbiAbKCk8";
const PRAYER_API = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
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
  if ("serviceWorker" in navigator && !DEMO) navigator.serviceWorker.register("sw.js").catch(() => {});
}

async function showScreen() {
  $("#login").hidden = !!state.user;
  $("#app").hidden = !state.user;
  if (state.user) {
    await ensureSetup();
    await refresh();
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
  if (DEMO) return { Fajr: "05:58", Dhuhr: "13:21", Asr: "16:19", Maghrib: "18:41", Isha: "20:13" };
  if (!s || s.lat == null) return null;
  const key = `pt:${isoDate(date)}:${s.lat.toFixed(2)}:${s.lng.toFixed(2)}:${s.prayer_method}`;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch {}
  try {
    const d = `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
    const res = await fetch(`https://api.aladhan.com/v1/timings/${d}?latitude=${s.lat}&longitude=${s.lng}&method=${s.prayer_method}`);
    const t = (await res.json()).data.timings;
    try { localStorage.setItem(key, JSON.stringify(t)); } catch {}
    return t;
  } catch { return null; }
}

async function refresh() {
  const day = isoDate(state.day);
  const today = isoDate(new Date());
  const [r, c, i, pt, open] = await Promise.all([
    db.from("routines").select("*").order("at_time", { nullsFirst: false }),
    db.from("completions").select("routine_id").eq("on_date", day),
    db.from("items").select("*").eq("on_date", day).order("start_time", { nullsFirst: false }),
    prayerTimes(state.day),
    // Offene Aufgaben mit Frist: überfällige und die der nächsten 14 Tage
    db.from("items").select("*").eq("kind", "aufgabe").eq("done", false)
      .gte("on_date", isoDate(addDays(new Date(), -60))).lte("on_date", isoDate(addDays(new Date(), 14))).order("on_date"),
  ]);
  if (r.error) { toast(t("Laden fehlgeschlagen: {x}", { x: r.error.message })); return; }
  state.routines = r.data;
  const done = new Set((c.data ?? []).map((x) => x.routine_id));
  const wd = weekday(state.day);

  const entries = [];
  for (const rt of state.routines) {
    if (!rt.active || !rt.days.includes(wd)) continue;
    const time = routineTime(rt, pt);
    entries.push({ kind: "routine", id: rt.id, title: rt.title, time, done: done.has(rt.id), category: rt.category, notes: rt.notes, prayer: rt.prayer, priority: rt.priority, raw: rt });
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
}

// Uhrzeit einer Routine: Gebetszeit, an ein Gebet gekoppelt oder fest
const PRAYER_NAMES = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
function routineTime(rt, pt) {
  if (rt.prayer) return pt ? pt[PRAYER_API[rt.prayer]].slice(0, 5) : null;
  if (rt.anchor_prayer) {
    if (!pt) return null;
    const [h, m] = pt[PRAYER_API[rt.anchor_prayer]].slice(0, 5).split(":").map(Number);
    const t = Math.min(h * 60 + m + (rt.anchor_offset ?? 15), 23 * 60 + 59);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }
  return hhmm(rt.at_time) || null;
}
const routineWhen = (r) => r.prayer ? t("auto") : r.anchor_prayer ? `${PRAYER_NAMES[r.anchor_prayer]} +${r.anchor_offset}` : hhmm(r.at_time) || "–";

// ---------- Anzeige ----------
function render() {
  const h = new Date().getHours();
  $("#greeting").textContent = t(h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : "Guten Abend") + ", Enes";
  $("#today-date").textContent = new Date().toLocaleDateString(LOCALE(), { weekday: "long", day: "numeric", month: "long" });
  ({ heute: renderDay, plan: renderPlan, termine: renderTermine, mehr: renderMehr })[state.view]();
}

function itemHtml(e, { next = false, showTime = false } = {}) {
  const label = e.kind === "termin" ? t("Termin") : e.kind === "aufgabe" ? t("Aufgabe") : CATEGORIES[e.category] ?? "";
  const today = isoDate(new Date());
  let badge = "";
  if (e.kind === "aufgabe" && e.on_date && e.on_date !== isoDate(state.day)) {
    badge = e.on_date < today ? `<span class="badge late">${t("überfällig")}</span>` : `<span class="badge">${t("bis {d}", { d: fmtDay(e.on_date, { weekday: "short" }) })}</span>`;
  }
  if (e.priority === "hoch") badge += `<span class="badge prio">${t("Wichtig")}</span>`;
  const cl = e.raw?.checklist ?? [];
  if (e.kind !== "routine" && cl.length) badge += `<span class="badge">${cl.filter((c) => c.d).length}/${cl.length}</span>`;
  const areaLabel = e.kind !== "routine" && e.raw?.area ? " · " + (AREAS[e.raw.area] ?? e.raw.area) : "";
  const end = e.end ? t(" bis {t}", { t: e.end }) : "";
  return `<div class="card-item ${e.kind} ${e.done ? "done" : ""} ${next ? "next" : ""}" data-detail="${e.id}" role="button" tabindex="0">
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
  const sel = $("#days .sel");
  if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
}

function renderPlan() {
  const groups = {};
  for (const r of state.routines) (groups[r.category] ??= []).push(r);
  let html = `<div class="section-head"><h3>${t("Routinen")}</h3><span class="muted">${t("{n} Einträge", { n: state.routines.length })}</span></div>
    <p class="muted small" style="margin-top:-4px">${t("Feste, wiederkehrende Punkte. Tippe zum Bearbeiten.")}</p>`;
  for (const cat of Object.keys(CATEGORIES)) {
    const list = groups[cat];
    if (!list) continue;
    html += `<p class="eyebrow" style="margin-top:18px">${CATEGORIES[cat]}</p>`;
    html += list.map((r) => `<button class="list-item ${r.active ? "" : "off"}" data-edit-routine="${r.id}">
      <div class="tm">${routineWhen(r)}</div>
      <div class="body"><div class="title">${esc(r.title)}</div>
      <div class="sub">${r.days.length === 7 ? t("täglich") : r.days.map((d) => DAY_SHORT[d - 1]).join(", ")}${r.notes ? " · " + esc(r.notes) : ""}</div></div>
      <span class="muted">›</span></button>`).join("");
  }
  html += `<button class="primary" id="new-routine">${t("Neue Routine")}</button>`;
  $("#view-plan").innerHTML = html;
}

async function renderTermine() {
  const { data } = await db.from("items").select("*").gte("on_date", isoDate(new Date())).order("on_date").order("start_time", { nullsFirst: false });
  const f = state.areaFilter ?? "";
  const shown = (data ?? []).filter((i) => !f || i.area === f);
  const termine = shown.filter((i) => i.kind === "termin");
  const aufgaben = shown.filter((i) => i.kind === "aufgabe" && !i.done);
  state.termineCache = data ?? [];
  const toEntry = (i) => ({ kind: i.kind, id: i.id, title: i.title, time: hhmm(i.start_time) || null, end: hhmm(i.end_time), done: i.done, notes: i.notes, raw: i, on_date: i.on_date, priority: i.priority, location: i.location });
  const used = [...new Set((data ?? []).map((i) => i.area).filter(Boolean))];
  let html = used.length ? `<div class="chips">${[["", t("Alle")], ...used.map((a) => [a, AREAS[a] ?? a])]
    .map(([v, n]) => `<button class="chip ${f === v ? "on" : ""}" data-area="${v}">${n}</button>`).join("")}</div>` : "";
  html += `<div class="section-head"><h3>${t("Kommende Termine")}</h3></div>`;
  if (!termine.length) html += `<div class="empty">${t("Keine Termine.")}</div>`;
  let last = "";
  for (const t of termine) {
    if (t.on_date !== last) { html += `<p class="eyebrow" style="margin-top:14px">${fmtDay(t.on_date, { weekday: "long", day: "numeric", month: "long" })}</p>`; last = t.on_date; }
    html += `<div class="slot"><div class="t">${hhmm(t.start_time)}</div>${itemHtml(toEntry(t))}</div>`;
  }
  html += `<div class="section-head"><h3>${t("Aufgaben")}</h3></div>`;
  html += aufgaben.length ? aufgaben.map((a) => `<div class="slot"><div class="t small">${fmtDay(a.on_date, { day: "numeric", month: "numeric" })}</div>${itemHtml(toEntry(a), { showTime: true })}</div>`).join("") : `<div class="empty">${t("Keine offenen Aufgaben.")}</div>`;
  html += `<button class="primary" id="new-item">${t("Termin oder Aufgabe anlegen")}</button>`;
  $("#view-termine").innerHTML = html;
  $("#view-termine").querySelectorAll("[data-area]").forEach((b) => (b.onclick = () => { state.areaFilter = b.dataset.area; renderTermine(); }));
}

function renderMehr() {
  const s = state.settings ?? {};
  const feed = `${SUPABASE_URL}/functions/v1/kalender?token=${s.calendar_token}`;
  $("#view-mehr").innerHTML = `
    <div class="section-head"><h3>${t("Einstellungen")}</h3></div>
    <div class="card">
      <p class="eyebrow">${t("Sprache")}</p>
      <div class="seg" id="lang-seg">
        <button type="button" data-lang="de" class="${LANG === "de" ? "on" : ""}">Deutsch</button>
        <button type="button" data-lang="tr" class="${LANG === "tr" ? "on" : ""}">Türkçe</button>
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
      <p class="eyebrow">${t("Passwort ändern")}</p>
      <form id="pw-form">
        <div class="pw"><input id="pw-new" type="password" autocomplete="new-password" placeholder="${t("Neues Passwort (mind. 10 Zeichen)")}" minlength="10" required><button type="button" class="eye" data-eye aria-label="Passwort anzeigen"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <div class="pw"><input id="pw-repeat" type="password" autocomplete="new-password" placeholder="${t("Neues Passwort wiederholen")}" minlength="10" required><button type="button" class="eye" data-eye aria-label="Passwort anzeigen"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <button class="btn fill">${t("Passwort speichern")}</button>
      </form>
    </div>
    <div class="card"><p class="small muted">${t("Angemeldet als {x}", { x: esc(state.user?.email) })}</p><button class="btn danger" id="logout">${t("Abmelden")}</button></div>`;
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
  document.querySelectorAll("#lang-seg button").forEach((b) => (b.onclick = () => { setLang(b.dataset.lang); render(); saveSettings({ lang: LANG }); }));
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
  state.settings = data;
  await refresh();
}

// ---------- Aktionen ----------
async function setRoutineDone(id, on, date = isoDate(state.day)) {
  if (on) await db.from("completions").upsert({ routine_id: id, on_date: date });
  else await db.from("completions").delete().eq("routine_id", id).eq("on_date", date);
}

const findEntry = (id) => [...state.entries, ...state.open].find((e) => e.id === id) ?? (state.termineCache ?? []).find((e) => e.id === id);

document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-toggle],[data-edit-item],[data-edit-routine],[data-day],[data-goto],[data-detail],#new-routine,#new-item");
  if (!t) return;
  if (t.dataset.toggle) {
    const [kind, id] = t.dataset.toggle.split(":");
    const on = !findEntry(id)?.done;
    t.classList.toggle("on", on);
    t.innerHTML = on ? CHECK_SVG : "";
    if (navigator.vibrate) navigator.vibrate(10);
    if (kind === "routine") await setRoutineDone(id, on);
    else await db.from("items").update({ done: on }).eq("id", id);
    await refresh();
  } else if (t.dataset.detail) {
    const e = findEntry(t.dataset.detail);
    if (e) openDetail(e.kind ? e : { ...e, raw: e });
  } else if (t.dataset.editItem) {
    const e = findEntry(t.dataset.editItem);
    openItemSheet(e?.raw ?? e);
  } else if (t.dataset.editRoutine) {
    openRoutineSheet(state.routines.find((r) => r.id === t.dataset.editRoutine));
  } else if (t.dataset.day) {
    state.day = new Date(t.dataset.day + "T12:00");
    refresh();
  } else if (t.dataset.goto) switchView(t.dataset.goto);
  else if (t.id === "new-routine") openRoutineSheet();
  else if (t.id === "new-item") openItemSheet();
});

$("#add").onclick = () => openItemSheet();
$("#greeting").onclick = () => { state.day = new Date(); switchView("heute"); };

document.querySelectorAll(".tabs > button").forEach((b) => (b.onclick = () => switchView(b.dataset.view)));
function switchView(v) {
  state.view = v;
  document.querySelectorAll(".tabs > button").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  for (const name of ["heute", "plan", "termine", "mehr"]) $(`#view-${name}`).hidden = name !== v;
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
    ? `${raw.days?.length === 7 ? t("Täglich") : (raw.days ?? []).map((d) => DAY_SHORT[d - 1]).join(", ")}${e.time ? " · " + e.time : ""}${raw.anchor_prayer ? ` (${PRAYER_NAMES[raw.anchor_prayer]} +${raw.anchor_offset})` : raw.prayer ? ` (${t("Gebetszeit")})` : ""}`
    : `${fmtDay(raw.on_date, { weekday: "long", day: "numeric", month: "long" })}${raw.start_time ? " · " + hhmm(raw.start_time) : ""}${raw.end_time ? "–" + hhmm(raw.end_time) : ""}`;
  const remind = raw.remind_before ? (raw.remind_before >= 60 ? t("{n} Std. vorher", { n: raw.remind_before / 60 }) : t("{n} Min. vorher", { n: raw.remind_before })) : null;
  const rows = [
    [t(e.kind === "aufgabe" ? "Fällig" : "Wann"), when],
    raw.location ? [t("Ort"), `<a href="https://maps.apple.com/?q=${encodeURIComponent(raw.location)}" target="_blank" rel="noopener">${esc(raw.location)}</a>`] : null,
    [t("Priorität"), t(e.priority === "hoch" ? "Hoch, erinnert bis erledigt" : "Normal")],
    remind ? [t("Erinnerung"), remind] : null,
    !isRoutine && raw.area ? [t("Bereich"), AREAS[raw.area] ?? esc(raw.area)] : null,
    raw.notes ? [t("Notiz"), esc(raw.notes).replace(/\n/g, "<br>")] : null,
  ].filter(Boolean);
  const cl = isRoutine ? [] : raw.checklist ?? [];
  form.innerHTML = `<p class="eyebrow">${kindLabel}</p>
    <h3 class="detail-title">${esc(e.title)}</h3>
    <dl class="details">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    ${cl.length ? `<p class="eyebrow" style="margin-top:14px">${t("Checkliste")}</p><div class="checklist">${cl.map((c, i) =>
      `<label class="cl-item"><input type="checkbox" data-cl="${i}" ${c.d ? "checked" : ""}><span>${esc(c.t)}</span></label>`).join("")}</div>` : ""}
    <button type="button" class="primary" id="d-done">${t(e.done ? "Wieder öffnen" : "Erledigt")}</button>
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
    else await db.from("items").update({ done: !e.done }).eq("id", e.id);
    closeSheet(sheet); refresh();
  };
  $("#d-edit").onclick = () => { sheet.close(); isRoutine ? openRoutineSheet(raw) : openItemSheet(raw); };
  const del = $("#d-del");
  if (del) del.onclick = async () => { if (confirm(t("Wirklich löschen?"))) { await db.from("items").delete().eq("id", e.id); closeSheet(sheet); refresh(); } };
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
    </div>`}
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
      area: f.get("area") || null, checklist: getChecklist() };
    const { error } = item.id ? await db.from("items").update(row).eq("id", item.id) : await db.from("items").insert(row);
    if (error) return toast(error.message);
    closeSheet(sheet); refresh();
  };
  bindSheetButtons(async () => { await db.from("items").delete().eq("id", item.id); });
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
      <div id="anchor-off" ${rt.anchor_prayer ? "" : "hidden"}><label>${t("Minuten danach")}</label><input name="anchor_offset" type="number" min="0" max="240" step="5" value="${rt.anchor_offset ?? 15}"></div>
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
  ? fmtDay(input.value, { weekday: "short", day: "numeric", month: "long", year: input.value.slice(0, 4) === String(new Date().getFullYear()) ? undefined : "numeric" })
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
      <div class="chips quick">${quick.map(([n, k]) => `<button type="button" class="chip" data-iso="${isoDate(addDays(today, k))}">${t(n)}</button>`).join("")}</div>
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

// ---------- Sprache ----------
const voice = $("#voice");
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;

$("#mic").onclick = () => {
  $("#cmd-input").value = "";
  $("#preview").hidden = true;
  openSheet(voice);
  startListening();
};
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
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      $("#cmd-input").value = r[0].transcript;
      showPreview();
      if (r.isFinal) { stopListening(); setTimeout(() => $("#cmd-form").requestSubmit(), 700); }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") $("#voice-state").textContent = t("Nichts gehört. Nochmal tippen.");
      else if (e.error !== "aborted") { $("#voice-state").textContent = t("Mikro hier nicht verfügbar. Nutze das Mikro deiner Tastatur."); $("#cmd-input").focus(); }
    };
    rec.onend = () => { rec = null; $("#voice-orb").classList.remove("listening"); if ($("#voice-state").textContent === t("Ich höre zu …")) $("#voice-state").textContent = t("Tippe zum Sprechen"); };
    rec.start();
    $("#voice-orb").classList.add("listening");
    $("#voice-state").textContent = t("Ich höre zu …");
  } catch { rec = null; }
}
function stopListening() { if (rec) rec.stop(); }

// Türkisch zuerst, deutsche Befehle klappen trotzdem
function parseCmd(text, now, cands) {
  if (LANG !== "tr") return parse(text, now, cands);
  const r = parseTr(text, now, cands);
  return r.type === "unbekannt" ? parse(text, now, cands) : r;
}

function candidates() {
  return [...state.entries.filter((e) => !e.done), ...state.open, ...state.entries.filter((e) => e.done)];
}

function describe(cmd) {
  if (cmd.type === "erledigt") return [t("Abhaken"), cmd.match.title];
  if (cmd.type === "routine") return [t("Neue Routine"), `${cmd.title} · ${cmd.days.length === 7 ? t("täglich") : cmd.days.map((d) => DAY_SHORT[d - 1]).join(", ")}${cmd.time ? " · " + cmd.time : ""}`];
  if (cmd.type === "termin") return [t("Termin"), `${cmd.title} · ${fmtDay(cmd.date)}${cmd.time ? " · " + cmd.time : ""}${cmd.end ? "–" + cmd.end : ""}`];
  if (cmd.type === "aufgabe") return [t("Aufgabe"), `${cmd.title} · ${t("fällig {d}", { d: fmtDay(cmd.date) })}${cmd.time ? " · " + cmd.time : ""}`];
  return null;
}

function showPreview() {
  const v = $("#cmd-input").value.trim();
  const p = $("#preview");
  if (!v) { p.hidden = true; return; }
  const d = describe(parseCmd(v, new Date(), candidates()));
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
  const cmd = parseCmd(text, new Date(), candidates());

  if (cmd.type === "erledigt") {
    const e = cmd.match;
    const date = e.kind === "routine" ? isoDate(state.day) : null;
    if (e.kind === "routine") await setRoutineDone(e.id, true, date);
    else await db.from("items").update({ done: true }).eq("id", e.id);
    toast(t("Abgehakt: {x}", { x: e.title }), async () => {
      if (e.kind === "routine") await setRoutineDone(e.id, false, date);
      else await db.from("items").update({ done: false }).eq("id", e.id);
      refresh();
    });
  } else if (cmd.type === "routine") {
    const { data, error } = await db.from("routines").insert({ title: cmd.title, days: cmd.days, at_time: cmd.time, category: cmd.category }).select().single();
    if (error) return toast(error.message);
    toast(t("Routine angelegt: {x}", { x: cmd.title }), async () => { await db.from("routines").delete().eq("id", data.id); refresh(); });
  } else if (cmd.type === "termin" || cmd.type === "aufgabe") {
    const row = { kind: cmd.type, title: cmd.title, on_date: cmd.date, start_time: cmd.time, end_time: cmd.end };
    const { data, error } = await db.from("items").insert(row).select().single();
    if (error) return toast(error.message);
    toast(`${t(cmd.type === "termin" ? "Termin" : "Aufgabe")}: ${cmd.title}, ${fmtDay(cmd.date)}${cmd.time ? " " + cmd.time : ""}`, async () => {
      await db.from("items").delete().eq("id", data.id);
      refresh();
    });
  } else {
    openItemSheet({}, { title: text });
    return;
  }
  refresh();
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
  el.hidden = false;
  if (undo) el.querySelector("button").onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), undo ? 6000 : 3000);
}

document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) refresh(); if (!document.hidden) checkVersion(); });

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
