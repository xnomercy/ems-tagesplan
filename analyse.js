// Trainingsanalyse ohne KI: feste Regeln für Steigerung, Stillstand, Zeit und Wochenplanung.
// Alle Funktionen rechnen nur mit den geladenen Daten und ändern nichts.

// Muskelgruppen je Bild, mit Wochenziel in Sätzen
export const GROUPS = {
  back: { label: "Rücken (Lat, Rudern)", target: 10, patterns: ["lat_wide", "lat_close", "row_incline", "row_single"] },
  rear: { label: "Hintere Schulter", target: 6, patterns: ["face_pull", "reverse_fly"] },
  lower: { label: "Unterer Rücken + Gesäß", target: 6, patterns: ["hyperext", "rdl", "hip_thrust"] },
  triceps: { label: "Trizeps", target: 6, patterns: ["pushdown", "overhead_ext", "skullcrusher"] },
  core: { label: "Bauch + Rumpf", target: 6, patterns: ["dead_bug", "side_plank", "pallof", "plank", "situp"] },
  cardio: { label: "Cardio", target: 2, patterns: ["treadmill"] },
  chest: { label: "Brust", target: 0, patterns: ["bench"] },
  biceps: { label: "Bizeps", target: 0, patterns: ["curl"] },
};
export const groupOf = (pattern) => Object.keys(GROUPS).find((g) => GROUPS[g].patterns.includes(pattern)) ?? "other";

// Geschätztes Maximalgewicht (Epley), damit 50 kg × 12 und 55 kg × 8 vergleichbar sind
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + Math.min(reps, 20) / 30) : 0);
const bestE1rm = (sets) => Math.max(0, ...sets.map((s) => e1rm(Number(s.kg) || 0, s.reps || 0)));
const round = (v, step) => Math.round(v / step) * step;
const DAY = 864e5;
const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

// Kennzahlen einer Einheit: Dauer, Sätze, Volumen, Pausen zwischen den Sätzen
export function sessionStats(s, sets, exById) {
  const own = sets.filter((x) => x.session_id === s.id).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const start = Date.parse(s.started_at);
  const lastSet = own.length ? Date.parse(own[own.length - 1].created_at) : null;
  const end = s.finished_at ? Date.parse(s.finished_at) : Math.max(Date.now(), lastSet ?? start);
  const gaps = [];
  let overrun = 0;
  for (let i = 1; i < own.length; i++) {
    const g = (Date.parse(own[i].created_at) - Date.parse(own[i - 1].created_at)) / 1000;
    // Wechsel zur nächsten Übung zählt mit, aber sehr lange Lücken (Gespräch, Gerät besetzt) verzerren den Schnitt
    if (g > 0 && g < 900) gaps.push(g);
    const planned = (exById(own[i - 1].exercise_id)?.rest_sec ?? 90) + 45; // 45 s für den Satz selbst
    if (g > planned) overrun += Math.min(g, 900) - planned;
  }
  const volume = own.reduce((a, x) => a + (Number(x.kg) || 0) * (x.reps || 0), 0);
  return {
    id: s.id, name: s.name, running: !s.finished_at, date: isoDay(start), start, end,
    minutes: Math.max(0, Math.round((end - start) / 60000)),
    warmup: own.length ? Math.round((Date.parse(own[0].created_at) - start) / 60000) : null,
    tail: s.finished_at && lastSet ? Math.round((Date.parse(s.finished_at) - lastSet) / 60000) : null,
    sets: own.length, volume,
    avgGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    overrunMin: Math.round(overrun / 60),
    exercises: [...new Set(own.map((x) => x.exercise_id))],
  };
}

