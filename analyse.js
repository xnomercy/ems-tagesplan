// Trainingsanalyse ohne KI: feste Regeln nach Studienlage (Bericht reports/Trainingsanalyse evidenzbasiert.md).
// Alle Funktionen rechnen nur mit den geladenen Daten und ändern nichts.

// Muskelgruppen mit Anzeige-Reihenfolge. Ziel: 10–20 harte Sätze pro Woche, mindestens 2 Tage (ACSM 2026, Pelland 2024).
export const GROUPS = {
  back: { label: "Rücken (Lat, Rudern)" },
  rear: { label: "Hintere Schulter" },
  lower: { label: "Unterer Rücken" },
  glutes: { label: "Gesäß" },
  hams: { label: "Beinbeuger" },
  quads: { label: "Oberschenkel vorne" },
  chest: { label: "Brust" },
  shoulders: { label: "Schultern (vorne/seitlich)" },
  triceps: { label: "Trizeps" },
  biceps: { label: "Bizeps" },
  core: { label: "Bauch + Rumpf" },
  neck: { label: "Nacken" },
};
// Pro Bild: Hauptmuskel zählt 1, mitarbeitende Muskeln 0,5
export const MUSCLES = {
  lat_wide: { back: 1, biceps: 0.5 },
  lat_close: { back: 1, biceps: 0.5 },
  row_incline: { back: 1, rear: 0.5, biceps: 0.5 },
  row_single: { back: 1, rear: 0.5, biceps: 0.5 },
  face_pull: { rear: 1 },
  reverse_fly: { rear: 1 },
  pushdown: { triceps: 1 },
  overhead_ext: { triceps: 1 },
  skullcrusher: { triceps: 1 },
  curl: { biceps: 1 },
  bench: { chest: 1, triceps: 0.5, shoulders: 0.5 },
  hyperext: { lower: 1, glutes: 0.5, hams: 0.5 },
  rdl: { hams: 1, glutes: 0.5, lower: 0.5 },
  hip_thrust: { glutes: 1, hams: 0.5 },
  dead_bug: { core: 1 },
  side_plank: { core: 1 },
  pallof: { core: 1 },
  plank: { core: 1 },
  situp: { core: 1 },
  neck_curl: { neck: 1 },
};
const PULL = ["back", "rear"], PUSH = ["chest", "shoulders"];
// Ampel für Wochensätze: < 4 rot, 4–9 gelb, 10–20 grün, darüber hoch (Pelland 2024)
export const band = (n) => (n < 4 ? "low" : n < 10 ? "mid" : n <= 20 ? "ok" : "high");
export const groupOf = (pattern) => Object.entries(MUSCLES[pattern] ?? {}).find(([, f]) => f === 1)?.[0] ?? (pattern === "treadmill" ? "cardio" : "other");

// Wiederholungsbereich: Isolation und Rumpf 10–15, sonst 8–12; pro Übung änderbar
const ISO = ["face_pull", "reverse_fly", "pushdown", "overhead_ext", "curl", "dead_bug", "pallof", "situp", "neck_curl"];
export const repRange = (x) => [x.rep_min ?? (ISO.includes(x.pattern) ? 10 : 8), x.rep_max ?? (ISO.includes(x.pattern) ? 15 : 12)];
// Pause: schwere Grundübungen 2–3 Min., Maschinen 1,5–2 Min., Isolation/Rumpf 60–90 s (Singer 2024, Schoenfeld 2016)
const HEAVY = ["rdl", "hip_thrust", "row_incline", "bench"], MACHINE = ["lat_wide", "lat_close", "row_single", "skullcrusher"];
export const restRange = (x) => (HEAVY.includes(x.pattern) ? [120, 180] : MACHINE.includes(x.pattern) ? [90, 120] : x.mode === "cardio" ? [0, 0] : [60, 90]);
const stepOf = (x, top) => Number(x.step_kg) || (top < 10 ? 1 : ["rdl", "hip_thrust"].includes(x.pattern) ? 5 : 2.5);

