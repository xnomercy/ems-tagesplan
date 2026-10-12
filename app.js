import { parse, isoDate } from "./parser.js";

const SUPABASE_URL = "https://hpxdhtuabzqwyslzcmbt.supabase.co";
const SUPABASE_KEY = "sb_publishable_kKiQdntJd893YvBPFx7fhw_FYzlwwtz";
const DEMO = new URLSearchParams(location.search).has("demo");
const db = DEMO
  ? (await import("./mock.js")).db
  : (await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm")).createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = (t) => (t ? t.slice(0, 5) : "");
const weekday = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = Montag
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDay = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) => new Date(iso + "T00:00").toLocaleDateString("de-DE", opts);
const DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const CATEGORIES = { gebet: "Gebet", lesen: "Lesen", training: "Training", supps: "Supplements", pflege: "Pflege", essen: "Essen", sonstiges: "Sonstiges" };
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
  { title: "Wall Angels 2×10", category: "training", at_time: "07:45" },
  { title: "Morgen-Supps zum Frühstück", category: "supps", at_time: "07:55", notes: "D3+K2, Schwarzkümmelöl, Vitamin C, B12, Lion's Mane, OPC, Bor" },
  { title: "Morgenpflege", category: "pflege", at_time: "08:05" },
  { title: "Mittag-Supps", category: "supps", at_time: "12:55", notes: "Chlorella + Gerstengras" },
  { title: "Krafttraining + 10 Min Stepper", category: "training", days: [1, 3, 5] },
  { title: "Scalp-Öl-Massage", category: "pflege", at_time: "20:30", days: [1, 4] },
  { title: "Abendpflege", category: "pflege", at_time: "20:40" },
  { title: "Dermastamping Bart", category: "pflege", at_time: "21:00", days: [2, 5] },
  { title: "Buch lesen (20 Min)", category: "lesen", at_time: "21:10" },
  { title: "Trockene Kopfhautmassage", category: "pflege", at_time: "21:30" },
  { title: "Abend-Supps", category: "supps", at_time: "21:55", notes: "Magnesium + Ashwagandha" },
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
  $("#login-msg").textContent = "Melde an …";
  const { error } = await db.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
  $("#login-msg").textContent = error ? loginError(error) : "";
});

function loginError(err) {
  const m = err.message || "";
  if (/invalid login/i.test(m)) return "E-Mail oder Passwort stimmt nicht.";
  if (/not confirmed/i.test(m)) return "Bitte zuerst den Link in der Bestätigungsmail anklicken.";
  if (/database error|not allowed/i.test(m)) return "Diese E-Mail darf hier kein Konto anlegen.";
  return m;
}

async function ensureSetup() {
  const { data: settings } = await db.from("settings").select("*").maybeSingle();
  if (settings) { state.settings = settings; return; }
  const { data: created } = await db.from("settings").insert({}).select().single();
  state.settings = created;
  const { count } = await db.from("routines").select("id", { count: "exact", head: true });
  if (!count) await db.from("routines").insert(DEFAULT_ROUTINES);
}

// ---------- Daten ----------
async function prayerTimes(date) {
  const s = state.settings;
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
  if (r.error) { toast("Laden fehlgeschlagen: " + r.error.message); return; }
  state.routines = r.data;
  const done = new Set((c.data ?? []).map((x) => x.routine_id));
  const wd = weekday(state.day);

  const entries = [];
  for (const rt of state.routines) {
    if (!rt.active || !rt.days.includes(wd)) continue;
    const time = rt.prayer ? (pt ? pt[PRAYER_API[rt.prayer]].slice(0, 5) : null) : hhmm(rt.at_time) || null;
    entries.push({ kind: "routine", id: rt.id, title: rt.title, time, done: done.has(rt.id), category: rt.category, notes: rt.notes, prayer: rt.prayer });
  }
  for (const it of i.data ?? []) {
    entries.push({ kind: it.kind, id: it.id, title: it.title, time: hhmm(it.start_time) || null, end: hhmm(it.end_time), done: it.done, notes: it.notes, raw: it, on_date: it.on_date });
  }
  entries.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  state.entries = entries;
  state.open = day === today
    ? (open.data ?? []).filter((x) => x.on_date !== day).map((it) => ({ kind: "aufgabe", id: it.id, title: it.title, time: hhmm(it.start_time) || null, done: false, notes: it.notes, raw: it, on_date: it.on_date }))
    : [];
  render();
}

