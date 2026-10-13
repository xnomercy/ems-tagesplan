// Training: Pläne mit Übungen, Sätze mit kg und Wiederholungen, Pause-Timer, Verlauf je Übung.
import { PATTERNS, figureSvg } from "./figures.js";
import { analyse, suggest, sessionStats, planMinutes, GROUPS } from "./analyse.js";

// Startplan aus der Beschreibung des Nutzers (Rücken + Trizeps)
const SEED = [
  ["Latziehen breit (lange Stange)", "lat_wide"],
  ["Latziehen eng (enge Stange)", "lat_close"],
  ["Rudern schräg, Brust aufgelegt", "row_incline"],
  ["Rudern einarmig mit Brustauflage (Maschine)", "row_single"],
  ["Trizeps am Seil nach unten", "pushdown"],
  ["Trizeps am Seil nach vorne", "overhead_ext"],
  ["SZ-Stirndrücken", "skullcrusher"],
];

// Ergänzung vom 2026-10-13: unterer Rücken, hintere Schulter, Bauch, Laufband
const EXTRA = [
  ["Face Pulls am Seil", "face_pull", "reps", 3, 60, "Seil auf Augenhöhe, Ellbogen hoch, zum Gesicht ziehen"],
  ["Hyperextensions (45°)", "hyperext", "reps", 3, 60, "Langsam, oben nicht ins Hohlkreuz"],
  ["Rumänisches Kreuzheben (Kurzhanteln)", "rdl", "reps", 3, 90, "Leicht anfangen, Rücken gerade, Hüfte nach hinten schieben"],
  ["Hip Thrust", "hip_thrust", "reps", 3, 90, "Oben kurz halten, Gesäß anspannen"],
  ["Reverse Butterfly", "reverse_fly", "reps", 3, 60, "Leichtes Gewicht, Schulterblätter zusammenziehen"],
  ["Dead Bug", "dead_bug", "reps", 3, 45, "Pro Seite zählen, unterer Rücken bleibt am Boden"],
  ["Seitstütz", "side_plank", "time", 2, 45, "Pro Seite"],
  ["Pallof Press", "pallof", "reps", 3, 45, "Pro Seite, Oberkörper nicht mitdrehen"],
  ["Laufband bergauf", "treadmill", "cardio", 1, 0, "8 bis 12 % Steigung, 4,5 bis 5,5 km/h, nicht festhalten"],
];
const EXTRA_KEY = "tagesplan-train-v2";
// Ergänzung vom 2026-10-13 (2): Plank und Sit-ups für den Bauch
const EXTRA3 = [
  ["Unterarmstütz (Plank)", "plank", "time", 3, 45, "Ellbogen unter den Schultern, Bauch und Po fest, kein Hohlkreuz"],
  ["Sit-ups", "situp", "reps", 3, 45, "Füße am Boden, langsam abrollen, nicht am Kopf ziehen"],
];
const EXTRA3_KEY = "tagesplan-train-v3";
// Pro laufendem Training: entfernte und dazugenommene Übungen (überlebt Neuladen)
const RUN_KEY = "tagesplan-train-run";

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
  // Erfassung je Übung: kg × Wiederholungen, Zeit (Sekunden) oder Cardio (Minuten, km/h, Steigung)
  const FIELDS = {
    reps: [{ k: "kg", label: "kg", dec: true }, { k: "reps", label: "Wdh." }],
    time: [{ k: "kg", label: "kg", dec: true }, { k: "duration_sec", label: "Sek." }],
    cardio: [{ k: "duration_sec", label: "Min.", scale: 60, dec: true }, { k: "speed", label: "km/h", dec: true }, { k: "incline", label: "%", dec: true }],
  };
  const modeOf = (x) => (FIELDS[x?.mode] ? x.mode : "reps");
  const fieldVal = (s, f) => (s?.[f.k] == null ? null : f.scale ? Number(s[f.k]) / f.scale : Number(s[f.k]));
  const fmtSet = (s) => {
    const m = modeOf(exById(s.exercise_id));
    if (m === "cardio") return [s.duration_sec != null ? num(s.duration_sec / 60) + " Min" : "", s.speed != null ? num(s.speed) + " km/h" : "", s.incline != null ? num(s.incline) + " %" : ""].filter(Boolean).join(" · ");
    if (m === "time") return `${s.kg ? num(s.kg) + " kg · " : ""}${s.duration_sec ?? "–"} s`;
    return s.kg != null ? `${num(s.kg)} kg × ${s.reps ?? "–"}` : `${s.reps ?? "–"} ${t("Wdh.")}`;
  };
  // Kennzahl für Bestwert und Kurve
  const metric = (x, sets) => {
    const m = modeOf(x);
    if (m === "cardio") return { v: Math.max(0, ...sets.map((s) => (s.duration_sec ?? 0) / 60)), u: "Min" };
    if (m === "time") return { v: Math.max(0, ...sets.map((s) => s.duration_sec ?? 0)), u: "s" };
    const kg = Math.max(0, ...sets.map((s) => Number(s.kg) || 0));
    return kg ? { v: kg, u: "kg" } : { v: Math.max(0, ...sets.map((s) => s.reps ?? 0)), u: t("Wdh.") };
  };
  const volume = (sets) => sets.reduce((a, s) => a + (Number(s.kg) || 0) * (s.reps || 0), 0);
  // Dauer als "52 Min." oder "1:15 h"
  const fmtDur = (min) => (min < 60 ? t("{n} Min.", { n: min }) : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h`);
  // Text eines Vorschlags oder Hinweises übersetzen, Zahlen und Namen passend einsetzen
  const tx = (o) => t(o.text, Object.fromEntries(Object.entries(o.vars ?? {}).map(([k, v]) => [k, typeof v === "number" ? num(v) : k === "g" || k === "hint" ? t(v) : v])));

  // ---------- Laufendes Training: entfernte und zusätzliche Übungen ----------
  function runState(run) {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(RUN_KEY) || "null"); } catch {}
    return st?.sid === run.id ? st : { sid: run.id, hidden: [], extra: [] };
  }
  function saveRunState(st) { try { localStorage.setItem(RUN_KEY, JSON.stringify(st)); } catch {} }

  function load(force = false) {
    if (T.loaded && !force) return Promise.resolve();
    // Gleichzeitige Aufrufe teilen sich einen Ladevorgang, sonst würde doppelt angelegt
    return (T.loading ??= doLoad().finally(() => { T.loading = null; }));
  }
  async function doLoad() {
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
    await seedExtras();
    await seedExtras3();
  }

  // Plank und Sit-ups einmalig anlegen und in den Plan Core + Stabi nach dem Dead Bug einsortieren
  async function seedExtras3() {
    try { if (localStorage.getItem(EXTRA3_KEY)) return; } catch {}
    const have = new Set(T.exercises.map((x) => x.name.toLowerCase()));
    const missing = EXTRA3.filter(([n]) => !have.has(n.toLowerCase()));
    if (missing.length) {
      const { data, error } = await db.from("exercises").insert(missing.map(([name, pattern, mode, sets, rest_sec, notes]) => ({ name, pattern, mode, sets, rest_sec, notes }))).select();
      if (error) return;
      T.exercises.push(...(data ?? []));
    }
    const core = T.workouts.find((w) => /core/i.test(w.name));
    if (core) {
      const add = EXTRA3.map(([n]) => T.exercises.find((x) => x.name.toLowerCase() === n.toLowerCase())?.id).filter((id) => id && !core.exercise_ids.includes(id));
      if (add.length) {
        const ids = [...core.exercise_ids];
        const at = ids.findIndex((id) => exById(id)?.pattern === "dead_bug");
        ids.splice(at < 0 ? 0 : at + 1, 0, ...add);
        const { data } = await db.from("workouts").update({ exercise_ids: ids }).eq("id", core.id).select().single();
        core.exercise_ids = data?.exercise_ids ?? ids;
      }
    }
    try { localStorage.setItem(EXTRA3_KEY, "1"); } catch {}
  }

  // Neue Übungen einmalig ergänzen, ohne Doppelte und ohne gelöschte zurückzuholen
  async function seedExtras() {
    try { if (localStorage.getItem(EXTRA_KEY)) return; } catch {}
    const have = new Set(T.exercises.map((x) => x.name.toLowerCase()));
    const missing = EXTRA.filter(([n]) => !have.has(n.toLowerCase()));
    if (missing.length) {
      const { data, error } = await db.from("exercises").insert(missing.map(([name, pattern, mode, sets, rest_sec, notes]) => ({ name, pattern, mode, sets, rest_sec, notes }))).select();
      if (error) return;
      T.exercises.push(...(data ?? []));
    }
    const idOf = (n) => T.exercises.find((x) => x.name.toLowerCase() === n.toLowerCase())?.id;
    const back = T.workouts.find((w) => /rücken/i.test(w.name));
    if (back) {
      const add = ["Face Pulls am Seil", "Hyperextensions (45°)"].map(idOf).filter((id) => id && !back.exercise_ids.includes(id));
      if (add.length) {
        // nach den Zugübungen, vor dem Trizeps
        const ids = [...back.exercise_ids];
        const at = ids.findIndex((id) => /^(pushdown|overhead_ext|skullcrusher)$/.test(exById(id)?.pattern ?? ""));
        ids.splice(at < 0 ? ids.length : at, 0, ...add);
        const { data } = await db.from("workouts").update({ exercise_ids: ids }).eq("id", back.id).select().single();
        back.exercise_ids = data?.exercise_ids ?? ids;
      }
    }
    if (!T.workouts.some((w) => /core/i.test(w.name))) {
      const ids = ["Dead Bug", "Seitstütz", "Pallof Press", "Laufband bergauf"].map(idOf).filter(Boolean);
      const { data } = await db.from("workouts").insert({ name: "Core + Stabi", exercise_ids: ids }).select().single();
      if (data) T.workouts.push(data);
    }
    try { localStorage.setItem(EXTRA_KEY, "1"); } catch {}
  }

  async function seed() {
    const { data: ex, error } = await db.from("exercises").insert(SEED.map(([name, pattern]) => ({ name, pattern, sets: 3, rest_sec: 90 }))).select();
    if (error) return toast(error.message);
    const byName = Object.fromEntries((ex ?? []).map((x) => [x.name, x.id]));
    const { data: w } = await db.from("workouts").insert({ name: "Rücken + Trizeps", exercise_ids: SEED.map(([n]) => byName[n]) }).select().single();
    T.exercises = ex ?? []; T.workouts = w ? [w] : [];
  }

  // ---------- Übersicht ----------
  let elapsedTimer = null;
  function render(host) {
    T.host = host;
    clearInterval(elapsedTimer);
    // Laufende Dauer im Kopf des Trainings mitzählen
    elapsedTimer = setInterval(() => {
      const el = T.host?.querySelector("[data-elapsed]"), run = active();
      if (!el || !run) return clearInterval(elapsedTimer);
      el.textContent = t("Dauer {x}", { x: fmtDur(Math.max(0, Math.round((Date.now() - Date.parse(run.started_at)) / 60000))) });
    }, 20000);
    if (!T.loaded) { host.innerHTML = `<div class="empty">${t("Lade …")}</div>`; load().then(() => render(host)); return; }
    const run = active();
    host.innerHTML = run ? runHtml(run) : homeHtml();
    bind(host);
    paintRest();
  }
  const rerender = () => { if (T.host?.isConnected) render(T.host); };

  function homeHtml() {
    let html = "";
    // Kurzfassung der Analyse oben, Details im eigenen Blatt
    const A = analyse({ exercises: T.exercises, sessions: T.sessions, sets: T.sets });
    if (A.stats.length) {
      const top = A.tips.find((x) => x.level !== "info");
      html += `<div class="card an-card"><p class="eyebrow">${t("Analyse")}</p>
        <div class="an-tiles"><div><b>${A.last7}</b><span>${t("Tage in 7 Tagen")}</span></div><div><b>${A.avgMin != null ? fmtDur(A.avgMin) : "–"}</b><span>${t("Ø Dauer")}</span></div><div><b>${A.streak}</b><span>${t("Wochen in Folge")}</span></div></div>
        ${top ? `<p class="small an-tip ${top.level}">${esc(tx(top))}</p>` : ""}
        <button type="button" class="link-btn" id="an-open">${t("Ganze Analyse und Vorschläge")} ›</button></div>`;
    }
    for (const w of T.workouts) {
      const last = T.sessions.find((s) => s.workout_id === w.id && s.finished_at);
      html += `<div class="card plan-card">
        <div class="plan-head"><div><p class="eyebrow">${t("Trainingsplan")}</p><h3>${esc(w.name)}</h3>
          <p class="small muted">${t("{n} Übungen", { n: w.exercise_ids.length })} · ${t("ca. {n} Min.", { n: planMinutes(w, exById) })}${last ? " · " + t("zuletzt {d}", { d: fmtDay(isoDate(new Date(last.started_at))) }) : ""}</p></div>
          <button type="button" class="link-btn" data-w-edit="${w.id}">${t("Bearbeiten")}</button></div>
        <div class="plan-figs">${w.exercise_ids.map(exById).filter(Boolean).map((x) => figureSvg(x.pattern, { size: 54, animate: false })).join("")}</div>
        <button type="button" class="btn fill" data-w-start="${w.id}">${t("Training starten")}</button>
      </div>`;
    }
    html += `<button type="button" class="ghost" id="w-new">${t("+ Neuer Plan")}</button>`;
    html += `<div class="section-head"><h3>${t("Übungen")}</h3><span class="muted">${T.exercises.length}</span></div>`;
    html += T.exercises.map((x) => {
      const best = metric(x, T.sets.filter((s) => s.exercise_id === x.id));
      const last = lastSets(x.id);
      return `<button type="button" class="ex-row" data-ex="${x.id}">${figureSvg(x.pattern, { size: 64, animate: false })}
        <span class="ex-body"><b>${esc(x.name)}</b><span class="small muted">${last ? t("Letztes Mal: {x}", { x: last.sets.map(fmtSet).join(" · ") }) : t("Noch nicht trainiert")}</span>
        ${best.v ? `<span class="small">${t("Bestwert")}: ${num(best.v)} ${best.u}</span>` : ""}</span><span class="muted">›</span></button>`;
    }).join("");
    html += `<button type="button" class="ghost" id="ex-new">${t("+ Neue Übung")}</button>`;
    const done = T.sessions.filter((s) => s.finished_at).slice(0, 10);
    if (done.length) {
      html += `<div class="section-head"><h3>${t("Letzte Trainings")}</h3></div>`;
      html += done.map((s) => {
        const sets = T.sets.filter((x) => x.session_id === s.id);
        const st = sessionStats(s, T.sets, exById);
        return `<div class="card hist-card"><b>${esc(s.name ?? t("Training"))}</b><span class="small muted">${fmtDay(isoDate(new Date(s.started_at)), { weekday: "long", day: "numeric", month: "long" })} · ${hm(st.start)}–${hm(st.end)} · ${fmtDur(st.minutes)}</span>
          <span class="small">${volume(sets) ? t("{n} Sätze · {kg} kg bewegt", { n: sets.length, kg: num(Math.round(volume(sets))) }) : t("{n} Sätze", { n: sets.length })}</span></div>`;
      }).join("");
    }
    return html;
  }

  // ---------- Laufendes Training ----------
  function runExercises(run) {
    const w = T.workouts.find((x) => x.id === run.workout_id);
    const ids = [...(w?.exercise_ids ?? [])];
    for (const s of T.sets) if (s.session_id === run.id && !ids.includes(s.exercise_id)) ids.push(s.exercise_id);
    const st = runState(run);
    for (const id of st.extra) if (!ids.includes(id)) ids.push(id);
    // Eigene Reihenfolge für heute; neue Übungen behalten ihren Platz am Ende
    if (st.order?.length) {
      const pos = (id) => { const i = st.order.indexOf(id); return i < 0 ? 1000 + ids.indexOf(id) : i; };
      ids.sort((a, b) => pos(a) - pos(b));
    }
    // Entfernte Übungen ausblenden, außer es wurden inzwischen doch Sätze gespeichert
    return ids.filter((id) => !st.hidden.includes(id) || T.sets.some((s) => s.session_id === run.id && s.exercise_id === id)).map(exById).filter(Boolean);
  }

  function runHtml(run) {
    const mins = Math.max(0, Math.round((Date.now() - Date.parse(run.started_at)) / 60000));
    const all = T.sets.filter((s) => s.session_id === run.id);
    let html = `<div class="hero run-hero"><p class="eyebrow">${t("Training läuft")}</p><h2>${esc(run.name ?? t("Training"))}</h2>
      <div class="meta"><span data-elapsed>${t("Dauer {x}", { x: fmtDur(mins) })}</span><span>${volume(all) ? t("{n} Sätze · {kg} kg", { n: all.length, kg: num(Math.round(volume(all))) }) : t("{n} Sätze", { n: all.length })}</span></div></div>`;
    const list = runExercises(run);
    for (const [idx, x] of list.entries()) {
      const logged = setsOf(run.id, x.id);
      const prev = lastSets(x.id, run.id);
      const sug = suggest(x, T.sessions, T.sets, run.id);
      const rows = Math.max(logged.length, x.sets ?? 3, prev?.sets.length ?? 0) + (T.extraRows[x.id] ?? 0);
      const allDone = logged.length >= rows;
      html += `<div class="card ex-card ${allDone ? "complete" : ""}" data-run-ex="${x.id}">
        <div class="ex-top"><button type="button" class="fig-btn" data-ex="${x.id}" aria-label="${esc(x.name)}">${figureSvg(x.pattern, { size: 92 })}</button>
          <div class="ex-title"><h3>${esc(x.name)}</h3><p class="small muted">${prev ? t("Letztes Mal: {x}", { x: prev.sets.map(fmtSet).join(" · ") }) : t("Erstes Mal")}</p>
          ${sug ? `<p class="small sug ${sug.kind}">${t("Heute")}: ${esc(tx(sug))}</p>` : ""}</div>
          <span class="ex-mv"><button type="button" data-mv="${x.id}:-1" aria-label="${t("Nach oben")}" ${idx ? "" : "disabled"}>↑</button><button type="button" data-mv="${x.id}:1" aria-label="${t("Nach unten")}" ${idx < list.length - 1 ? "" : "disabled"}>↓</button></span></div>
        <div class="set-grid" style="grid-template-columns: 40px repeat(${FIELDS[modeOf(x)].length}, 1fr) 48px"><span>${t("Satz")}</span>${FIELDS[modeOf(x)].map((f) => `<span>${t(f.label)}</span>`).join("")}<span></span>`;
      for (let i = 0; i < rows; i++) {
        const s = logged[i];
        let ph = prev?.sets[i] ?? logged[logged.length - 1] ?? prev?.sets[prev.sets.length - 1];
        // Vorschlag steigern/senken: Arbeitssätze bekommen das neue Gewicht als Vorgabe
        if (ph && !logged[logged.length - 1] && sug?.target && sug.kind !== "keep" && (Number(ph.kg) || 0) >= sug.top * 0.9) ph = { ...ph, kg: sug.target.kg };
        const d = T.draft[x.id]?.[i] ?? {};
        if (s) {
          html += `<span class="set-no done">${i + 1}</span>${FIELDS[modeOf(x)].map((f) => `<span class="set-val">${num(fieldVal(s, f))}</span>`).join("")}
            <button type="button" class="check on" data-unlog="${s.id}" aria-label="${t("Nicht erledigt")}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`;
        } else {
          html += `<span class="set-no">${i + 1}</span>${FIELDS[modeOf(x)].map((f) => `<input class="set-in" inputmode="${f.dec ? "decimal" : "numeric"}" data-draft="${x.id}:${i}:${f.k}" value="${esc(d[f.k] ?? "")}" placeholder="${esc(num(fieldVal(ph, f)))}" aria-label="${t(f.label)}">`).join("")}
            <button type="button" class="check" data-log="${x.id}:${i}" aria-label="${t("Satz speichern")}"></button>`;
        }
      }
      html += `</div><div class="ex-foot"><button type="button" class="link-btn add-set" data-add-row="${x.id}">${t("+ Satz")}</button>
        <button type="button" class="link-btn ex-rm" data-rm-ex="${x.id}">${t("Entfernen")}</button></div></div>`;
    }
    const w = T.workouts.find((y) => y.id === run.workout_id);
    if (w && planOrder(run, w).join() !== w.exercise_ids.join()) html += `<button type="button" class="link-btn" id="run-order" style="margin-top:6px">${t("Diese Reihenfolge im Plan speichern")}</button>`;
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
    T.draft = {}; T.extraRows = {};
    saveRunState({ sid: data.id, hidden: [], extra: [] });
    rerender();
    window.scrollTo(0, 0);
  }

  async function logSet(exId, vals, { quiet = false } = {}) {
    let run = active();
    if (!run) { await start(); run = active(); }
    if (!run) return;
    const set_no = setsOf(run.id, exId).length + 1;
    const { data, error } = await db.from("workout_sets").insert({ session_id: run.id, exercise_id: exId, set_no, ...vals }).select().single();
    if (error) return toast(error.message);
    T.sets.unshift(data);
    T.lastEx = exId;
    if (navigator.vibrate) navigator.vibrate(10);
    const x = exById(exId);
    if ((x?.rest_sec ?? 90) > 0) startRest(x?.rest_sec ?? 90);
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
    // Länger als 20 Min. nach dem letzten Satz beendet: wahrscheinlich vergessen, dann zählt der letzte Satz
    let end = Date.now();
    const lastAt = Math.max(...all.map((s) => Date.parse(s.created_at)));
    if (end - lastAt > 20 * 60000 && confirm(t("Der letzte Satz war um {h}. Training um {e} enden lassen? (Abbrechen: jetzt)", { h: hm(lastAt), e: hm(lastAt + 3 * 60000) }))) end = lastAt + 3 * 60000;
    const finished_at = new Date(end).toISOString();
    await db.from("workout_sessions").update({ finished_at }).eq("id", run.id);
    run.finished_at = finished_at;
    stopRest();
    await ctx.onFinish?.(run);
    const vol = Math.round(volume(all));
    const dur = fmtDur(Math.round((end - Date.parse(run.started_at)) / 60000));
    toast(vol ? t("Training gespeichert: {d}, {n} Sätze, {kg} kg bewegt", { d: dur, n: all.length, kg: num(vol) }) : t("Training gespeichert: {d}, {n} Sätze", { d: dur, n: all.length }));
    rerender();
  }

  const hm = (ms) => new Date(ms).toLocaleTimeString(LOCALE(), { hour: "2-digit", minute: "2-digit" });

  // Übung aus dem laufenden Training nehmen; gespeicherte Sätze nur nach Rückfrage löschen
  async function removeEx(exId) {
    const run = active();
    if (!run) return;
    const x = exById(exId);
    const logged = setsOf(run.id, exId);
    if (logged.length) {
      if (!confirm(t("„{x}“ entfernen? Die {n} gespeicherten Sätze von heute werden gelöscht.", { x: x?.name ?? "", n: logged.length }))) return false;
      await db.from("workout_sets").delete().eq("session_id", run.id).eq("exercise_id", exId);
      T.sets = T.sets.filter((s) => !(s.session_id === run.id && s.exercise_id === exId));
    }
    const st = runState(run);
    if (!st.hidden.includes(exId)) st.hidden.push(exId);
    st.extra = st.extra.filter((id) => id !== exId);
    saveRunState(st);
    if (T.draft[exId]) delete T.draft[exId];
    if (T.lastEx === exId) T.lastEx = null;
    toast(t("Entfernt: {x}", { x: x?.name ?? "" }));
    rerender();
    return true;
  }
  // Übung im laufenden Training nach oben (-1), unten (1) oder an den Anfang ("first") schieben
  function moveEx(exId, dir) {
    const run = active();
    if (!run) return;
    const ids = runExercises(run).map((x) => x.id);
    const i = ids.indexOf(exId);
    if (i < 0) return;
    const j = dir === "first" ? 0 : dir === "last" ? ids.length - 1 : Math.max(0, Math.min(ids.length - 1, i + dir));
    ids.splice(i, 1); ids.splice(j, 0, exId);
    const st = runState(run);
    st.order = ids;
    saveRunState(st);
    rerender();
    // die verschobene Übung im Blick behalten
    requestAnimationFrame(() => T.host?.querySelector(`[data-run-ex="${exId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }
  // Reihenfolge von heute für den Plan: sichtbare Planübungen in neuer Folge, entfernte hinten dran
  function planOrder(run, w) {
    const vis = runExercises(run).map((x) => x.id).filter((id) => w.exercise_ids.includes(id));
    return [...vis, ...w.exercise_ids.filter((id) => !vis.includes(id))];
  }
  async function savePlanOrder() {
    const run = active();
    const w = T.workouts.find((y) => y.id === run?.workout_id);
    if (!w) return;
    const ids = planOrder(run, w);
    const { error } = await db.from("workouts").update({ exercise_ids: ids }).eq("id", w.id);
    if (error) return toast(error.message);
    w.exercise_ids = ids;
    toast(t("Reihenfolge gespeichert: {x}", { x: w.name }));
    rerender();
  }

  function addEx(exId) {
    const run = active();
    if (!run) return;
    const st = runState(run);
    st.hidden = st.hidden.filter((id) => id !== exId);
    if (!runExercises(run).some((x) => x.id === exId)) st.extra.push(exId);
    saveRunState(st);
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
  // Mitteilung am Ende: im Vordergrund direkt vom Handy, im Hintergrund schickt der Server sie (Tabelle rest_alarms)
  let restTimer = null;
  const restMsg = () => ({ title: t("Pause vorbei"), body: T.rest?.ex ? t("Nächster Satz: {x}", { x: T.rest.ex }) : t("Weiter geht's mit dem nächsten Satz") });
  function armAlarm() {
    if (!T.rest) return;
    const { title, body } = restMsg();
    db.from("rest_alarms").upsert({ due_at: new Date(T.rest.until).toISOString(), title, body }, { onConflict: "user_id" }).then(() => {}, () => {});
  }
  function disarmAlarm() { db.from("rest_alarms").delete().not("due_at", "is", null).then(() => {}, () => {}); }
  async function notifyLocal() {
    try {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const reg = await navigator.serviceWorker?.ready;
      const { title, body } = restMsg();
      await reg?.showNotification(title, { body, tag: "rest", renotify: true, icon: "icon-192.png", badge: "icon-192.png", data: { url: "./" } });
    } catch {}
  }
  function startRest(sec) {
    const x = exById(T.lastEx);
    T.rest = { until: Date.now() + sec * 1000, ex: x?.name ?? "" };
    clearInterval(restTimer);
    restTimer = setInterval(paintRest, 500);
    armAlarm();
    paintRest();
  }
  function stopRest() { if (T.rest && !T.rest.claimed) disarmAlarm(); T.rest = null; clearInterval(restTimer); paintRest(); }
  function paintRest() {
    let bar = $("#rest");
    if (!T.rest || !active()) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "rest";
      document.body.append(bar);
    }
    const left = Math.ceil((T.rest.until - Date.now()) / 1000);
    // App ist offen: kurz vor Ende selbst übernehmen, damit der Server nicht doppelt schickt
    if (left <= 1 && !T.rest.claimed && document.visibilityState === "visible") { T.rest.claimed = true; disarmAlarm(); }
    if (left <= 0) {
      if (!T.rest.rang) {
        T.rest.rang = true;
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        // nur wenn die Pause gerade eben endet; kommt die App später zurück, kam die Mitteilung schon vom Server
        if (T.rest.claimed && left > -3) notifyLocal();
      }
      bar.className = "go";
      bar.innerHTML = `<span>${t("Pause vorbei, nächster Satz")}</span><button type="button" data-rest="stop">OK</button>`;
      if (left < -20) stopRest();
    } else {
      bar.className = "";
      bar.innerHTML = `<span>${t("Pause")} <b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</b></span>
        <button type="button" data-rest="add">+30 s</button><button type="button" data-rest="stop">${t("Weiter")}</button>`;
    }
    bar.querySelectorAll("[data-rest]").forEach((b) => (b.onclick = () => { if (b.dataset.rest === "add") { T.rest.until += 30000; T.rest.claimed = false; T.rest.rang = false; armAlarm(); paintRest(); } else stopRest(); }));
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
      const vals = {};
      let first = null;
      for (const f of FIELDS[modeOf(exById(id))]) {
        const inp = host.querySelector(`[data-draft="${id}:${i}:${f.k}"]`);
        first ??= inp;
        const v = parseNum(inp.value || inp.placeholder.replace(/\./g, ""));
        vals[f.k] = v == null ? null : f.scale ? Math.round(v * f.scale) : f.dec ? v : Math.round(v);
      }
      if (Object.values(vals).every((v) => v == null)) { first?.focus(); return toast(t("Bitte Werte eintragen")); }
      if (T.draft[id]) delete T.draft[id][i];
      await logSet(id, vals);
    }));
    host.querySelectorAll("[data-unlog]").forEach((b) => (b.onclick = () => unlog(b.dataset.unlog)));
    host.querySelectorAll("[data-add-row]").forEach((b) => (b.onclick = () => { T.extraRows[b.dataset.addRow] = (T.extraRows[b.dataset.addRow] ?? 0) + 1; rerender(); }));
    host.querySelectorAll("[data-add-ex]").forEach((b) => (b.onclick = () => addEx(b.dataset.addEx)));
    host.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { const [id, d] = b.dataset.mv.split(":"); moveEx(id, Number(d)); }));
    host.querySelector("#run-order")?.addEventListener("click", savePlanOrder);
    host.querySelectorAll("[data-rm-ex]").forEach((b) => (b.onclick = () => removeEx(b.dataset.rmEx)));
    host.querySelector("#an-open")?.addEventListener("click", openAnalysis);
    host.querySelector("#run-finish")?.addEventListener("click", finish);
    host.querySelector("#run-cancel")?.addEventListener("click", () => cancel());
  }

  // ---------- Übung: Verlauf und Fortschritt ----------
  function progressSvg(points, u = "kg") {
    if (points.length < 2) return "";
    const W = 300, H = 110, P = 18;
    const ys = points.map((p) => p.kg), min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
    const xy = points.map((p, i) => [P + (i * (W - 2 * P)) / (points.length - 1), H - P - ((p.kg - min) / span) * (H - 2 * P)]);
    return `<svg class="progress" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("Fortschritt")}">
      <polyline points="${xy.map((p) => p.join(",")).join(" ")}" />
      ${xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4"><title>${fmtDay(points[i].date)}: ${num(points[i].kg)} ${u}</title></circle>`).join("")}
      <text x="${P}" y="12">${num(max)} ${u}</text><text x="${P}" y="${H - 2}">${num(min)} ${u}</text>
    </svg>`;
  }

  function openExercise(x) {
    if (!x) return;
    const sessions = T.sessions.filter((s) => T.sets.some((y) => y.session_id === s.id && y.exercise_id === x.id));
    const best = metric(x, T.sets.filter((s) => s.exercise_id === x.id));
    const points = sessions.slice(0, 12).reverse().map((s) => ({ date: isoDate(new Date(s.started_at)), kg: metric(x, setsOf(s.id, x.id)).v }));
    form.innerHTML = `<div class="ex-hero">${figureSvg(x.pattern, { size: 220 })}</div>
      <h3 class="detail-title">${esc(x.name)}</h3>
      ${x.notes ? `<p class="small">${esc(x.notes).replace(/\n/g, "<br>")}</p>` : ""}
      <dl class="details">
        <dt>${t("Bestwert")}</dt><dd>${best.v ? num(best.v) + " " + best.u : "–"}</dd>
        <dt>${t("Standard")}</dt><dd>${t("{n} Sätze · {s} s Pause", { n: x.sets, s: x.rest_sec })}</dd>
        <dt>${t("Trainings")}</dt><dd>${sessions.length}</dd>
        ${(() => { const sg = suggest(x, T.sessions, T.sets, active()?.id); return sg ? `<dt>${t("Vorschlag")}</dt><dd>${esc(tx(sg))}</dd>` : ""; })()}
      </dl>
      ${points.length > 1 ? `<p class="eyebrow" style="margin-top:14px">${t(best.u === "kg" ? "Höchstes Gewicht je Training" : "Bester Wert je Training")}</p>${progressSvg(points, best.u)}` : ""}
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
      <label>${t("Erfassung")}</label>
      <select name="mode">${[["reps", "kg und Wiederholungen"], ["time", "Zeit in Sekunden"], ["cardio", "Cardio: Minuten, km/h, Steigung"]].map(([v, n]) => `<option value="${v}" ${modeOf(x) === v ? "selected" : ""}>${t(n)}</option>`).join("")}</select>
      <div class="row">
        <div><label>${t("Sätze")}</label><input name="sets" type="number" inputmode="numeric" min="1" max="10" value="${x.sets ?? 3}"></div>
        <div><label>${t("Pause")}</label><select name="rest_sec">${[0, 45, 60, 90, 120, 180].map((s) => `<option value="${s}" ${(x.rest_sec ?? 90) === s ? "selected" : ""}>${s ? s + " s" : t("keine")}</option>`).join("")}</select></div>
      </div>
      <label>${t("Notiz")}</label><textarea name="notes" rows="2" placeholder="${t("z. B. Sitzhöhe 4, Griff breit")}">${esc(x.notes)}</textarea>
      <div class="sheet-actions"><button class="primary" value="save">${t("Speichern")}</button></div>
      ${x.id ? `<button type="button" class="ghost danger" id="ex-del">${t("Löschen")}</button>` : ""}
      <button type="button" class="ghost" id="ex-cancel">${t("Abbrechen")}</button>`;
    form.querySelectorAll("[data-pat]").forEach((b) => (b.onclick = () => {
      pattern = b.dataset.pat;
      const auto = { side_plank: "time", plank: "time", treadmill: "cardio" }[pattern];
      if (auto && !x.id) form.querySelector("[name=mode]").value = auto;
      form.querySelectorAll("[data-pat]").forEach((y) => y.classList.toggle("on", y === b));
    }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const row = { name: f.get("name").trim(), pattern, mode: f.get("mode") || "reps", sets: Number(f.get("sets") || 3), rest_sec: Number(f.get("rest_sec") || 90), notes: f.get("notes").trim() || null };
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

  // ---------- Analyse ----------
  function weekBars(weeks) {
    const W = 300, H = 120, P = 16, bw = (W - 2 * P) / weeks.length;
    const max = Math.max(60, ...weeks.map((w) => w.minutes));
    return `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("Trainingszeit pro Woche")}">
      ${weeks.map((w, i) => {
        const h = Math.round((w.minutes / max) * (H - 42));
        const x = P + i * bw + 6;
        return `<rect x="${x}" y="${H - 22 - h}" width="${bw - 12}" height="${Math.max(h, 2)}" rx="4" class="${i === weeks.length - 1 ? "now" : ""}"><title>${w.minutes} Min · ${w.sets} ${t("Sätze")}</title></rect>
          <text x="${x + (bw - 12) / 2}" y="${H - 26 - h}" text-anchor="middle">${w.minutes ? fmtDur(w.minutes).replace(" Min.", "′").replace(" h", "") : ""}</text>
          <text x="${x + (bw - 12) / 2}" y="${H - 6}" text-anchor="middle" class="lbl">${new Date(w.from).toLocaleDateString(LOCALE(), { day: "numeric", month: "numeric" })}</text>`;
      }).join("")}
    </svg>`;
  }

  async function openAnalysis() {
    await load();
    const A = analyse({ exercises: T.exercises, sessions: T.sessions, sets: T.sets });
    const icon = { warn: "!", plan: "→", time: "⏱", info: "i" };
    const gauge = (g) => {
      const G = GROUPS[g], v = A.groups[g], pct = Math.min(100, Math.round((v / (G.target || 1)) * 100));
      return `<div class="gauge"><span>${esc(t(G.label))}</span><span class="small muted">${v} / ${G.target}${g === "cardio" ? " " + t("Einheiten") : ""}</span><i><b style="width:${pct}%" class="${pct >= 100 ? "ok" : pct >= 50 ? "mid" : "low"}"></b></i></div>`;
    };
    form.innerHTML = `<h3>${t("Trainingsanalyse")}</h3>
      <div class="an-tiles">
        <div><b>${A.last7}</b><span>${t("Tage in 7 Tagen")}</span></div>
        <div><b>${num(Math.round((A.last28 / 4) * 10) / 10)}</b><span>${t("Ø Tage pro Woche")}</span></div>
        <div><b>${A.avgMin != null ? fmtDur(A.avgMin) : "–"}</b><span>${t("Ø Dauer")}</span></div>
        <div><b>${A.avgGap != null ? `${Math.floor(A.avgGap / 60)}:${String(A.avgGap % 60).padStart(2, "0")}` : "–"}</b><span>${t("Ø Zeit pro Satz")}</span></div>
        <div><b>${A.streak}</b><span>${t("Wochen in Folge")}</span></div>
        <div><b>${A.restDays ?? "–"}</b><span>${t("Tage seit Training")}</span></div>
      </div>
      <p class="eyebrow" style="margin-top:16px">${t("Vorschläge")}</p>
      <div class="an-tips">${A.tips.length ? A.tips.map((x) => `<p class="an-tip ${x.level}"><i>${icon[x.level] ?? "·"}</i><span>${esc(tx(x))}</span></p>`).join("") : `<p class="small muted">${t("Alles im grünen Bereich. Weiter so.")}</p>`}</div>
      <p class="eyebrow" style="margin-top:16px">${t("Trainingszeit pro Woche")}</p>
      ${weekBars(A.weeks)}
      <p class="eyebrow" style="margin-top:16px">${t("Sätze je Muskelgruppe (7 Tage)")}</p>
      <div class="gauges">${["back", "rear", "lower", "triceps", "core", "cardio"].map(gauge).join("")}</div>
      ${A.per.length ? `<p class="eyebrow" style="margin-top:16px">${t("Nächstes Training")}</p>
      <div class="an-ex">${A.per.map((e) => `<button type="button" data-ex="${e.x.id}">${figureSvg(e.x.pattern, { size: 44, animate: false })}<span><b>${esc(e.x.name)}</b>
        <span class="small sug ${e.sug?.kind ?? ""}">${e.sug ? esc(tx(e.sug)) : ""}</span>
        ${e.sug?.pr ? `<span class="badge">${t("Neuer Bestwert")}</span>` : ""}${e.sug?.stall ? `<span class="badge warn">${t("Stillstand")}</span>` : ""}</span></button>`).join("")}</div>` : ""}
      ${A.stats.length ? `<p class="eyebrow" style="margin-top:16px">${t("Trainingstage")}</p>
      <div class="an-days">${A.stats.slice(0, 20).map((s) => `<div><span><b>${fmtDay(s.date, { weekday: "short", day: "numeric", month: "short" })}</b> ${esc(s.name ?? "")}${s.running ? ` <span class="badge">${t("läuft")}</span>` : ""}</span>
        <span class="small muted">${hm(s.start)}–${s.running ? "…" : hm(s.end)} · ${fmtDur(s.minutes)} · ${t("{n} Sätze", { n: s.sets })}${s.volume ? " · " + num(Math.round(s.volume)) + " kg" : ""}${s.avgGap ? " · " + t("Ø {m}:{s} pro Satz", { m: Math.floor(s.avgGap / 60), s: String(s.avgGap % 60).padStart(2, "0") }) : ""}</span></div>`).join("")}</div>` : ""}
      <p class="small muted" style="margin-top:14px">${t("Regeln: 8 bis 12 Wiederholungen. Schaffst du in allen Arbeitssätzen 12, kommt Gewicht dazu. Unter 6 geht es etwas runter. Stillstand über 3 Trainings: eine leichtere Woche.")}</p>
      <button type="button" class="ghost" id="an-close">${t("Schließen")}</button>`;
    form.onsubmit = (e) => e.preventDefault();
    form.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => openExercise(exById(b.dataset.ex))));
    $("#an-close").onclick = () => closeSheet(sheet);
    openSheet(sheet);
  }

  // ---------- Sprache ----------
  async function runVoice(c) {
    await load();
    if (c.action === "start") { await start(c.workout?.id); return t("Training gestartet: {x}", { x: active()?.name ?? "" }); }
    if (c.action === "stop") { await finish(); return null; }
    if (c.action === "analysis") { await openAnalysis(); return null; }
    if (c.action === "move") {
      if (!active()) return t("Es läuft gerade kein Training.");
      moveEx(c.exercise.id, c.dir);
      return t(c.dir === "first" ? "Als Nächstes: {x}" : "Ans Ende: {x}", { x: c.exercise.name });
    }
    if (c.action === "remove") {
      if (!active()) return t("Es läuft gerade kein Training.");
      await removeEx(c.exercise.id);
      return null;
    }
    const exId = c.exercise?.id ?? (active() && T.lastEx) ?? null;
    if (!exId) return t("Welche Übung? Sag z. B. „Latziehen 50 kg 12 Wiederholungen“.");
    const vals = { kg: c.kg ?? null, reps: c.reps ?? null };
    for (const k of ["duration_sec", "speed", "incline"]) if (c[k] != null) vals[k] = c[k];
    for (let k = 0; k < (c.sets ?? 1); k++) await logSet(exId, vals, { quiet: true });
    rerender();
    return `${exById(exId)?.name}: ${c.sets > 1 ? c.sets + " × " : ""}${fmtSet({ ...vals, exercise_id: exId })}`;
  }

  return {
    load, render, start, finish, runVoice, openAnalysis,
    active, exercises: () => T.exercises, workouts: () => T.workouts,
    figure: figureSvg,
  };
}