// Geschätztes Maximalgewicht (Epley) mit Reserve: 50 kg × 10 bei 2 RIR ≈ 50 kg × 12 bis zum Versagen.
// Nur Sätze bis 12 Wdh., darüber werden die Formeln ungenau.
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + Math.min(reps, 20) / 30) : 0);
const setE1rm = (s) => ((s.reps ?? 0) <= 12 ? e1rm(Number(s.kg) || 0, (s.reps ?? 0) + (s.rir ?? 0)) : 0);
const bestE1rm = (sets) => {
  const v = Math.max(0, ...sets.map(setE1rm));
  return v || Math.max(0, ...sets.map((s) => e1rm(Number(s.kg) || 0, s.reps || 0))); // nur hohe Wdh.: trotzdem ein Trendwert
};
const round = (v, step) => Math.round(v / step) * step;
const DAY = 864e5;
const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// Arbeitssätze: mindestens 90 % des schwersten Gewichts und nicht als sehr leicht markiert (RIR ≥ 5)
export function workingSets(list) {
  const top = Math.max(0, ...list.map((s) => Number(s.kg) || 0));
  return list.filter((s) => (!top || (Number(s.kg) || 0) >= top * 0.9) && (s.rir == null || s.rir <= 4));
}

// Intensität am Laufband aus Tempo und Steigung (ACSM-Gehformel): MET = (0,1·S + 1,8·S·G + 3,5) / 3,5
export function walkMet(kmh, inclinePct) {
  if (!kmh) return null;
  const S = (kmh * 1000) / 60, G = (inclinePct || 0) / 100;
  return (0.1 * S + 1.8 * S * G + 3.5) / 3.5;
}