// ---------- Anzeige ----------
function render() {
  const h = new Date().getHours();
  $("#greeting").textContent = (h < 11 ? "Guten Morgen" : h < 17 ? "Hallo" : "Guten Abend") + ", Enes";
  $("#today-date").textContent = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  ({ heute: renderDay, plan: renderPlan, termine: renderTermine, mehr: renderMehr })[state.view]();
}

function itemHtml(e, { next = false, showTime = false } = {}) {
  const label = e.kind === "termin" ? "Termin" : e.kind === "aufgabe" ? "Aufgabe" : CATEGORIES[e.category] ?? "";
  const today = isoDate(new Date());
  let badge = "";
  if (e.kind === "aufgabe" && e.on_date && e.on_date !== isoDate(state.day)) {
    badge = e.on_date < today ? `<span class="badge late">überfällig</span>` : `<span class="badge">bis ${fmtDay(e.on_date, { weekday: "short" })}</span>`;
  }
  const end = e.end ? ` bis ${e.end}` : "";
  return `<div class="card-item ${e.kind} ${e.done ? "done" : ""} ${next ? "next" : ""}">
    <div class="body">
      <div class="cat"><i></i>${label}${showTime && e.time ? " · " + e.time : ""}${end} ${badge}</div>
      <div class="title">${esc(e.title)}</div>
      ${e.notes ? `<div class="notes">${esc(e.notes)}</div>` : ""}
    </div>
    ${e.kind !== "routine" ? `<button class="more" data-edit-item="${e.id}" aria-label="Bearbeiten">⋯</button>` : ""}
    <button class="check ${e.done ? "on" : ""}" data-toggle="${e.kind}:${e.id}" aria-label="${e.done ? "Nicht erledigt" : "Erledigt"}">${e.done ? CHECK_SVG : ""}</button>
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
    <p class="eyebrow">${isToday ? "Dein Tag" : fmtDay(isoDate(state.day), { weekday: "long" })}</p>
    <h2>${total ? (done === total ? "Alles erledigt." : `${total - done} ${total - done === 1 ? "Punkt" : "Punkte"} offen`) : "Noch nichts geplant"}</h2>
    <div class="next">${next ? `Als Nächstes: ${esc(next.title)} um ${next.time}` : isToday && total && done < total ? "Für heute keine Uhrzeiten mehr offen." : ""}</div>
    <div class="bar"><div style="width:${pct}%"></div></div>
    <div class="meta"><span>Fortschritt</span><span>${done} / ${total} · ${pct}%</span></div>
  </section>`;
  html += dayStrip();
  if (state.settings && state.settings.lat == null) html += `<div class="hint">Für automatische Gebetszeiten einmal den Standort setzen. <button data-goto="mehr">Jetzt einrichten</button></div>`;

  if (timed.length) {
    html += `<div class="section-head"><h3>Zeitplan</h3><span class="muted">${fmtDay(isoDate(state.day), { day: "numeric", month: "long" })}</span></div>`;
    html += timed.map((e) => `<div class="slot"><div class="t">${e.time}</div>${itemHtml(e, { next: e === next })}</div>`).join("");
  }
  if (untimed.length) {
    html += `<div class="section-head"><h3>Ohne feste Zeit</h3></div>`;
    html += untimed.map((e) => `<div class="slot"><div class="t"></div>${itemHtml(e)}</div>`).join("");
  }
  if (state.open.length) {
    html += `<div class="section-head"><h3>Offene Aufgaben</h3><span class="muted">mit Frist</span></div>`;
    html += state.open.map((e) => `<div class="slot"><div class="t"></div>${itemHtml(e)}</div>`).join("");
  }
  if (!total && !state.open.length) html += `<div class="empty">Tippe unten aufs Mikro und sag, was ansteht.</div>`;
  $("#view-heute").innerHTML = html;
  const sel = $("#days .sel");
  if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
}

