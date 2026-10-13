// Wasser-Zähler (ein Tipp = ein Glas, 250 ml) und Schlafenszeit nach der Fajr-Zeit
export const GLASS_ML = 250;
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + m; };
const fmt = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

// Schlafenszeit: rechtzeitig vor Fajr aufstehen, aber nicht vor Isha ins Bett.
// Reicht die Nacht nicht, bleibt der Rest für nach Fajr oder einen Mittagsschlaf.
export function sleepPlan(pt, hours = 7.5) {
  if (!pt?.Fajr) return null;
  const wake = toMin(pt.Fajr) - 15;
  let bed = wake - hours * 60;
  bed = ((bed % 1440) + 1440) % 1440;
  const floor = pt.Isha ? toMin(pt.Isha) + 20 : null;
  if (floor != null && bed >= 12 * 60 && bed < floor) bed = floor;
  const night = ((wake - bed) % 1440 + 1440) % 1440;
  return { bed: fmt(bed), wake: fmt(wake), night, missing: Math.max(0, hours * 60 - night) };
}
// Offset für die Routine "Schlafen gehen" (an Fajr gekoppelt, negativ = vorher)
export const sleepOffset = (hours) => -Math.round(hours * 60 + 15);

export function createWellness(ctx) {
  const { t, toast, daylog, settings, today, getPt, LOCALE } = ctx;
  const goal = () => settings()?.water_goal ?? 12;
  const liters = (n) => ((n * GLASS_ML) / 1000).toLocaleString(LOCALE(), { maximumFractionDigits: 2 });

  async function addWater(n = 1, date = today()) {
    const before = daylog.get(date).water ?? 0;
    await daylog.bump(date, "water", n, 60);
    const now = daylog.get(date).water;
    const msg = now >= goal() && before < goal() ? t("Wasserziel geschafft: {l} l", { l: liters(now) }) : t("Wasser: {n} von {g} Gläsern ({l} l)", { n: now, g: goal(), l: liters(now) });
    return { msg, undo: async () => { await daylog.set(date, { water: before }); ctx.onChange(); } };
  }

  function waterCard() {
    const n = daylog.get(today()).water ?? 0, g = goal();
    const pct = Math.min(100, Math.round((n / g) * 100));
    return `<div class="card water-card ${n >= g ? "done" : ""}">
      <div class="water-info"><b>${t("Wasser")}</b><span class="small muted">${t("{n} von {g} Gläsern · {l} l", { n, g, l: liters(n) })}</span>
        <div class="bar"><div style="width:${pct}%"></div></div></div>
      ${n ? `<button type="button" class="water-minus" data-water="-1" aria-label="${t("Ein Glas weniger")}">−</button>` : ""}
      <button type="button" class="water-plus" data-water="1" aria-label="${t("Ein Glas Wasser")}"><svg viewBox="0 0 24 24"><path d="M6 3h12l-1.6 16.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z"/><path d="M6.6 9h10.8"/></svg><span>+1</span></button>
    </div>`;
  }

  function sleepHint() {
    const p = sleepPlan(getPt(), Number(settings()?.sleep_hours ?? 7.5));
    if (!p || p.missing < 30) return "";
    const h = (p.missing / 60).toLocaleString(LOCALE(), { maximumFractionDigits: 1 });
    return `<div class="hint">${t("Bis Fajr nur {n} Std. Schlaf. Plane nach Fajr oder mittags noch {h} Std. ein.", { n: (p.night / 60).toLocaleString(LOCALE(), { maximumFractionDigits: 1 }), h })}</div>`;
  }

  function bind(host) {
    host.querySelectorAll("[data-water]").forEach((b) => (b.onclick = async () => {
      const r = await addWater(Number(b.dataset.water));
      toast(r.msg, r.undo);
      ctx.onChange();
    }));
  }

  return { addWater, waterCard, sleepHint, bind, goal, liters, sleep: () => sleepPlan(getPt(), Number(settings()?.sleep_hours ?? 7.5)) };
}