// Kennzahlen einer Einheit: Dauer, Sätze, harte Sätze, Volumen, Pausen, Anstrengung
export function sessionStats(s, sets, exById) {
  const own = sets.filter((x) => x.session_id === s.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const start = Date.parse(s.started_at);
  const lastSet = own.length ? Date.parse(own[own.length - 1].created_at) : null;
  const end = s.finished_at ? Date.parse(s.finished_at) : Math.max(Date.now(), lastSet ?? start);
  const gaps = [];
  let overrun = 0;
  for (let i = 1; i < own.length; i++) {
    const g = (Date.parse(own[i].created_at) - Date.parse(own[i - 1].created_at)) / 1000;
    if (g > 0 && g < 900) gaps.push(g); // sehr lange Lücken (Gerät besetzt, Gespräch) verzerren den Schnitt
    const x = exById(own[i - 1].exercise_id);
    const planned = (x ? restRange(x)[1] : 90) + 45; // 45 s für den Satz selbst
    if (g > planned) overrun += Math.min(g, 900) - planned;
  }
  const byEx = {};
  for (const x of own) (byEx[x.exercise_id] ??= []).push(x);
  const hard = Object.entries(byEx).reduce((a, [id, l]) => a + (exById(id)?.mode === "cardio" ? 0 : workingSets(l).length), 0);
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  return {
    id: s.id, name: s.name, running: !s.finished_at, date: isoDay(start), start, end, minutes,
    warmup: own.length ? Math.round((Date.parse(own[0].created_at) - start) / 60000) : null,
    tail: s.finished_at && lastSet ? Math.round((Date.parse(s.finished_at) - lastSet) / 60000) : null,
    sets: own.length, hard,
    volume: own.reduce((a, x) => a + (Number(x.kg) || 0) * (x.reps || 0), 0),
    avgGap: gaps.length ? Math.round(avg(gaps)) : null,
    overrunMin: Math.round(overrun / 60),
    exercises: Object.keys(byEx),
    rpe: s.rpe ?? null, load: s.rpe != null ? s.rpe * minutes : null,
    sleep: s.sleep_h != null ? Number(s.sleep_h) : null, soreness: s.soreness ?? null, energy: s.energy ?? null, pain: s.pain ?? null,
  };
}

// Tagesform aus dem Check-in: schlecht, wenn mindestens 2 von 3 Signalen schlecht sind
export function lowReadiness(s) {
  if (!s) return false;
  const bad = [s.sleep_h != null && Number(s.sleep_h) < 6, (s.soreness ?? 0) >= 2, s.energy != null && s.energy <= 2].filter(Boolean).length;
  return bad >= 2;
}

// Vorschlag für das nächste Mal, aus der letzten Einheit mit dieser Übung (ohne die ausgenommene).
// ctx: { restart: Wiedereinstiegsphase, today: Check-in der laufenden Einheit }
export function suggest(x, sessions, sets, exceptSession, ctx = {}) {
  const hist = sessions
    .filter((s) => s.id !== exceptSession)
    .map((s) => ({ s, sets: sets.filter((y) => y.session_id === s.id && y.exercise_id === x.id).sort((a, b) => a.set_no - b.set_no) }))
    .filter((h) => h.sets.length)
    .sort((a, b) => Date.parse(b.s.started_at) - Date.parse(a.s.started_at));
  if (!hist.length) return null;
  const last = hist[0].sets;
  const mode = x.mode ?? "reps";
  const out = { kind: "keep", text: "", vars: {}, pr: false, stall: false, drop: false };
  const light = lowReadiness(ctx.today);

  if (mode === "cardio") {
    // Erst Dauer (10 → 15 → 20 → 30 Min.), dann Steigung bis 12 %, dann Tempo
    const min = Math.max(...last.map((s) => (s.duration_sec ?? 0) / 60));
    const inc = Math.max(0, ...last.map((s) => Number(s.incline) || 0));
    const spd = Math.max(0, ...last.map((s) => Number(s.speed) || 0));
    const met = walkMet(spd, inc);
    out.met = met;
    if (min < 30) return { ...out, kind: "up", text: "Nächstes Mal {n} Min., Steigung und Tempo gleich", vars: { n: min < 15 ? 15 : min < 20 ? 20 : 30 } };
    if (inc < 12) return { ...out, kind: "up", text: "{m} Min. geschafft: Steigung auf {n} % erhöhen", vars: { m: Math.round(min), n: Math.min(12, inc + 1) } };
    return { ...out, kind: "up", text: "Steigung ausgereizt: Tempo auf {n} km/h", vars: { n: Math.round((spd + 0.3) * 10) / 10 } };
  }
  if (mode === "time") {
    const sec = Math.max(...last.map((s) => s.duration_sec ?? 0));
    if (light) return { ...out, text: "Heute leichter: {n} s halten", vars: { n: sec } };
    if (sec >= 60) return { ...out, kind: "up", text: "60 s geschafft: schwerere Variante oder Gewicht dazu" };
    return { ...out, kind: "up", text: "Nächstes Mal {n} s halten", vars: { n: Math.min(60, round(sec + 5, 5)) } };
  }

  const [lo, hi] = repRange(x);
  const top = Math.max(0, ...last.map((s) => Number(s.kg) || 0));
  if (!top) {
    const reps = Math.max(...last.map((s) => s.reps ?? 0));
    if (reps >= hi + 3) return { ...out, kind: "up", text: "{n} Wdh. sind leicht: langsamer ausführen oder Gewicht nehmen", vars: { n: reps } };
    return { ...out, kind: "up", text: "Ziel: {n} Wdh. pro Satz", vars: { n: reps + 1 } };
  }
  const work = workingSets(last);
  const reps = work.map((s) => s.reps ?? 0);
  const rirs = work.map((s) => s.rir).filter((v) => v != null);
  const minReps = Math.min(...reps);
  const topReps = Math.max(...last.filter((s) => Number(s.kg) === top).map((s) => s.reps ?? 0));
  const step = stepOf(x, top);
  // Sprung über 10 % (z. B. 2,5 kg bei 20 kg am Kabel): erst 2 Wdh. über dem Bereich verlangen (ACSM: +2–10 %)
  const bigJump = step / top > 0.1;
  const need = bigJump ? hi + 2 : hi;
  const easy = rirs.length === work.length && rirs.length > 0 && Math.min(...rirs) >= 3;
  const nearFail = rirs.length > 0 && Math.max(...rirs) <= 0;
  out.top = top;
  out.lo = lo; out.hi = hi;

  if (minReps >= need || (easy && minReps >= lo)) {
    // Wiedereinstieg (erste 6 Wochen): bei viel Reserve doppelte Stufe (Halonen 2024)
    const k = ctx.restart && rirs.length && Math.min(...rirs) >= 2 ? 2 : 1;
    const kg = top + k * step;
    Object.assign(out, { kind: "up", text: minReps >= need ? "{kg} kg × {lo} bis {lo2} (alle Sätze ≥ {hi} Wdh.)" : "{kg} kg × {lo} bis {lo2} (noch 3+ Wdh. Reserve, zu leicht)", vars: { kg, lo, lo2: lo + 2, hi: need } });
  } else if (bigJump && minReps >= hi) {
    Object.assign(out, { kind: "keep", text: "{kg} kg, Ziel {n} Wdh. (Sprung auf {up} kg wäre über 10 %)", vars: { kg: top, n: need, up: top + step } });
  } else if (topReps < lo - 2 && (nearFail || !rirs.length)) {
    // Erst nach zwei schwachen Einheiten runter, eine allein kann Tagesform sein
    const prev = hist[1] ? workingSets(hist[1].sets) : null;
    const prevWeak = prev && Math.max(...prev.map((s) => s.reps ?? 0)) < lo - 2;
    if (prevWeak) Object.assign(out, { kind: "down", text: "{kg} kg × {lo} (zweimal nur {r} Wdh.)", vars: { kg: round(top * 0.92, step), lo, r: topReps } });
    else Object.assign(out, { kind: "keep", text: "{kg} kg halten (zuletzt nur {r} Wdh., Tagesform und Schlaf prüfen)", vars: { kg: top, r: topReps } });
  } else {
    Object.assign(out, { kind: "keep", text: "{kg} kg halten, Ziel {r} Wdh. · ab {hi} Wdh. {up} kg", vars: { kg: top, r: Math.min(hi, topReps + 1), hi: need, up: top + step } });
  }
  if (light) Object.assign(out, { kind: "keep", text: "Heute leichter: {kg} kg, 1 Satz weniger, 3 Wdh. Reserve lassen", vars: { kg: out.kind === "down" ? round(top * 0.92, step) : top } });
  out.target = { kg: out.kind === "up" ? out.vars.kg : out.kind === "down" ? round(top * 0.92, step) : top };

  // Verlauf: Bestwert, Stillstand (kein Plus > 1 % in 3 Einheiten, im Defizit 4), Einbruch
  const series = hist.map((h) => bestE1rm(workingSets(h.sets))).reverse(); // alt → neu
  const now = series[series.length - 1];
  const before = series.slice(0, -1);
  out.pr = before.length > 0 && now > Math.max(...before);
  const win = ctx.deficit ? 4 : 3;
  if (series.length > win) {
    const ref = Math.max(...series.slice(0, -win));
    const flat = out.kind !== "up" && minReps < hi && Math.max(...series.slice(-win)) <= ref * 1.01;
    // Echter Stillstand nur, wenn die Sätze hart waren (Reserve ≤ 2); ohne Reserve-Angabe nur ein Hinweis
    out.stall = flat && rirs.length > 0 && Math.min(...rirs) <= 2;
    out.flat = flat && !rirs.length;
  }
  out.drop = before.length > 0 && now < Math.max(...before) * 0.9;
  return out;
}

// Körperwerte: 7-Tage-Schnitt, Rate pro Woche, Bauchumfang-Trend
export function bodyTrend(body, now = Date.now()) {
  const rows = (body ?? []).filter((r) => r.weight_kg != null).map((r) => ({ t: Date.parse(r.on_date + "T12:00"), w: Number(r.weight_kg) })).sort((a, b) => a.t - b.t);
  const mean = (from, to) => avg(rows.filter((r) => r.t > from && r.t <= to).map((r) => r.w));
  const cur = mean(now - 7 * DAY, now), prev = mean(now - 14 * DAY, now - 7 * DAY);
  const latest = rows[rows.length - 1]?.w ?? null;
  const waist = (body ?? []).filter((r) => r.waist_cm != null).sort((a, b) => a.on_date.localeCompare(b.on_date));
  const w0 = waist.length ? Number(waist[0].waist_cm) : null, w1 = waist.length ? Number(waist[waist.length - 1].waist_cm) : null;
  return {
    latest, avg7: cur, ratePct: cur && prev ? ((cur - prev) / prev) * 100 : null,
    waist: w1, waistDelta: waist.length > 1 ? w1 - w0 : null, waistSince: waist[0]?.on_date ?? null,
  };
}

// Gesamtauswertung für die Analyse-Ansicht
export function analyse({ exercises, sessions, sets, body = [], now = Date.now() }) {
  const exById = (id) => exercises.find((e) => e.id === id);
  const withSets = sessions.filter((s) => sets.some((x) => x.session_id === s.id));
  const stats = withSets.map((s) => sessionStats(s, sets, exById)).sort((a, b) => b.start - a.start);
  const done = stats.filter((s) => !s.running);
  const B = bodyTrend(body, now);
  const deficit = B.ratePct != null && B.ratePct < -0.25;
  const first = stats.length ? stats[stats.length - 1].start : null;
  const restart = first != null && now - first < 42 * DAY;

  // Trainingstage der letzten 7 und 28 Tage
  const days = (n) => new Set(stats.filter((s) => now - s.start < n * DAY).map((s) => s.date)).size;
  const last7 = days(7), last28 = days(28);

  // Harte Sätze je Muskelgruppe (7 Tage): nur Arbeitssätze, Nebenmuskeln × 0,5; dazu an wie vielen Tagen direkt trainiert
  const groups = {}, gdays = {};
  for (const g of Object.keys(GROUPS)) { groups[g] = 0; gdays[g] = new Set(); }
  const perDay = {}; // Datum → Gruppe → harte Sätze (für die Folgetag-Regel)
  const recent = stats.filter((s) => now - s.start < 7 * DAY);
  let cardioMin = 0, cardioEq = 0;
  const mets = [];
  for (const s of stats.filter((y) => now - y.start < 14 * DAY)) {
    const byEx = {};
    for (const x of sets) if (x.session_id === s.id) (byEx[x.exercise_id] ??= []).push(x);
    for (const [id, l] of Object.entries(byEx)) {
      const x = exById(id);
      if (!x) continue;
      if (x.mode === "cardio") {
        if (now - s.start >= 7 * DAY) continue;
        for (const c of l) {
          const m = (c.duration_sec ?? 0) / 60, met = walkMet(Number(c.speed) || 0, Number(c.incline) || 0);
          cardioMin += m; cardioEq += met != null && met >= 6 ? 2 * m : m; // intensiv zählt doppelt (WHO)
          if (met) mets.push(met);
        }
        continue;
      }
      const n = x.mode === "reps" ? workingSets(l).length : l.length;
      for (const [g, f] of Object.entries(MUSCLES[x.pattern] ?? {})) {
        ((perDay[s.date] ??= {})[g] ??= 0);
        perDay[s.date][g] += n * f;
        if (now - s.start < 7 * DAY) { groups[g] += n * f; if (f === 1 && n) gdays[g].add(s.date); }
      }
    }
  }
  const freq = Object.fromEntries(Object.entries(gdays).map(([g, d]) => [g, d.size]));
  const pull = PULL.reduce((a, g) => a + groups[g], 0), push = PUSH.reduce((a, g) => a + groups[g], 0);

  // Wochen (Mo–So, letzte 6): Trainingstage, Minuten, harte Sätze, Last (Anstrengung × Minuten)
  const monday = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const weeks = [];
  for (let k = 5; k >= 0; k--) {
    const from = monday(now) - k * 7 * DAY, to = from + 7 * DAY;
    const ws = stats.filter((s) => s.start >= from && s.start < to);
    weeks.push({ from, days: new Set(ws.map((s) => s.date)).size, minutes: ws.reduce((a, s) => a + s.minutes, 0), sets: ws.reduce((a, s) => a + s.sets, 0), hard: ws.reduce((a, s) => a + s.hard, 0), load: ws.reduce((a, s) => a + (s.load ?? 0), 0), volume: ws.reduce((a, s) => a + s.volume, 0) });
  }
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) { if (weeks[i].days >= 2) streak++; else if (i < weeks.length - 1) break; }

  const lastDone = stats[0] ?? null;
  const restDays = lastDone ? Math.floor((now - lastDone.start) / DAY) : null;
  const avgMin = done.length ? Math.round(avg(done.map((s) => s.minutes))) : null;
  const gapsAll = done.map((s) => s.avgGap).filter(Boolean);
  const avgGap = gapsAll.length ? Math.round(avg(gapsAll)) : null;
  const sleep7 = avg(recent.map((s) => s.sleep).filter((v) => v != null));

  // Übungen: Vorschlag, Bestwert, Stillstand
  const per = exercises.map((x) => ({ x, sug: suggest(x, sessions, sets, undefined, { restart, deficit }), n: new Set(sets.filter((s) => s.exercise_id === x.id).map((s) => s.session_id)).size })).filter((e) => e.n);
  const stalls = per.filter((e) => e.sug?.stall);

  // Hinweise: Text + Werte, die Übersetzung passiert in der Ansicht. Reihenfolge = Wichtigkeit.
  const tips = [];
  const tip = (level, text, vars = {}) => tips.push({ level, text, vars });
  if (!stats.length) tip("info", "Noch keine Trainings gespeichert. Nach 2 bis 3 Trainings wird die Auswertung genauer.");
  // Schmerz mit Warnzeichen geht vor allem anderen
  if (stats.slice(0, 2).some((s) => (s.pain ?? 0) >= 2)) tip("warn", "Du hast deutliche Schmerzen angegeben. Bei Taubheit im Gesäß, Problemen mit Blase oder Darm, Schwäche im Bein oder Fieber: kein Training, sofort zum Arzt. Sonst schmerzende Übungen weglassen, Schmerz beim Training höchstens 2 bis 3 von 10. Hält es länger als 6 Wochen an, ärztlich abklären.");
  if (restDays != null && restDays >= 5) tip("warn", "Letztes Training vor {n} Tagen. Fang mit 90 % der letzten Gewichte wieder an.", { n: restDays });
  if (sleep7 != null && sleep7 < 6.5) tip("warn", "Im Schnitt {h} Std. Schlaf vor dem Training. Mit wenig Schlaf verliert man in der Diät deutlich mehr Muskeln (Studie: 5,5 statt 8,5 Std. → 60 % mehr Verlust an fettfreier Masse). Schlaf ist gerade dein größter Hebel.", { h: Math.round(sleep7 * 10) / 10 });
  // Fehlende Muskelgruppen (14 Tage nichts)
  if (stats.length) {
    const sum14 = (g) => Object.values(perDay).reduce((a, d) => a + (d[g] ?? 0), 0);
    const missing = ["quads", "hams", "chest", "shoulders"].filter((g) => sum14(g) === 0);
    if (missing.length) tip("plan", "Ganz ohne Training: {g}. Für Muskelaufbau und Fettabbau sollten alle großen Muskeln 2× pro Woche dran sein. Ein zweiter Plan „Beine + Drücken“ (Beinpresse, Beinbeuger, Brustpresse, Schulterdrücken) würde das abdecken.", { g: missing.map((g) => GROUPS[g].label) });
    for (const g of ["back", "rear", "lower", "core", "triceps"]) {
      if (groups[g] > 0 && groups[g] < 4) tip("plan", "{g}: nur {n} harte Sätze diese Woche (wirksam ab etwa 4, gut sind 10 bis 20).", { g: GROUPS[g].label, n: Math.round(groups[g] * 10) / 10 });
      else if (groups[g] >= 4 && freq[g] < 2) tip("plan", "{g}: {n} Sätze, aber nur an {d} Tag. Auf 2 Tage verteilt bringt das mehr.", { g: GROUPS[g].label, n: Math.round(groups[g] * 10) / 10, d: freq[g] });
      else if (groups[g] > 20) tip("info", "{g}: {n} harte Sätze diese Woche. Mehr als 20 bringt kaum noch zusätzlich, kostet aber Erholung.", { g: GROUPS[g].label, n: Math.round(groups[g]) });
    }
    if (push > pull) tip("plan", "Mehr Drücken ({p}) als Ziehen ({z}) diese Woche. Für gesunde Schultern mindestens so viel ziehen wie drücken.", { p: Math.round(push), z: Math.round(pull) });
  }
  if (stats.length && last7 < 2) tip("plan", "Diese Woche {n} Trainingstag(e). Für Kraft und Muskeln mindestens 2, besser 3.", { n: last7 });
  if (last7 >= 6) tip("warn", "{n} Trainingstage in 7 Tagen. Plane mindestens einen Ruhetag ein, Muskeln wachsen in der Pause.", { n: last7 });
  // Gleiche Gruppe an Folgetagen: ab ~6 harten Sätzen an beiden Tagen; unterer Rücken/Beinbeuger 72 Std.
  const dates = Object.keys(perDay).sort().reverse();
  outer: for (let i = 0; i + 1 < dates.length; i++) {
    for (let j = i + 1; j < dates.length; j++) {
      const gap = (Date.parse(dates[i]) - Date.parse(dates[j])) / DAY;
      if (gap > 2) break;
      for (const g of Object.keys(GROUPS)) {
        const a = perDay[dates[i]][g] ?? 0, b = perDay[dates[j]][g] ?? 0;
        const slow = g === "lower" || g === "hams";
        if ((gap === 1 && a >= 6 && b >= 6) || (slow && gap <= 2 && a >= 3 && b >= 3)) {
          tip("warn", slow ? "{g} zweimal innerhalb von {d} Tagen schwer trainiert. Nach Kreuzheben und Hyperextensions 72 Std. Pause." : "{g} an zwei Tagen hintereinander mit vielen Sätzen. Gib der Gruppe 48 Std. Pause.", { g: GROUPS[g].label, d: gap + 1 });
          break outer;
        }
      }
    }
  }
  // Cardio in Minuten (WHO: 150–300 Min. moderat pro Woche, intensiv zählt doppelt)
  if (stats.length && cardioEq < 150) tip("plan", "Ausdauer: {n} von 150 Min. diese Woche (Laufband bergauf, zügiges Gehen, Rad zählen alle). Erst die Dauer steigern: 10 → 15 → 20 → 30 Min.", { n: Math.round(cardioEq) });
  // Deload: mehrere Übungen stagnieren oder lange ohne leichtere Woche
  if (stalls.length >= 2) tip("warn", "{n} Übungen stagnieren. Mach eine leichtere Woche: Sätze halbieren, 3 bis 4 Wdh. Reserve, Gewicht gleich. Danach geht es meist wieder voran.", { n: stalls.length });
  else if (streak >= 7) tip("info", "{n} Wochen am Stück trainiert. Alle 6 bis 8 Wochen eine leichtere Woche (halbe Sätze) hilft der Erholung.", { n: streak });
  // Last: Anstrengung × Minuten, sprunghafter Anstieg
  const [lw, tw] = [weeks[4], weeks[5]];
  if (lw.load && tw.load > lw.load * 1.2 && tw.days >= lw.days) tip("info", "Die Trainingslast ist diese Woche {n} % höher als letzte. Steigere lieber schrittweise, etwa 10 % pro Woche.", { n: Math.round((tw.load / lw.load - 1) * 100) });
  // Zeit und Pausen pro Übungsart
  if (avgMin != null && avgMin > 75) tip("time", "Ein Training dauert im Schnitt {n} Min. Mit Supersätzen aus verschiedenen Muskeln (z. B. Trizeps und Face Pulls abwechselnd) sparst du 10 bis 15 Min. ohne Nachteil für den Muskelaufbau.", { n: avgMin });
  const over = done.slice(0, 5).reduce((a, s) => a + s.overrunMin, 0);
  if (done.length && over / Math.min(5, done.length) >= 8) tip("time", "Pro Training gehen etwa {n} Min. über die empfohlenen Pausen hinaus. Gerät besetzt? Dann eine andere Übung vorziehen.", { n: Math.round(over / Math.min(5, done.length)) });
  const short = shortRests(exercises, sets, stats, exById);
  if (short) tip("time", "{x}: im Schnitt nur {s} s zwischen den Sätzen. Bei schweren Übungen bringen 2 bis 3 Min. mehr Kraft pro Satz.", short);
  const warm = done.map((s) => s.warmup).filter((v) => v != null);
  if (warm.length && avg(warm) > 12) tip("time", "Bis zum ersten Satz vergehen im Schnitt {n} Min. 5 bis 8 Min. Aufwärmen auf dem Laufband reichen.", { n: Math.round(avg(warm)) });
  if (done.some((s) => s.tail != null && s.tail > 20)) tip("time", "Training nach dem letzten Satz nicht beendet? Dann ist die gemessene Zeit zu lang. Beim Beenden fragt die App jetzt nach.");
  // Übungen mit Stillstand oder Einbruch
  for (const e of per) {
    if (e.sug?.stall) tip("warn", "{x}: seit {n} Trainings kein Fortschritt. Einmal 10 % weniger Gewicht und neu aufbauen, oder Griff bzw. Gerät wechseln.", { x: e.x.name, n: deficit ? 4 : 3 });
    else if (e.sug?.flat) tip("info", "{x}: seit {n} Trainings gleich. War es leicht, steigere die Wdh.; trag nach dem Satz die Reserve ein, dann erkennt die App echten Stillstand.", { x: e.x.name, n: deficit ? 4 : 3 });
    else if (e.sug?.drop) tip("warn", "{x}: über 10 % unter deinem Bestwert. Schlaf, Essen und Pausen prüfen, Gewicht erst halten.", { x: e.x.name });
  }
  // Körper: Abnehmtempo und Rekomposition (0,5–1 % pro Woche, Helms 2014)
  if (B.ratePct != null) {
    const strengthDown = per.filter((e) => e.sug?.drop).length >= 2;
    if (B.ratePct < -1.05) tip("warn", "Du verlierst {n} % pro Woche. Über 1 % kostet oft Muskeln. Etwas mehr essen, Eiweiß hoch halten.", { n: Math.round(-B.ratePct * 10) / 10 });
    else if (B.ratePct <= -0.5 && !strengthDown) tip("ok", "Gewicht {n} % pro Woche runter und die Kraft hält: genau richtig.", { n: Math.round(-B.ratePct * 10) / 10 });
    else if (B.ratePct > 0.25 && (B.waistDelta ?? 0) >= 0) tip("plan", "Das Gewicht steigt ({n} % pro Woche) und der Bauch wird nicht kleiner. Für Fettabbau etwa 300 bis 500 kcal weniger am Tag.", { n: Math.round(B.ratePct * 10) / 10 });
    if (strengthDown && B.ratePct < -0.5) tip("warn", "Kraft sinkt und du nimmst schnell ab: das Defizit ist zu groß. Etwas mehr essen, besonders vor dem Training.");
  } else if (stats.length) tip("info", "Trag morgens dein Gewicht und einmal pro Woche den Bauchumfang ein. Erst dann sieht die App, ob du Fett oder Muskeln verlierst.");

  return { stats, done, last7, last28, groups, freq, pull, push, weeks, streak, restDays, avgMin, avgGap, per, tips, cardioMin: Math.round(cardioMin), cardioEq: Math.round(cardioEq), met: mets.length ? avg(mets) : null, sleep7, body: B, restart, deficit, protein: B.latest ? Math.round(Math.min(B.latest, 90) * 1.6 / 5) * 5 : null };
}