// Vorschlag für das nächste Mal, aus der letzten Einheit mit dieser Übung (ohne die ausgenommene)
export function suggest(x, sessions, sets, exceptSession) {
  const hist = sessions
    .filter((s) => s.id !== exceptSession)
    .map((s) => ({ s, sets: sets.filter((y) => y.session_id === s.id && y.exercise_id === x.id).sort((a, b) => a.set_no - b.set_no) }))
    .filter((h) => h.sets.length)
    .sort((a, b) => Date.parse(b.s.started_at) - Date.parse(a.s.started_at));
  if (!hist.length) return null;
  const last = hist[0].sets;
  const mode = x.mode ?? "reps";
  const out = { kind: "keep", text: "", vars: {}, pr: false, stall: false, drop: false };

  if (mode === "cardio") {
    const min = Math.max(...last.map((s) => (s.duration_sec ?? 0) / 60));
    const inc = Math.max(0, ...last.map((s) => Number(s.incline) || 0));
    const spd = Math.max(0, ...last.map((s) => Number(s.speed) || 0));
    if (min < 10) return { ...out, kind: "up", text: "Nächstes Mal {n} Min.", vars: { n: Math.min(10, Math.floor(min) + 1) } };
    if (inc < 12) return { ...out, kind: "up", text: "10 Min. geschafft: Steigung auf {n} % erhöhen", vars: { n: inc + 1 } };
    return { ...out, kind: "up", text: "Steigung ausgereizt: Tempo auf {n} km/h", vars: { n: (Math.round((spd + 0.3) * 10) / 10).toLocaleString("de-DE") } };
  }
  if (mode === "time") {
    const sec = Math.max(...last.map((s) => s.duration_sec ?? 0));
    if (sec >= 60) return { ...out, kind: "up", text: "60 s geschafft: schwerere Variante oder Gewicht dazu" };
    return { ...out, kind: "up", text: "Nächstes Mal {n} s halten", vars: { n: Math.min(60, round(sec + 5, 5)) } };
  }

  const top = Math.max(0, ...last.map((s) => Number(s.kg) || 0));
  if (!top) {
    const reps = Math.max(...last.map((s) => s.reps ?? 0));
    if (reps >= 15) return { ...out, kind: "up", text: "{n} Wdh. sind leicht: langsamer ausführen oder Gewicht nehmen", vars: { n: reps } };
    return { ...out, kind: "up", text: "Ziel: {n} Wdh. pro Satz", vars: { n: reps + 1 } };
  }
  // Arbeitssätze: mindestens 90 % des schwersten Gewichts (Aufwärmsätze zählen nicht)
  const work = last.filter((s) => (Number(s.kg) || 0) >= top * 0.9);
  const topReps = Math.max(...last.filter((s) => Number(s.kg) === top).map((s) => s.reps ?? 0));
  const minReps = Math.min(...work.map((s) => s.reps ?? 0));
  const step = top < 10 ? 1 : ["rdl", "hip_thrust"].includes(x.pattern) ? 5 : 2.5;
  if (minReps >= 12) Object.assign(out, { kind: "up", text: "{kg} kg × 8–10 (alle Sätze ≥ 12 geschafft)", vars: { kg: top + step } });
  else if (topReps < 6) Object.assign(out, { kind: "down", text: "{kg} kg × 8 (zuletzt nur {r} Wdh.)", vars: { kg: round(top * 0.92, step), r: topReps } });
  else Object.assign(out, { kind: "keep", text: "{kg} kg halten, Ziel {r} Wdh. · ab 12 Wdh. {up} kg", vars: { kg: top, r: Math.min(12, topReps + 1), up: top + step } });
  out.top = top;
  out.target = { kg: out.kind === "up" ? top + step : out.kind === "down" ? round(top * 0.92, step) : top };

  // Verlauf über mehrere Einheiten: Bestwert, Stillstand, Einbruch
  const series = hist.map((h) => bestE1rm(h.sets)).reverse(); // alt → neu
  const now = series[series.length - 1];
  const before = series.slice(0, -1);
  out.pr = before.length > 0 && now > Math.max(...before);
  if (series.length >= 4) {
    const ref = Math.max(...series.slice(0, -3));
    // Wer schon oben am Wiederholungsbereich ist, braucht nur mehr Gewicht, keine Pause
    out.stall = out.kind !== "up" && Math.max(...series.slice(-3)) <= ref;
  }
  out.drop = before.length > 0 && now < Math.max(...before) * 0.9;
  return out;
}

