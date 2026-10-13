// Training: Pläne mit Übungen, Sätze mit kg und Wiederholungen, Pause-Timer, Verlauf je Übung.
import { PATTERNS, figureSvg } from "./figures.js";

// Startplan aus der Beschreibung des Nutzers (Rücken + Trizeps)
const SEED = [
  ["Latziehen breit (lange Stange)", "lat_wide"],
  ["Latziehen eng (enge Stange)", "lat_close"],
  ["Rudern schräg, Brust aufgelegt", "row_incline"],
  ["Einarmig ziehen sitzend (Maschine)", "row_single"],
  ["Trizeps am Seil nach unten", "pushdown"],
  ["Trizeps am Seil nach vorne", "overhead_ext"],
  ["SZ-Stirndrücken", "skullcrusher"],
];

export function createTraining(ctx) {
  const { db, t, esc, $, toast, openSheet, closeSheet, sheet, form, isoDate, fmtDay, LOCALE } = ctx;
  const T = { exercises: [], workouts: [], sessions: [], sets: [], loaded: false, draft: {}, extraRows: {}, extraEx: [], rest: null, host: null };

  const num = (n) => (n == null || n === "" ? "" : (Math.round(Number(n) * 100) / 100).toLocaleString(LOCALE()));
  const parseNum = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
  const exById = (id) => T.exercises.find((e) => e.id === id);
  const active = () => T.sessions.find((s) => !s.finished_at) ?? null;
  const setsOf = (sessionId, exId) => T.sets.filter((s) => s.session_id === sessionId && s.exercise_id === exId).sort((a, b) => a.set_no - b.set_no);
  // Letzte abgeschlossene Einheit mit dieser Übung (außer der laufenden)
  const lastSets = (exId, exceptSession) => {
    const s = T.sessions.find((x) => x.id !== exceptSession && T.sets.some((y) => y.session_id === x.id && y.exercise_id === exId));
    return s ? { session: s, sets: setsOf(s.id, exId) } : null;
  };
  const fmtSet = (s) => `${s.kg != null ? num(s.kg) + " kg" : "–"} × ${s.reps ?? "–"}`;
  const volume = (sets) => sets.reduce((a, s) => a + (Number(s.kg) || 0) * (s.reps || 0), 0);

  async function load(force = false) {
    if (T.loaded && !force) return;
    const [e, w, s, x] = await Promise.all([
      db.from("exercises").select("*").order("created_at"),
      db.from("workouts").select("*").order("created_at"),
      db.from("workout_sessions").select("*").order("started_at", { ascending: false }).limit(300),
      db.from("workout_sets").select("*").order("created_at", { ascending: false }).limit(5000),
    ]);
    if (e.error) return toast(e.error.message);
    T.exercises = e.data ?? []; T.workouts = w.data ?? []; T.sessions = s.data ?? []; T.sets = x.data ?? [];
    T.loaded = true;
    if (!T.exercises.length && !T.workouts.length) await seed();
  }

  async function seed() {
    const { data: ex, error } = await db.from("exercises").insert(SEED.map(([name, pattern]) => ({ name, pattern, sets: 3, rest_sec: 90 }))).select();
    if (error) return toast(error.message);
    const byName = Object.fromEntries((ex ?? []).map((x) => [x.name, x.id]));
    const { data: w } = await db.from("workouts").insert({ name: "Rücken + Trizeps", exercise_ids: SEED.map(([n]) => byName[n]) }).select().single();
    T.exercises = ex ?? []; T.workouts = w ? [w] : [];
  }

  // ---------- Übersicht ----------
  function render(host) {
    T.host = host;
    if (!T.loaded) { host.innerHTML = `<div class="empty">${t("Lade …")}</div>`; load().then(() => render(host)); return; }
    const run = active();
    host.innerHTML = run ? runHtml(run) : homeHtml();
    bind(host);
    paintRest();
  }
  const rerender = () => { if (T.host?.isConnected) render(T.host); };

  function homeHtml() {
    let html = "";
    for (const w of T.workouts) {
      const last = T.sessions.find((s) => s.workout_id === w.id && s.finished_at);
      html += `<div class="card plan-card">
        <div class="plan-head"><div><p class="eyebrow">${t("Trainingsplan")}</p><h3>${esc(w.name)}</h3>
          <p class="small muted">${t("{n} Übungen", { n: w.exercise_ids.length })}${last ? " · " + t("zuletzt {d}", { d: fmtDay(isoDate(new Date(last.started_at))) }) : ""}</p></div>
          <button type="button" class="link-btn" data-w-edit="${w.id}">${t("Bearbeiten")}</button></div>
        <div class="plan-figs">${w.exercise_ids.map(exById).filter(Boolean).map((x) => figureSvg(x.pattern, { size: 54, animate: false })).join("")}</div>
        <button type="button" class="btn fill" data-w-start="${w.id}">${t("Training starten")}</button>
      </div>`;
    }
    html += `<button type="button" class="ghost" id="w-new">${t("+ Neuer Plan")}</button>`;
    html += `<div class="section-head"><h3>${t("Übungen")}</h3><span class="muted">${T.exercises.length}</span></div>`;
    html += T.exercises.map((x) => {
      const best = Math.max(0, ...T.sets.filter((s) => s.exercise_id === x.id).map((s) => Number(s.kg) || 0));
      const last = lastSets(x.id);
      return `<button type="button" class="ex-row" data-ex="${x.id}">${figureSvg(x.pattern, { size: 64, animate: false })}
        <span class="ex-body"><b>${esc(x.name)}</b><span class="small muted">${last ? t("Letztes Mal: {x}", { x: last.sets.map(fmtSet).join(" · ") }) : t("Noch nicht trainiert")}</span>
        ${best ? `<span class="small">${t("Bestwert {n} kg", { n: num(best) })}</span>` : ""}</span><span class="muted">›</span></button>`;
    }).join("");
    html += `<button type="button" class="ghost" id="ex-new">${t("+ Neue Übung")}</button>`;
    const done = T.sessions.filter((s) => s.finished_at).slice(0, 10);
    if (done.length) {
      html += `<div class="section-head"><h3>${t("Letzte Trainings")}</h3></div>`;
      html += done.map((s) => {
        const sets = T.sets.filter((x) => x.session_id === s.id);
        const mins = Math.round((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60000);
        return `<div class="card hist-card"><b>${esc(s.name ?? t("Training"))}</b><span class="small muted">${fmtDay(isoDate(new Date(s.started_at)), { weekday: "long", day: "numeric", month: "long" })} · ${t("{n} Min.", { n: mins })}</span>
          <span class="small">${t("{n} Sätze · {kg} kg bewegt", { n: sets.length, kg: num(Math.round(volume(sets))) })}</span></div>`;
      }).join("");
    }
    return html;
  }

  // ---------- Laufendes Training ----------
  function runExercises(run) {
    const w = T.workouts.find((x) => x.id === run.workout_id);
    const ids = [...(w?.exercise_ids ?? [])];
    for (const s of T.sets) if (s.session_id === run.id && !ids.includes(s.exercise_id)) ids.push(s.exercise_id);
    for (const id of T.extraEx) if (!ids.includes(id)) ids.push(id);
    return ids.map(exById).filter(Boolean);
  }

  function runHtml(run) {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(run.started_at)) / 60000));
    const all = T.sets.filter((s) => s.session_id === run.id);
    let html = `<div class="hero run-hero"><p class="eyebrow">${t("Training läuft")}</p><h2>${esc(run.name ?? t("Training"))}</h2>
      <div class="meta"><span>${t("seit {n} Min.", { n: mins })}</span><span>${t("{n} Sätze · {kg} kg", { n: all.length, kg: num(Math.round(volume(all))) })}</span></div></div>`;
    for (const x of runExercises(run)) {
      const logged = setsOf(run.id, x.id);
      const prev = lastSets(x.id, run.id);
      const rows = Math.max(logged.length, x.sets ?? 3, prev?.sets.length ?? 0) + (T.extraRows[x.id] ?? 0);
      const allDone = logged.length >= rows;
      html += `<div class="card ex-card ${allDone ? "complete" : ""}" data-run-ex="${x.id}">
        <div class="ex-top"><button type="button" class="fig-btn" data-ex="${x.id}" aria-label="${esc(x.name)}">${figureSvg(x.pattern, { size: 92 })}</button>
          <div><h3>${esc(x.name)}</h3><p class="small muted">${prev ? t("Letztes Mal: {x}", { x: prev.sets.map(fmtSet).join(" · ") }) : t("Erstes Mal")}</p></div></div>
        <div class="set-grid"><span>${t("Satz")}</span><span>kg</span><span>${t("Wdh.")}</span><span></span>`;
      for (let i = 0; i < rows; i++) {
        const s = logged[i];
        const ph = prev?.sets[i] ?? logged[logged.length - 1] ?? prev?.sets[prev.sets.length - 1];
        const d = T.draft[x.id]?.[i] ?? {};
        if (s) {
          html += `<span class="set-no done">${i + 1}</span><span class="set-val">${num(s.kg)}</span><span class="set-val">${s.reps ?? ""}</span>
            <button type="button" class="check on" data-unlog="${s.id}" aria-label="${t("Nicht erledigt")}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`;
        } else {
          html += `<span class="set-no">${i + 1}</span>
            <input class="set-in" inputmode="decimal" data-draft="${x.id}:${i}:kg" value="${esc(d.kg ?? "")}" placeholder="${esc(num(ph?.kg))}" aria-label="kg">
            <input class="set-in" inputmode="numeric" data-draft="${x.id}:${i}:reps" value="${esc(d.reps ?? "")}" placeholder="${esc(ph?.reps ?? "")}" aria-label="${t("Wdh.")}">
            <button type="button" class="check" data-log="${x.id}:${i}" aria-label="${t("Satz speichern")}"></button>`;
        }
      }
      html += `</div><button type="button" class="link-btn add-set" data-add-row="${x.id}">${t("+ Satz")}</button></div>`;
    }
    const others = T.exercises.filter((x) => !runExercises(run).includes(x));
    if (others.length) html += `<p class="small muted" style="margin-top:14px">${t("Übung dazunehmen")}</p><div class="chips">${others.map((x) => `<button type="button" class="chip" data-add-ex="${x.id}">+ ${esc(x.name)}</button>`).join("")}</div>`;
    html += `<button type="button" class="primary" id="run-finish">${t("Training beenden")}</button>
      <button type="button" class="ghost danger" id="run-cancel">${t("Training verwerfen")}</button>`;
    return html;
  }

  async function start(workoutId) {
    await load();
    if (active()) return rerender();
    const w = T.workouts.find((x) => x.id === workoutId) ?? T.workouts[0];
    const { data, error } = await db.from("workout_sessions").insert({ workout_id: w?.id ?? null, name: w?.name ?? t("Training") }).select().single();
    if (error) return toast(error.message);
    T.sessions.unshift(data);
    T.draft = {}; T.extraRows = {}; T.extraEx = [];
    rerender();
    window.scrollTo(0, 0);
  }

  async function logSet(exId, kg, reps, { quiet = false } = {}) {
    let run = active();
    if (!run) { await start(); run = active(); }
    if (!run) return;
    const set_no = setsOf(run.id, exId).length + 1;
    const { data, error } = await db.from("workout_sets").insert({ session_id: run.id, exercise_id: exId, set_no, kg, reps }).select().single();
    if (error) return toast(error.message);
    T.sets.unshift(data);
    T.lastEx = exId;
    if (navigator.vibrate) navigator.vibrate(10);
    const x = exById(exId);
    startRest(x?.rest_sec ?? 90);
    if (!quiet) rerender();
    return data;
  }

  async function unlog(setId) {
    const s = T.sets.find((x) => x.id === setId);
    await db.from("workout_sets").delete().eq("id", setId);
    T.sets = T.sets.filter((x) => x.id !== setId);
    // Nummern der übrigen Sätze nachziehen
    if (s) {
      const rest = setsOf(s.session_id, s.exercise_id);
      for (const [i, r] of rest.entries()) if (r.set_no !== i + 1) { r.set_no = i + 1; await db.from("workout_sets").update({ set_no: i + 1 }).eq("id", r.id); }
    }
    rerender();
  }

  async function finish() {
    const run = active();
    if (!run) return;
    const all = T.sets.filter((s) => s.session_id === run.id);
    if (!all.length) return cancel(true);
    const finished_at = new Date().toISOString();
    await db.from("workout_sessions").update({ finished_at }).eq("id", run.id);
    run.finished_at = finished_at;
    stopRest();
    await ctx.onFinish?.(run);
    toast(t("Training gespeichert: {n} Sätze, {kg} kg bewegt", { n: all.length, kg: num(Math.round(volume(all))) }));
    rerender();
  }

  async function cancel(silent = false) {
    const run = active();
    if (!run) return;
    if (!silent && !confirm(t("Training verwerfen? Die Sätze werden gelöscht."))) return;
    await db.from("workout_sets").delete().eq("session_id", run.id);
    await db.from("workout_sessions").delete().eq("id", run.id);
    T.sets = T.sets.filter((s) => s.session_id !== run.id);
    T.sessions = T.sessions.filter((s) => s.id !== run.id);
    stopRest();
    rerender();
  }

  // ---------- Pause-Timer ----------
  let restTimer = null;
  function startRest(sec) {
    T.rest = { until: Date.now() + sec * 1000 };
    clearInterval(restTimer);
    restTimer = setInterval(paintRest, 500);
    paintRest();
  }
  function stopRest() { T.rest = null; clearInterval(restTimer); paintRest(); }
  function paintRest() {
    let bar = $("#rest");
    if (!T.rest || !active()) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "rest";
      document.body.append(bar);
    }
    const left = Math.ceil((T.rest.until - Date.now()) / 1000);
    if (left <= 0) {
      if (!T.rest.rang) { T.rest.rang = true; if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
      bar.className = "go";
      bar.innerHTML = `<span>${t("Pause vorbei, nächster Satz")}</span><button type="button" data-rest="stop">OK</button>`;
      if (left < -20) stopRest();
    } else {
      bar.className = "";
      bar.innerHTML = `<span>${t("Pause")} <b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</b></span>
        <button type="button" data-rest="add">+30 s</button><button type="button" data-rest="stop">${t("Weiter")}</button>`;
    }
    bar.querySelectorAll("[data-rest]").forEach((b) => (b.onclick = () => { if (b.dataset.rest === "add") { T.rest.until += 30000; paintRest(); } else stopRest(); }));
  }

  // ---------- Bedienung ----------
  function bind(host) {
    host.querySelectorAll("[data-w-start]").forEach((b) => (b.onclick = () => start(b.dataset.wStart)));
    host.querySelectorAll("[data-w-edit]").forEach((b) => (b.onclick = () => openWorkoutSheet(T.workouts.find((w) => w.id === b.dataset.wEdit))));
    host.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => openExercise(exById(b.dataset.ex))));
    host.querySelector("#w-new")?.addEventListener("click", () => openWorkoutSheet());
    host.querySelector("#ex-new")?.addEventListener("click", () => openExerciseEdit());
    host.querySelectorAll("[data-draft]").forEach((inp) => (inp.oninput = () => {
      const [id, i, k] = inp.dataset.draft.split(":");
      ((T.draft[id] ??= {})[i] ??= {})[k] = inp.value;
    }));
    host.querySelectorAll("[data-log]").forEach((b) => (b.onclick = async () => {
      const [id, i] = b.dataset.log.split(":");
      const kgIn = host.querySelector(`[data-draft="${id}:${i}:kg"]`), repIn = host.querySelector(`[data-draft="${id}:${i}:reps"]`);
      const kg = parseNum(kgIn.value || kgIn.placeholder), reps = parseNum(repIn.value || repIn.placeholder);
      if (kg == null && reps == null) { kgIn.focus(); return toast(t("Bitte kg und Wiederholungen eintragen")); }
      if (T.draft[id]) delete T.draft[id][i];
      await logSet(id, kg, reps == null ? null : Math.round(reps));
    }));
    host.querySelectorAll("[data-unlog]").forEach((b) => (b.onclick = () => unlog(b.dataset.unlog)));
    host.querySelectorAll("[data-add-row]").forEach((b) => (b.onclick = () => { T.extraRows[b.dataset.addRow] = (T.extraRows[b.dataset.addRow] ?? 0) + 1; rerender(); }));
    host.querySelectorAll("[data-add-ex]").forEach((b) => (b.onclick = () => { T.extraEx.push(b.dataset.addEx); rerender(); }));
    host.querySelector("#run-finish")?.addEventListener("click", finish);
    host.querySelector("#run-cancel")?.addEventListener("click", () => cancel());
  }

  // ---------- Übung: Verlauf und Fortschritt ----------
  function progressSvg(points) {
    if (points.length < 2) return "";
    const W = 300, H = 110, P = 18;
    const ys = points.map((p) => p.kg), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
    const xy = points.map((p, i) => [P + (i * (W - 2 * P)) / (points.length - 1), H - P - ((p.kg - min) / span) * (H - 2 * P)]);
    return `<svg class="progress" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("Fortschritt")}">
      <polyline points="${xy.map((p) => p.join(",")).join(" ")}" />
      ${xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4"><title>${fmtDay(points[i].date)}: ${num(points[i].kg)} kg</title></circle>`).join("")}
      <text x="${P}" y="12">${num(max)} kg</text><text x="${P}" y="${H - 2}">${num(min)} kg</text>
    </svg>`;
  }

  function openExercise(x) {
    if (!x) return;
    const sessions = T.sessions.filter((s) => T.sets.some((y) => y.session_id === s.id && y.exercise_id === x.id));
    const points = sessions.slice(0, 12).reverse().map((s) => ({ date: isoDate(new Date(s.started_at)), kg: Math.max(0, ...setsOf(s.id, x.id).map((y) => Number(y.kg) || 0)) }));
    const best = Math.max(0, ...T.sets.filter((s) => s.exercise_id === x.id).map((s) => Number(s.kg) || 0));
    form.innerHTML = `<div class="ex-hero">${figureSvg(x.pattern, { size: 220 })}</div>
      <h3 class="detail-title">${esc(x.name)}</h3>
      ${x.notes ? `<p class="small">${esc(x.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <dl class="details">
        <dt>${t("Bestwert")}</dt><dd>${best ? num(best) + " kg" : "–"}</dd>
        <dt>${t("Standard")}</dt><dd>${t("{n} Sätze · {s} s Pause", { n: x.sets, s: x.rest_sec })}</dd>
        <dt>${t("Trainings")}</dt><dd>${sessions.length}</dd>
      </dl>
      ${points.length > 1 ? `<p class="eyebrow" style="margin-top:14px">${t("Höchstes Gewicht je Training")}</p>${progressSvg(points)}` : ""}
      ${sessions.length ? `<p class="eyebrow" style="margin-top:14px">${t("Verlauf")}</p>
        <div class="ex-hist">${sessions.slice(0, 20).map((s) => `<div><span class="small muted">${fmtDay(isoDate(new Date(s.started_at)))}</span><span>${setsOf(s.id, x.id).map(fmtSet).join(" · ")}</span></div>`).join("")}</div>` : ""}
      <button type="button" class="ghost" id="ex-edit">${t("Bearbeiten")}</button>`;
    form.onsubmit = (e) => e.preventDefault();
    $("#ex-edit").onclick = () => openExerciseEdit(x);
    openSheet(sheet);
  }

  function openExerciseEdit(x = {}) {
    x = x ?? {};
    let pattern = x.pattern ?? "generic";
    form.innerHTML = `<h3>${t(x.id ? "Übung bearbeiten" : "Neue Übung")}</h3>
      <input name="name" placeholder="${t("Name, z. B. Latziehen")}" required value="${esc(x.name)}">
      <label>${t("Bild")}</label>
      <div class="fig-pick">${Object.entries(PATTERNS).map(([k, p]) => `<button type="button" data-pat="${k}" class="${k === pattern ? "on" : ""}" aria-label="${esc(t(p.label))}">${figureSvg(k, { size: 72, animate: false })}<span>${esc(t(p.label))}</span></button>`).join("")}</div>
      <div class="row">
        <div><label>${t("Sätze")}</label><input name="sets" type="number" inputmode="numeric" min="1" max="10" value="${x.sets ?? 3}"></div>
        <div><label>${t("Pause")}</label><select name="rest_sec">${[45, 60, 90, 120, 180].map((s) => `<option value="${s}" ${(x.rest_sec ?? 90) === s ? "selected" : ""}>${s} s</option>`).join("")}</select></div>
      </div>
      <label>${t("Notiz")}</label><textarea name="notes" rows="2" placeholder="${t("z. B. Sitzhöhe 4, Griff breit")}">${esc(x.notes)}</textarea>
      <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>
      ${x.id ? `<button type="button" class="ghost danger" id="ex-del">${t("Löschen")}</button>` : ""}
      <button type="button" class="ghost" id="ex-cancel">${t("Abbrechen")}</button>`;
    form.querySelectorAll("[data-pat]").forEach((b) => (b.onclick = () => {
      pattern = b.dataset.pat;
      form.querySelectorAll("[data-pat]").forEach((y) => y.classList.toggle("on", y === b));
    }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const row = { name: f.get("name").trim(), pattern, sets: Number(f.get("sets") || 3), rest_sec: Number(f.get("rest_sec") || 90), notes: f.get("notes").trim() || null };
      const res = x.id ? await db.from("exercises").update(row).eq("id", x.id).select().single() : await db.from("exercises").insert(row).select().single();
      if (res.error) return toast(res.error.message);
      if (x.id) Object.assign(x, res.data); else T.exercises.push(res.data);
      closeSheet(sheet); rerender();
    };
    $("#ex-cancel").onclick = () => closeSheet(sheet);
    const del = $("#ex-del");
    if (del) del.onclick = async () => {
      if (!confirm(t("Übung „{x}“ mit allen Sätzen löschen?", { x: x.name }))) return;
      await db.from("exercises").delete().eq("id", x.id);
      T.exercises = T.exercises.filter((y) => y.id !== x.id);
      T.sets = T.sets.filter((y) => y.exercise_id !== x.id);
      for (const w of T.workouts) if (w.exercise_ids.includes(x.id)) {
        w.exercise_ids = w.exercise_ids.filter((id) => id !== x.id);
        await db.from("workouts").update({ exercise_ids: w.exercise_ids }).eq("id", w.id);
      }
      closeSheet(sheet); rerender();
    };
    openSheet(sheet);
  }

  function openWorkoutSheet(w = {}) {
    w = w ?? {};
    let ids = [...(w.exercise_ids ?? [])];
    let name = w.name ?? "";
    const draw = () => {
      name = form.querySelector("#w-name")?.value ?? name;
      form.innerHTML = `<h3>${t(w.id ? "Plan bearbeiten" : "Neuer Plan")}</h3>
        <input name="name" id="w-name" placeholder="${t("Name, z. B. Brust + Bizeps")}" required value="${esc(name)}">
        <label>${t("Übungen in dieser Reihenfolge")}</label>
        <div class="w-list">${ids.map((id, i) => { const x = exById(id); return x ? `<div class="w-row">${figureSvg(x.pattern, { size: 44, animate: false })}<span>${esc(x.name)}</span>
          <button type="button" data-up="${i}" aria-label="↑" ${i ? "" : "disabled"}>↑</button><button type="button" data-down="${i}" aria-label="↓" ${i < ids.length - 1 ? "" : "disabled"}>↓</button><button type="button" data-rm="${i}" aria-label="${t("Entfernen")}">×</button></div>` : ""; }).join("") || `<p class="small muted">${t("Noch keine Übung gewählt.")}</p>`}</div>
        <div class="chips">${T.exercises.filter((x) => !ids.includes(x.id)).map((x) => `<button type="button" class="chip" data-pick="${x.id}">+ ${esc(x.name)}</button>`).join("")}</div>
        <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>
        ${w.id ? `<button type="button" class="ghost danger" id="w-del">${t("Plan löschen")}</button>` : ""}
        <button type="button" class="ghost" id="w-cancel">${t("Abbrechen")}</button>`;
      form.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; draw(); }));
      form.querySelectorAll("[data-down]").forEach((b) => (b.onclick = () => { const i = +b.dataset.down; [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; draw(); }));
      form.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { ids.splice(+b.dataset.rm, 1); draw(); }));
      form.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => { ids.push(b.dataset.pick); draw(); }));
      $("#w-cancel").onclick = () => closeSheet(sheet);
      const del = $("#w-del");
      if (del) del.onclick = async () => {
        if (!confirm(t("Plan „{x}“ löschen? Die Übungen und dein Verlauf bleiben.", { x: w.name }))) return;
        await db.from("workouts").delete().eq("id", w.id);
        T.workouts = T.workouts.filter((y) => y.id !== w.id);
        closeSheet(sheet); rerender();
      };
    };
    form.innerHTML = "";
    draw();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const row = { name: form.querySelector("[name=name]").value.trim(), exercise_ids: ids };
      const res = w.id ? await db.from("workouts").update(row).eq("id", w.id).select().single() : await db.from("workouts").insert(row).select().single();
      if (res.error) return toast(res.error.message);
      if (w.id) Object.assign(w, res.data); else T.workouts.push(res.data);
      closeSheet(sheet); rerender();
    };
    openSheet(sheet);
  }

  // ---------- Sprache ----------
  async function runVoice(c) {
    await load();
    if (c.action === "start") { await start(c.workout?.id); return t("Training gestartet: {x}", { x: active()?.name ?? "" }); }
    if (c.action === "stop") { await finish(); return null; }
    const exId = c.exercise?.id ?? (active() && T.lastEx) ?? null;
    if (!exId) return t("Welche Übung? Sag z. B. „Latziehen 50 kg 12 Wiederholungen“.");
    for (let k = 0; k < (c.sets ?? 1); k++) await logSet(exId, c.kg ?? null, c.reps ?? null, { quiet: true });
    rerender();
    return `${exById(exId)?.name}: ${c.sets > 1 ? c.sets + " × " : ""}${c.kg != null ? num(c.kg) + " kg" : ""}${c.reps != null ? " × " + c.reps : ""}`;
  }

  return {
    load, render, start, finish, runVoice,
    active, exercises: () => T.exercises, workouts: () => T.workouts,
    figure: figureSvg,
  };
}
