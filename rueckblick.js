// Wochenrückblick (Mo–So): Gebete, Training und Gewicht, Supplement-Treue, Einkaufsausgaben, Wasser, Koran
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const wdOf = (d) => ((d.getDay() + 6) % 7) + 1;
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const PNAME = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

export function weekBounds(offset = 0, now = new Date()) {
  const mon = addDays(now, -(wdOf(now) - 1) + 7 * offset);
  mon.setHours(12, 0, 0, 0);
  return { from: iso(mon), to: iso(addDays(mon, 6)), days: Array.from({ length: 7 }, (_, i) => addDays(mon, i)) };
}

// Reine Auswertung, damit sie sich ohne Datenbank prüfen lässt
export function summarize({ days, routines, completions, sessions, weights, trips, logs, today, waterGoal = 12 }) {
  const done = new Set(completions.map((c) => `${c.routine_id}|${c.on_date}`));
  const past = days.filter((d) => iso(d) <= today);
  const rate = (pred) => {
    let exp = 0, ok = 0;
    for (const d of past) for (const r of routines) {
      if (!r.active || !pred(r) || !r.days.includes(wdOf(d))) continue;
      exp++; if (done.has(`${r.id}|${iso(d)}`)) ok++;
    }
    return { exp, ok, pct: exp ? Math.round((ok / exp) * 100) : null };
  };
  const prayers = rate((r) => !!r.prayer);
  const perPrayer = PRAYERS.map((p) => ({ p, ...rate((r) => r.prayer === p) })).filter((x) => x.exp);
  const supps = rate((r) => r.category === "supps");
  const fin = sessions.filter((s) => s.finished_at);
  const minutes = fin.reduce((a, s) => a + Math.max(0, Math.round((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60000)), 0);
  const from = iso(days[0]), to = iso(days[6]);
  const wIn = weights.filter((w) => w.weight_kg != null && w.on_date >= from && w.on_date <= to).sort((a, b) => a.on_date.localeCompare(b.on_date));
  const wBefore = weights.filter((w) => w.weight_kg != null && w.on_date < from).sort((a, b) => a.on_date.localeCompare(b.on_date));
  const wLast = wIn.at(-1)?.weight_kg ?? null, wPrev = wBefore.at(-1)?.weight_kg ?? null;
  const spend = trips.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const wl = logs.filter((l) => l.on_date >= from && l.on_date <= to);
  const water = past.length ? wl.reduce((a, l) => a + (l.water ?? 0), 0) / past.length : 0;
  return {
    prayers, perPrayer, supps,
    training: { count: fin.length, minutes },
    weight: { last: wLast != null ? Number(wLast) : null, delta: wLast != null && wPrev != null ? Math.round((wLast - wPrev) * 10) / 10 : null },
    shopping: { spend: Math.round(spend * 100) / 100, trips: trips.length },
    water: { avg: Math.round(water * 10) / 10, hits: wl.filter((l) => (l.water ?? 0) >= waterGoal).length },
    quran: wl.reduce((a, l) => a + (l.quran_pages ?? 0), 0),
    zikr: { sum: wl.reduce((a, l) => a + (Number(l.zikr) || 0), 0), hits: wl.filter((l) => Number(l.zikr) > 0 && Number(l.zikr) >= (Number(l.zikr_goal) || Infinity)).length },
    fasted: wl.filter((l) => l.fasted === "ja").length,
  };
}

// Regelbasierte Tipps für die nächste Woche
export function tips(s, prev, { waterGoal = 12, trainPlan = 3, budget = null } = {}) {
  const out = [];
  const weak = [...s.perPrayer].filter((x) => x.pct != null && x.pct < 80).sort((a, b) => a.pct - b.pct)[0];
  if (weak) out.push(["{p} hat diese Woche am häufigsten gefehlt ({ok} von {exp}). Stell die Erinnerung auf wichtig.", { p: PNAME[weak.p], ok: weak.ok, exp: weak.exp }]);
  if (s.supps.pct != null && s.supps.pct < 70) out.push(["Supplements nur zu {n} % genommen. Leg sie sichtbar neben den Teller.", { n: s.supps.pct }]);
  if (s.training.count < trainPlan) out.push(["{n} von {g} Trainings. Plan die nächsten fest im Kalender ein.", { n: s.training.count, g: trainPlan }]);
  else out.push(["{n} Trainings geschafft, stark.", { n: s.training.count }]);
  if (s.weight.delta != null && s.weight.delta < -1.1) out.push(["Mehr als 1 kg in einer Woche verloren. Iss etwas mehr, damit die Muskeln bleiben.", {}]);
  if (s.water.avg && s.water.avg < waterGoal * 0.7) out.push(["Im Schnitt {n} Gläser Wasser. Ziel sind {g}.", { n: s.water.avg, g: waterGoal }]);
  if (budget && s.shopping.spend > (budget / 30) * 7 * 1.2) out.push(["Einkäufe über dem Wochenschnitt deines Budgets.", {}]);
  if (prev?.prayers.pct != null && s.prayers.pct != null && s.prayers.pct > prev.prayers.pct + 5) out.push(["Gebete besser als letzte Woche.", {}]);
  return out;
}

export function createReview(ctx) {
  const { db, t, esc, daylog, routines, settings, fmtDay, LOCALE, budget } = ctx;
  let offset = 0;

  async function data(off) {
    const cur = weekBounds(off), prev = weekBounds(off - 1);
    const [c, s, w, tr] = await Promise.all([
      db.from("completions").select("routine_id,on_date").gte("on_date", prev.from).lte("on_date", cur.to),
      db.from("workout_sessions").select("started_at,finished_at").gte("started_at", new Date(prev.from + "T00:00:00").toISOString()).lte("started_at", new Date(cur.to + "T23:59:59").toISOString()),
      db.from("body_metrics").select("on_date,weight_kg").gte("on_date", iso(addDays(new Date(prev.from + "T12:00"), -21))).lte("on_date", cur.to),
      db.from("shopping_trips").select("amount,finished_at").gte("finished_at", new Date(prev.from + "T00:00:00").toISOString()).lte("finished_at", new Date(cur.to + "T23:59:59").toISOString()),
      daylog.load(prev.from, cur.to),
    ]);
    const td = iso(new Date());
    const pick = (b) => summarize({
      days: b.days, routines: routines(), today: td, waterGoal: settings()?.water_goal ?? 12,
      completions: (c.data ?? []).filter((x) => x.on_date >= b.from && x.on_date <= b.to),
      sessions: (s.data ?? []).filter((x) => x.started_at && iso(new Date(x.started_at)) >= b.from && iso(new Date(x.started_at)) <= b.to),
      weights: w.data ?? [],
      trips: (tr.data ?? []).filter((x) => x.finished_at && iso(new Date(x.finished_at)) >= b.from && iso(new Date(x.finished_at)) <= b.to),
      logs: daylog.range(b.from, b.to),
    });
    return { cur, now: pick(cur), prev: pick(prev) };
  }

  const eur = (n) => n.toLocaleString(LOCALE(), { style: "currency", currency: "EUR" });
  const arrow = (a, b, better = 1) => (a == null || b == null || a === b ? "" : `<span class="rv-arrow ${(a - b) * better > 0 ? "up" : "down"}">${a > b ? "▲" : "▼"}</span>`);

  let req = 0;
  async function render(host) {
    host.innerHTML = `<div class="empty">${t("Lade …")}</div>`;
    const my = ++req, at = offset;
    const res = await data(at);
    if (my !== req) return; // schnelles Blättern: ältere Antwort verwerfen
    const { cur, now: s, prev: p } = res;
    const lens = routines().filter((r) => r.active && r.category === "training" && r.days.length < 7).map((r) => r.days.length);
    const trainPlan = lens.length ? Math.max(...lens) : 3;
    const tipList = tips(s, p, { waterGoal: settings()?.water_goal ?? 12, trainPlan, budget: budget() });
    const tile = (label, value, sub, arr = "") => `<div class="rv-tile"><small>${label}</small><b>${value}${arr}</b>${sub ? `<span class="small muted">${sub}</span>` : ""}</div>`;
    host.innerHTML = `<div class="rv-head"><button type="button" class="round-btn" id="rv-prev" aria-label="${t("Vorherige Woche")}">‹</button>
        <div><b>${offset === 0 ? t("Diese Woche") : offset === -1 ? t("Letzte Woche") : t("Woche")}</b><span class="small muted">${fmtDay(cur.from, { day: "numeric", month: "short" })} – ${fmtDay(cur.to, { day: "numeric", month: "short" })}</span></div>
        <button type="button" class="round-btn" id="rv-next" aria-label="${t("Nächste Woche")}" ${offset >= 0 ? "disabled" : ""}>›</button></div>
      <div class="rv-grid">
        ${tile(t("Gebete"), s.prayers.exp ? `${s.prayers.ok}/${s.prayers.exp}` : "–", s.prayers.pct != null ? `${s.prayers.pct} %` : "", arrow(s.prayers.pct, p.prayers.pct))}
        ${tile(t("Training"), String(s.training.count), s.training.minutes ? t("{n} Min.", { n: s.training.minutes }) : "", arrow(s.training.count, p.training.count))}
        ${tile(t("Gewicht"), s.weight.last != null ? `${s.weight.last.toLocaleString(LOCALE())} kg` : "–", s.weight.delta != null ? `${s.weight.delta > 0 ? "+" : ""}${s.weight.delta.toLocaleString(LOCALE())} kg` : t("kein Wert"))}
        ${tile(t("Supplements"), s.supps.pct != null ? `${s.supps.pct} %` : "–", s.supps.exp ? `${s.supps.ok}/${s.supps.exp}` : "", arrow(s.supps.pct, p.supps.pct))}
        ${tile(t("Einkäufe"), eur(s.shopping.spend), t("{n} Einkäufe", { n: s.shopping.trips }), arrow(s.shopping.spend, p.shopping.spend, -1))}
        ${tile(t("Wasser"), `${s.water.avg.toLocaleString(LOCALE())}`, t("Gläser pro Tag"), arrow(s.water.avg, p.water.avg))}
        ${s.quran || p.quran ? tile(t("Koran"), String(s.quran), t("Seiten"), arrow(s.quran, p.quran)) : ""}
        ${s.fasted ? tile(t("Fasten"), String(s.fasted), t("Tage")) : ""}
        ${s.zikr.sum || p.zikr.sum ? tile(t("Zikir"), s.zikr.sum.toLocaleString(LOCALE()), t("Ziel an {n} von 7 Tagen", { n: s.zikr.hits }), arrow(s.zikr.sum, p.zikr.sum)) : ""}
      </div>
      ${s.perPrayer.length ? `<div class="card rv-prayers">${s.perPrayer.map((x) => `<div><span>${PNAME[x.p]}</span><div class="bar"><div style="width:${x.pct ?? 0}%"></div></div><span class="small">${x.ok}/${x.exp}</span></div>`).join("")}</div>` : ""}
      ${tipList.length ? `<div class="card"><p class="eyebrow">${t("Für nächste Woche")}</p><ul class="rv-tips">${tipList.map(([k, v]) => `<li>${esc(t(k, v))}</li>`).join("")}</ul></div>` : ""}`;
    host.querySelector("#rv-prev").onclick = () => { offset--; render(host); };
    host.querySelector("#rv-next").onclick = () => { if (offset < 0) { offset++; render(host); } };
  }

  return { render, reset: () => (offset = 0) };
}