function renderPlan() {
  const groups = {};
  for (const r of state.routines) (groups[r.category] ??= []).push(r);
  let html = `<div class="section-head"><h3>Routinen</h3><span class="muted">${state.routines.length} Einträge</span></div>
    <p class="muted small" style="margin-top:-4px">Feste, wiederkehrende Punkte. Tippe zum Bearbeiten.</p>`;
  for (const cat of Object.keys(CATEGORIES)) {
    const list = groups[cat];
    if (!list) continue;
    html += `<p class="eyebrow" style="margin-top:18px">${CATEGORIES[cat]}</p>`;
    html += list.map((r) => `<button class="list-item ${r.active ? "" : "off"}" data-edit-routine="${r.id}">
      <div class="tm">${r.prayer ? "auto" : hhmm(r.at_time) || "–"}</div>
      <div class="body"><div class="title">${esc(r.title)}</div>
      <div class="sub">${r.days.length === 7 ? "täglich" : r.days.map((d) => DAY_SHORT[d - 1]).join(", ")}${r.notes ? " · " + esc(r.notes) : ""}</div></div>
      <span class="muted">›</span></button>`).join("");
  }
  html += `<button class="primary" id="new-routine">Neue Routine</button>`;
  $("#view-plan").innerHTML = html;
}

async function renderTermine() {
  const { data } = await db.from("items").select("*").gte("on_date", isoDate(new Date())).order("on_date").order("start_time", { nullsFirst: false });
  const termine = (data ?? []).filter((i) => i.kind === "termin");
  const aufgaben = (data ?? []).filter((i) => i.kind === "aufgabe" && !i.done);
  state.termineCache = data ?? [];
  const toEntry = (i) => ({ kind: i.kind, id: i.id, title: i.title, time: hhmm(i.start_time) || null, end: hhmm(i.end_time), done: i.done, notes: i.notes, raw: i });
  let html = `<div class="section-head"><h3>Kommende Termine</h3></div>`;
  if (!termine.length) html += `<div class="empty">Keine Termine.</div>`;
  let last = "";
  for (const t of termine) {
    if (t.on_date !== last) { html += `<p class="eyebrow" style="margin-top:14px">${fmtDay(t.on_date, { weekday: "long", day: "numeric", month: "long" })}</p>`; last = t.on_date; }
    html += `<div class="slot"><div class="t">${hhmm(t.start_time)}</div>${itemHtml(toEntry(t))}</div>`;
  }
  html += `<div class="section-head"><h3>Aufgaben</h3></div>`;
  html += aufgaben.length ? aufgaben.map((a) => `<div class="slot"><div class="t small">${fmtDay(a.on_date, { day: "numeric", month: "numeric" })}</div>${itemHtml(toEntry(a), { showTime: true })}</div>`).join("") : `<div class="empty">Keine offenen Aufgaben.</div>`;
  html += `<button class="primary" id="new-item">Termin oder Aufgabe anlegen</button>`;
  $("#view-termine").innerHTML = html;
}