// Gesamtauswertung für die Analyse-Ansicht
export function analyse({ exercises, sessions, sets, now = Date.now() }) {
  const exById = (id) => exercises.find((e) => e.id === id);
  const withSets = sessions.filter((s) => sets.some((x) => x.session_id === s.id));
  const stats = withSets.map((s) => sessionStats(s, sets, exById)).sort((a, b) => b.start - a.start);
  const done = stats.filter((s) => !s.running);

  // Trainingstage der letzten 7 und 28 Tage
  const days = (n) => new Set(stats.filter((s) => now - s.start < n * DAY).map((s) => s.date)).size;
  const last7 = days(7), last28 = days(28);

  // Sätze je Muskelgruppe in den letzten 7 Tagen (Cardio zählt Einheiten)
  const groups = {};
  for (const g of Object.keys(GROUPS)) groups[g] = 0;
  const cardioDays = new Set();
  for (const x of sets) {
    const s = stats.find((y) => y.id === x.session_id);
    if (!s || now - s.start >= 7 * DAY) continue;
    const g = groupOf(exById(x.exercise_id)?.pattern);
    if (g === "cardio") cardioDays.add(s.date);
    else if (g in groups) groups[g]++;
  }
  groups.cardio = cardioDays.size;

  // Wochen: Trainingstage, Minuten, Sätze, Volumen (letzte 6 Wochen, Montag bis Sonntag)
  const monday = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const weeks = [];
  for (let k = 5; k >= 0; k--) {
    const from = monday(now) - k * 7 * DAY, to = from + 7 * DAY;
    const ws = stats.filter((s) => s.start >= from && s.start < to);
    weeks.push({ from, days: new Set(ws.map((s) => s.date)).size, minutes: ws.reduce((a, s) => a + s.minutes, 0), sets: ws.reduce((a, s) => a + s.sets, 0), volume: ws.reduce((a, s) => a + s.volume, 0) });
  }
  // Serie: Wochen in Folge mit mindestens 2 Trainingstagen (laufende Woche zählt mit, wenn erreicht)
  let streak = 0;
  for (let i = weeks.length - 1; i >= 0; i--) { if (weeks[i].days >= 2) streak++; else if (i < weeks.length - 1) break; }

  const lastDone = stats[0] ?? null;
  const restDays = lastDone ? Math.floor((now - lastDone.start) / DAY) : null;
  const avgMin = done.length ? Math.round(done.reduce((a, s) => a + s.minutes, 0) / done.length) : null;
  const gaps = done.map((s) => s.avgGap).filter(Boolean);
  const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;

  // Übungen: Vorschlag, Bestwert, Stillstand
  const per = exercises.map((x) => ({ x, sug: suggest(x, sessions, sets), n: new Set(sets.filter((s) => s.exercise_id === x.id).map((s) => s.session_id)).size })).filter((e) => e.n);

  // Hinweise: Text + Werte, die Übersetzung passiert in der Ansicht
  const tips = [];
  const tip = (level, text, vars = {}) => tips.push({ level, text, vars });
  if (!stats.length) tip("info", "Noch keine Trainings gespeichert. Nach 2 bis 3 Trainings wird die Auswertung genauer.");
  if (restDays != null && restDays >= 5) tip("warn", "Letztes Training vor {n} Tagen. Fang mit 90 % der letzten Gewichte wieder an.", { n: restDays });
  if (stats.length && last7 < 2) tip("plan", "Diese Woche {n} Trainingstag(e). Ziel sind 3: z. B. Rücken + Trizeps, Core + Stabi, und eine kurze Einheit Laufband.", { n: last7 });
  if (last7 >= 6) tip("warn", "{n} Trainingstage in 7 Tagen. Plane mindestens einen Ruhetag ein, Muskeln wachsen in der Pause.", { n: last7 });
  // Gleiche Gruppe zwei Tage hintereinander
  const byDate = {};
  for (const s of stats) for (const id of s.exercises) (byDate[s.date] ??= new Set()).add(groupOf(exById(id)?.pattern));
  const dates = Object.keys(byDate).sort().reverse().slice(0, 7);
  for (let i = 0; i + 1 < dates.length; i++) {
    if ((Date.parse(dates[i]) - Date.parse(dates[i + 1])) / DAY !== 1) continue;
    const both = [...byDate[dates[i]]].filter((g) => byDate[dates[i + 1]].has(g) && ["back", "triceps", "lower", "rear", "chest", "biceps"].includes(g));
    if (both.length) { tip("warn", "{g} an zwei Tagen hintereinander trainiert. Gib der Gruppe 48 Stunden Pause.", { g: GROUPS[both[0]].label }); break; }
  }
  // Schwerpunkte des Nutzers: unterer Rücken, hintere Schulter, Bauch, Laufband
  if (stats.length) {
    for (const g of ["lower", "rear", "core"]) if (groups[g] < GROUPS[g].target)
      tip("plan", "{g}: {n} von {t} Sätzen diese Woche. {hint}", { g: GROUPS[g].label, n: groups[g], t: GROUPS[g].target, hint: { lower: "Hyperextensions oder Rumänisches Kreuzheben einbauen.", rear: "Face Pulls oder Reverse Butterfly einbauen.", core: "Plank, Sit-ups oder den Plan Core + Stabi einbauen." }[g] });
    if (groups.cardio < GROUPS.cardio.target) tip("plan", "Laufband bergauf: {n} von 2 Einheiten diese Woche. 10 Min. am Ende eines Trainings reichen.", { n: groups.cardio });
  }
  // Zeit
  if (avgMin != null && avgMin > 75) tip("time", "Ein Training dauert im Schnitt {n} Min. Mit Supersätzen (z. B. Trizeps und Face Pulls abwechselnd) sparst du etwa 10 bis 15 Min.", { n: avgMin });
  if (avgGap != null && avgGap > 150) tip("time", "Zwischen zwei Sätzen vergehen im Schnitt {m}:{s} Min. Mit dem Pause-Timer (90 s) wärst du pro Training schneller fertig.", { m: Math.floor(avgGap / 60), s: String(avgGap % 60).padStart(2, "0") });
  const over = done.slice(0, 5).reduce((a, s) => a + s.overrunMin, 0);
  if (done.length && over / Math.min(5, done.length) >= 8) tip("time", "Pro Training gehen etwa {n} Min. über die geplanten Pausen hinaus. Gerät besetzt? Dann eine andere Übung vorziehen.", { n: Math.round(over / Math.min(5, done.length)) });
  const warm = done.map((s) => s.warmup).filter((v) => v != null);
  if (warm.length && warm.reduce((a, b) => a + b, 0) / warm.length > 12) tip("time", "Bis zum ersten Satz vergehen im Schnitt {n} Min. 5 bis 8 Min. Aufwärmen auf dem Laufband reichen.", { n: Math.round(warm.reduce((a, b) => a + b, 0) / warm.length) });
  const tail = done.map((s) => s.tail).filter((v) => v != null && v > 20);
  if (tail.length) tip("time", "Training nach dem letzten Satz nicht beendet? Dann ist die gemessene Zeit zu lang. Beim Beenden fragt die App jetzt nach.");
  // Übungen mit Stillstand oder Einbruch
  for (const e of per) {
    if (e.sug?.stall) tip("warn", "{x}: seit 3 Trainings kein Fortschritt. Eine Woche mit 85 % des Gewichts, danach neu steigern, oder die Griffvariante wechseln.", { x: e.x.name });
    else if (e.sug?.drop) tip("warn", "{x}: über 10 % unter deinem Bestwert. Schlaf, Essen und Pausen prüfen, Gewicht erst halten.", { x: e.x.name });
  }

  return { stats, done, last7, last28, groups, weeks, streak, restDays, avgMin, avgGap, per, tips };
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