// Schwere Übungen mit zu kurzer Pause finden (nur Sätze derselben Übung hintereinander)
function shortRests(exercises, sets, stats, exById) {
  const recentIds = new Set(stats.slice(0, 5).map((s) => s.id));
  const gaps = {};
  const bySess = {};
  for (const x of sets) if (recentIds.has(x.session_id)) (bySess[x.session_id] ??= []).push(x);
  for (const l of Object.values(bySess)) {
    l.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (let i = 1; i < l.length; i++) if (l[i].exercise_id === l[i - 1].exercise_id) {
      const g = (Date.parse(l[i].created_at) - Date.parse(l[i - 1].created_at)) / 1000;
      if (g > 15 && g < 600) (gaps[l[i].exercise_id] ??= []).push(g);
    }
  }
  for (const [id, g] of Object.entries(gaps)) {
    const x = exById(id);
    if (!x || g.length < 2 || !HEAVY.includes(x.pattern)) continue;
    const a = avg(g) - 40; // Satzdauer abziehen
    if (a < restRange(x)[0] - 30) return { x: x.name, s: Math.max(0, Math.round(a)) };
  }
  return null;
}

// Geplante Dauer eines Plans: Sätze × (45 s Satz + Pause) + 2 Min. Wechsel je Übung
export function planMinutes(workout, exById) {
  let sec = 0;
  for (const id of workout.exercise_ids) {
    const x = exById(id);
    if (!x) continue;
    if (x.mode === "cardio") { sec += 10 * 60; continue; }
    sec += (x.sets ?? 3) * 45 + Math.max(0, (x.sets ?? 3) - 1) * (x.rest_sec ?? 90) + 120;
  }
  return Math.round(sec / 60);
}