function renderMehr() {
  const s = state.settings ?? {};
  const feed = `${SUPABASE_URL}/functions/v1/kalender?token=${s.calendar_token}`;
  $("#view-mehr").innerHTML = `
    <div class="section-head"><h3>Einstellungen</h3></div>
    <div class="card">
      <p class="eyebrow">Gebetszeiten</p>
      <p>${s.lat != null ? `Standort gesetzt (${s.lat.toFixed(2)}, ${s.lng.toFixed(2)}).` : "Noch kein Standort gesetzt."}</p>
      <button class="btn fill" id="set-loc">Aktuellen Standort verwenden</button>
      <label class="small muted" style="display:block;margin-top:12px">Berechnung</label>
      <form><select id="method">
        ${[[13, "Diyanet (Türkei)"], [3, "Muslim World League"], [2, "ISNA (Nordamerika)"], [4, "Umm al-Qura"], [5, "Ägypten"]]
          .map(([v, n]) => `<option value="${v}" ${s.prayer_method === v ? "selected" : ""}>${n}</option>`).join("")}
      </select></form>
    </div>
    <div class="dark-block">
      <p class="eyebrow">Kalender verknüpfen</p>
      <p>Abonniere diesen Link in deinem Kalender. Termine, Routinen und Gebetszeiten erscheinen dort mit Erinnerung und aktualisieren sich von selbst.</p>
      <p class="small">iPhone: Einstellungen › Kalender › Accounts › Account hinzufügen › Andere › Kalenderabo hinzufügen.</p>
    </div>
    <div class="card">
      <code class="link">${esc(feed)}</code>
      <button class="btn fill" id="open-feed">Im Kalender öffnen</button>
      <button class="btn" id="copy-feed">Link kopieren</button>
    </div>
    <div class="card">
      <p class="eyebrow">Sprachbefehle</p>
      <p class="small">„Leg Aufgabe an Steuer, muss bis Freitag fertig sein“<br>„Täglich um 21 Uhr Buch lesen“<br>„Jeden Montag und Donnerstag 18 Uhr Training“<br>„Termin am 20.10. von 14 bis 16 Uhr Friseur“<br>„Asr erledigt“, „Magnesium genommen“</p>
    </div>
    <div class="card">
      <p class="eyebrow">Passwort ändern</p>
      <form id="pw-form">
        <div class="pw"><input id="pw-new" type="password" autocomplete="new-password" placeholder="Neues Passwort (mind. 10 Zeichen)" minlength="10" required><button type="button" class="eye" data-eye aria-label="Passwort anzeigen"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <div class="pw"><input id="pw-repeat" type="password" autocomplete="new-password" placeholder="Neues Passwort wiederholen" minlength="10" required><button type="button" class="eye" data-eye aria-label="Passwort anzeigen"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <button class="btn fill">Passwort speichern</button>
      </form>
    </div>
    <div class="card"><p class="small muted">Angemeldet als ${esc(state.user?.email)}</p><button class="btn danger" id="logout">Abmelden</button></div>`;
  $("#pw-form").onsubmit = async (e) => {
    e.preventDefault();
    const pw = $("#pw-new").value;
    if (pw !== $("#pw-repeat").value) return toast("Die beiden Passwörter sind nicht gleich.");
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) return toast(/different from the old/i.test(error.message) ? "Das ist schon dein aktuelles Passwort." : error.message);
    e.target.reset();
    toast("Passwort geändert");
  };
  $("#set-loc").onclick = () => navigator.geolocation.getCurrentPosition(async (p) => {
    await saveSettings({ lat: +p.coords.latitude.toFixed(4), lng: +p.coords.longitude.toFixed(4) });
    toast("Standort gespeichert");
  }, () => toast("Standort nicht freigegeben"));
  $("#method").onchange = (e) => saveSettings({ prayer_method: Number(e.target.value) });
  $("#copy-feed").onclick = () => navigator.clipboard.writeText(feed).then(() => toast("Link kopiert"));
  $("#open-feed").onclick = () => { location.href = feed.replace(/^https:/, "webcal:"); };
  $("#logout").onclick = () => db.auth.signOut();
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
  const t = ev.target.closest("[data-toggle],[data-edit-item],[data-edit-routine],[data-day],[data-goto],#new-routine,#new-item");
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

// ---------- Formulare ----------
const sheet = $("#sheet"), form = $("#sheet-form");

function openItemSheet(item = {}, preset = {}) {
  item = item ?? {};
  const it = { kind: "aufgabe", on_date: isoDate(state.day), ...preset, ...item };
  form.innerHTML = `<h3>${item.id ? "Bearbeiten" : "Neu anlegen"}</h3>
    ${item.id ? "" : `<div class="seg" id="kind-seg">
      <button type="button" data-k="aufgabe" class="${it.kind === "aufgabe" ? "on" : ""}">Aufgabe</button>
      <button type="button" data-k="termin" class="${it.kind === "termin" ? "on" : ""}">Termin</button>
      <button type="button" data-k="routine">Täglich / Routine</button>
    </div>`}
    <input name="title" placeholder="Was?" required value="${esc(it.title)}">
    <label id="date-label">${it.kind === "aufgabe" ? "Fällig am" : "Datum"}</label><input name="on_date" type="date" required value="${it.on_date}">
    <div class="row"><div><label>Von</label><input name="start_time" type="time" value="${hhmm(it.start_time)}"></div>
    <div><label>Bis</label><input name="end_time" type="time" value="${hhmm(it.end_time)}"></div></div>
    <label>Notiz</label><textarea name="notes" rows="2">${esc(it.notes)}</textarea>
    <button class="primary" value="save">Speichern</button>
    ${item.id ? `<button type="button" class="ghost danger" id="del">Löschen</button>` : ""}
    <button type="button" class="ghost" id="cancel">Abbrechen</button>`;
  let kind = it.kind;
  form.querySelectorAll("#kind-seg button").forEach((b) => (b.onclick = () => {
    if (b.dataset.k === "routine") { sheet.close(); openRoutineSheet({ title: form.title.value }); return; }
    kind = b.dataset.k;
    $("#date-label").textContent = kind === "aufgabe" ? "Fällig am" : "Datum";
    form.querySelectorAll("#kind-seg button").forEach((x) => x.classList.toggle("on", x === b));
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const row = { kind, title: f.get("title").trim(), on_date: f.get("on_date"), start_time: f.get("start_time") || null, end_time: f.get("end_time") || null, notes: f.get("notes").trim() || null };
    const { error } = item.id ? await db.from("items").update(row).eq("id", item.id) : await db.from("items").insert(row);
    if (error) return toast(error.message);
    sheet.close(); refresh();
  };
  bindSheetButtons(async () => { await db.from("items").delete().eq("id", item.id); });
  sheet.showModal();
}

function openRoutineSheet(r = {}) {
  r = r ?? {};
  const rt = { category: "sonstiges", days: [1, 2, 3, 4, 5, 6, 7], active: true, ...r };
  let days = [...rt.days];
  form.innerHTML = `<h3>${r.id ? "Routine bearbeiten" : "Neue Routine"}</h3>
    <input name="title" placeholder="Was?" required value="${esc(rt.title)}">
    <div class="row">
      <div><label>Bereich</label><select name="category">${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}" ${rt.category === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div><label>Uhrzeit</label><input name="at_time" type="time" value="${hhmm(rt.at_time)}" ${rt.prayer ? "disabled" : ""}></div>
    </div>
    ${rt.prayer ? `<p class="small muted">Die Uhrzeit kommt automatisch aus den Gebetszeiten.</p>` : ""}
    <label>Wiederholen an</label>
    <div class="seg" id="days-seg">${DAY_SHORT.map((d, i) => `<button type="button" data-d="${i + 1}" class="${days.includes(i + 1) ? "on" : ""}">${d}</button>`).join("")}</div>
    <label>Notiz</label><textarea name="notes" rows="2">${esc(rt.notes)}</textarea>
    <label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--text)"><input type="checkbox" name="active" ${rt.active ? "checked" : ""} style="width:auto;min-height:0;margin-right:8px">aktiv</label>
    <button class="primary" value="save">Speichern</button>
    ${r.id ? `<button type="button" class="ghost danger" id="del">Löschen</button>` : ""}
    <button type="button" class="ghost" id="cancel">Abbrechen</button>`;
  form.querySelectorAll("#days-seg button").forEach((b) => (b.onclick = () => {
    const d = Number(b.dataset.d);
    days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    b.classList.toggle("on", days.includes(d));
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!days.length) return toast("Mindestens einen Tag wählen");
    const f = new FormData(form);
    const row = { title: f.get("title").trim(), category: f.get("category"), days, notes: f.get("notes").trim() || null, active: f.get("active") === "on" };
    if (!rt.prayer) row.at_time = f.get("at_time") || null;
    const { error } = r.id ? await db.from("routines").update(row).eq("id", r.id) : await db.from("routines").insert(row);
    if (error) return toast(error.message);
    sheet.close(); refresh();
  };
  bindSheetButtons(async () => { await db.from("routines").delete().eq("id", r.id); });
  sheet.showModal();
}

function bindSheetButtons(onDelete) {
  form.querySelector("#cancel").onclick = () => sheet.close();
  const del = form.querySelector("#del");
  if (del) del.onclick = async () => { if (confirm("Wirklich löschen?")) { await onDelete(); sheet.close(); refresh(); } };
}

// ---------- Sprache ----------
const voice = $("#voice");
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;

$("#mic").onclick = () => {
  $("#cmd-input").value = "";
  $("#preview").hidden = true;
  voice.showModal();
  startListening();
};
$("#voice-close").onclick = () => { stopListening(); voice.close(); };
$("#voice-orb").onclick = () => (rec ? stopListening() : startListening());
voice.querySelectorAll(".examples button").forEach((b) => (b.onclick = () => { $("#cmd-input").value = b.textContent; showPreview(); }));
$("#cmd-input").addEventListener("input", showPreview);
$("#cmd-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#cmd-form").requestSubmit(); } });

function startListening() {
  if (!Recognition) {
    $("#voice-state").textContent = "Tipp ins Feld und nutze das Mikro deiner Tastatur.";
    $("#cmd-input").focus();
    return;
  }
  try {
    rec = new Recognition();
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      $("#cmd-input").value = r[0].transcript;
      showPreview();
      if (r.isFinal) { stopListening(); setTimeout(() => $("#cmd-form").requestSubmit(), 700); }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") $("#voice-state").textContent = "Nichts gehört. Nochmal tippen.";
      else if (e.error !== "aborted") { $("#voice-state").textContent = "Mikro hier nicht verfügbar. Nutze das Mikro deiner Tastatur."; $("#cmd-input").focus(); }
    };
    rec.onend = () => { rec = null; $("#voice-orb").classList.remove("listening"); if ($("#voice-state").textContent === "Ich höre zu …") $("#voice-state").textContent = "Tippe zum Sprechen"; };
    rec.start();
    $("#voice-orb").classList.add("listening");
    $("#voice-state").textContent = "Ich höre zu …";
  } catch { rec = null; }
}
function stopListening() { if (rec) rec.stop(); }

function candidates() {
  return [...state.entries.filter((e) => !e.done), ...state.open, ...state.entries.filter((e) => e.done)];
}

function describe(cmd) {
  if (cmd.type === "erledigt") return ["Abhaken", cmd.match.title];
  if (cmd.type === "routine") return ["Neue Routine", `${cmd.title} · ${cmd.days.length === 7 ? "täglich" : cmd.days.map((d) => DAY_SHORT[d - 1]).join(", ")}${cmd.time ? " · " + cmd.time : ""}`];
  if (cmd.type === "termin") return ["Termin", `${cmd.title} · ${fmtDay(cmd.date)}${cmd.time ? " · " + cmd.time : ""}${cmd.end ? "–" + cmd.end : ""}`];
  if (cmd.type === "aufgabe") return ["Aufgabe", `${cmd.title} · fällig ${fmtDay(cmd.date)}${cmd.time ? " · " + cmd.time : ""}`];
  return null;
}

function showPreview() {
  const v = $("#cmd-input").value.trim();
  const p = $("#preview");
  if (!v) { p.hidden = true; return; }
  const d = describe(parse(v, new Date(), candidates()));
  p.hidden = !d;
  if (d) p.innerHTML = `<b>${d[0]}</b>${esc(d[1])}`;
}

$("#cmd-form").onsubmit = async (e) => {
  e.preventDefault();
  const v = $("#cmd-input").value.trim();
  if (!v) return;
  voice.close();
  await runCommand(v);
};

async function runCommand(text) {
  const cmd = parse(text, new Date(), candidates());

  if (cmd.type === "erledigt") {
    const e = cmd.match;
    const date = e.kind === "routine" ? isoDate(state.day) : null;
    if (e.kind === "routine") await setRoutineDone(e.id, true, date);
    else await db.from("items").update({ done: true }).eq("id", e.id);
    toast(`Abgehakt: ${e.title}`, async () => {
      if (e.kind === "routine") await setRoutineDone(e.id, false, date);
      else await db.from("items").update({ done: false }).eq("id", e.id);
      refresh();
    });
  } else if (cmd.type === "routine") {
    const { data, error } = await db.from("routines").insert({ title: cmd.title, days: cmd.days, at_time: cmd.time, category: cmd.category }).select().single();
    if (error) return toast(error.message);
    toast(`Routine angelegt: ${cmd.title}`, async () => { await db.from("routines").delete().eq("id", data.id); refresh(); });
  } else if (cmd.type === "termin" || cmd.type === "aufgabe") {
    const row = { kind: cmd.type, title: cmd.title, on_date: cmd.date, start_time: cmd.time, end_time: cmd.end };
    const { data, error } = await db.from("items").insert(row).select().single();
    if (error) return toast(error.message);
    toast(`${cmd.type === "termin" ? "Termin" : "Aufgabe"}: ${cmd.title}, ${fmtDay(cmd.date)}${cmd.time ? " " + cmd.time : ""}`, async () => {
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
  b.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
});

// ---------- Hinweis ----------
let toastTimer;
function toast(msg, undo) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? `<button>Rückgängig</button>` : ""}`;
  el.hidden = false;
  if (undo) el.querySelector("button").onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), undo ? 6000 : 3000);
}

document.addEventListener("visibilitychange", () => { if (!document.hidden && state.user) refresh(); });

boot();
