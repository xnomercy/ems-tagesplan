// Zikir: Tagesziel (Einstellungen, Standard 5000), täglich eintragen oder mitzählen, Statistik.
// Werte liegen in daily_log.zikr; zikr_goal merkt sich das Ziel des Tages, damit eine spätere Änderung die Statistik nicht verfälscht.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const MAX_ZIKR = 200000;

// Reine Statistik über die Tageswerte (für Tests ohne DOM)
export function zikrStats(logs, goalNow, todayIso) {
  const by = new Map(logs.map((r) => [r.on_date, r]));
  const val = (d) => Number(by.get(d)?.zikr) || 0;
  const goalOf = (d) => Number(by.get(d)?.zikr_goal) || goalNow;
  const day = (k) => iso(addDays(new Date(todayIso + "T12:00"), -k));
  // Serie: Tage in Folge mit erreichtem Ziel; heute zählt erst, wenn geschafft
  let streak = 0;
  for (let k = val(todayIso) >= goalOf(todayIso) ? 0 : 1; k < 3650; k++) {
    const d = day(k);
    if (goalOf(d) > 0 && val(d) >= goalOf(d)) streak++; else break;
  }
  let best = 0;
  {
    const done = logs.filter((r) => (Number(r.zikr) || 0) >= (Number(r.zikr_goal) || goalNow) && goalNow > 0).map((r) => r.on_date).sort();
    let run = 0, prev = null;
    for (const d of done) { run = prev && iso(addDays(new Date(prev + "T12:00"), 1)) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  }
  const last = (n) => Array.from({ length: n }, (_, i) => day(n - 1 - i)).map((d) => ({ d, n: val(d), goal: goalOf(d) }));
  const sum = (a) => a.reduce((s, x) => s + x.n, 0);
  const w7 = last(7), w30 = last(30);
  const first = logs.filter((r) => Number(r.zikr) > 0).map((r) => r.on_date).sort()[0] ?? null;
  // Durchschnitt nur über Tage seit dem ersten Eintrag, sonst drücken leere Tage vor dem Start den Wert
  const active30 = first ? w30.filter((x) => x.d >= first) : [];
  return {
    today: val(todayIso), goal: goalOf(todayIso), streak, best,
    week: w7, month: w30,
    sum7: sum(w7), sum30: sum(w30),
    avg30: active30.length ? Math.round(sum(active30) / active30.length) : 0,
    reached30: active30.filter((x) => x.goal > 0 && x.n >= x.goal).length, days30: active30.length,
    total: logs.reduce((s, r) => s + (Number(r.zikr) || 0), 0),
    bestDay: logs.reduce((m, r) => (Number(r.zikr) > (m?.zikr ?? 0) ? r : m), null),
  };
}

export function createZikir(ctx) {
  const { t, esc, toast, openSheet, closeSheet, sheet, form, daylog, settings, saveSettings, fmtDay, LOCALE, today } = ctx;
  const goal = () => { const g = Number(settings()?.zikr_goal); return Number.isFinite(g) && g >= 0 ? g : 5000; };
  const num = (n) => Number(n).toLocaleString(LOCALE());
  let loaded = false, loading = null, sel = null, tapPending = 0, tapTimer = null;

  function load() {
    if (loaded) return Promise.resolve();
    return (loading ??= daylog.load(iso(addDays(new Date(), -400)), today()).then(() => { loaded = true; }).finally(() => { loading = null; }));
  }
  const stats = () => zikrStats(daylog.all(), goal(), today());

  async function setCount(n, date = today()) {
    const before = daylog.get(date).zikr ?? 0;
    const v = Math.max(0, Math.min(MAX_ZIKR, Math.round(n)));
    const err = await daylog.set(date, { zikr: v, zikr_goal: goal() });
    if (err) return { msg: err.message };
    const g = goal();
    const msg = g && v >= g && before < g ? t("Zikir-Ziel geschafft: {n}. Mâşallah!", { n: num(v) })
      : date === today() ? t("Zikir heute: {n} von {g}", { n: num(v), g: num(g) }) : t("Zikir {d}: {n}", { d: fmtDay(date, { weekday: "short", day: "numeric", month: "short" }), n: num(v) });
    return { msg, undo: async () => { await daylog.set(date, { zikr: before }); ctx.onChange(); } };
  }
  const add = (n, date = today()) => setCount((daylog.get(date).zikr ?? 0) + n, date);

  // Kurzkarte für die Tagesansicht
  function dayCard() {
    const g = goal();
    if (!g) return "";
    const n = daylog.get(today()).zikr ?? 0;
    const pct = Math.min(100, Math.round((n / g) * 100));
    return `<div class="card water-card zikir-mini ${n >= g ? "done" : ""}">
      <div class="water-info"><b>${t("Zikir")}</b><span class="small muted">${t("{n} von {g}", { n: num(n), g: num(g) })}</span>
        <div class="bar"><div style="width:${pct}%"></div></div></div>
      <button type="button" class="water-plus" data-goto="zikir" aria-label="${t("Zikir eintragen")}"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="17.5" cy="9" r="2"/><circle cx="17.5" cy="15.5" r="2"/><circle cx="12" cy="19.5" r="2"/><circle cx="6.5" cy="15.5" r="2"/><circle cx="6.5" cy="9" r="2"/></svg><span>${t("Eintragen")}</span></button>
    </div>`;
  }

  function bars(days, short) {
    const max = Math.max(1, ...days.map((x) => Math.max(x.n, x.goal)));
    return `<div class="zk-bars ${short ? "" : "thin"}">${days.map((x) => {
      const h = Math.round((x.n / max) * 100), gl = x.goal ? Math.round((x.goal / max) * 100) : null;
      const wd = new Date(x.d + "T12:00").toLocaleDateString(LOCALE(), { weekday: "short" }).replace(".", "").slice(0, 2);
      return `<div class="zk-col ${x.goal && x.n >= x.goal ? "ok" : ""} ${x.d === today() ? "today" : ""}" title="${esc(x.d)}: ${num(x.n)}">
        <div class="zk-track">${gl != null ? `<i style="bottom:${gl}%"></i>` : ""}<div style="height:${h}%"></div></div>${short ? `<small>${wd}</small>` : ""}</div>`;
    }).join("")}</div>`;
  }

  function render(host) {
    if (!loaded) { host.innerHTML = `<div class="empty">${t("Lade …")}</div>`; load().then(() => render(host)); return; }
    const s = stats(), g = goal();
    const d = sel ?? today();
    const cur = daylog.get(d).zikr ?? 0;
    const dg = d === today() ? g : Number(daylog.get(d).zikr_goal) || g;
    const pct = dg ? Math.min(100, Math.round((cur / dg) * 100)) : 0;
    const days = Array.from({ length: 7 }, (_, i) => iso(addDays(new Date(), -i)));
    let html = `<div class="chips zk-days">${days.map((x, i) => `<button type="button" class="chip ${x === d ? "on" : ""}" data-zday="${x}">${i === 0 ? t("Heute") : i === 1 ? t("Gestern") : fmtDay(x, { weekday: "short", day: "numeric" })}</button>`).join("")}</div>
      <div class="card zk-hero ${dg && cur >= dg ? "done" : ""}">
        <div class="zk-top"><div><b class="big">${num(cur)}</b><span class="muted"> / ${num(dg)}</span></div><span class="muted small">${pct}%</span></div>
        <div class="bar"><div style="width:${pct}%"></div></div>
        <p class="small">${!dg ? t("Kein Tagesziel gesetzt.") : cur >= dg ? t("Ziel geschafft. Mâşallah!") : t("Noch {n} bis zum Ziel", { n: num(dg - cur) })}</p>
        <div class="chips zk-add">${[33, 100, 500, 1000].map((n) => `<button type="button" class="chip" data-zadd="${n}">+${num(n)}</button>`).join("")}</div>
        <form id="zk-form" class="shop-add"><input id="zk-n" inputmode="numeric" pattern="[0-9]*" placeholder="${t("Anzahl, z. B. 1500")}" autocomplete="off"><button type="submit" class="primary" aria-label="${t("Hinzufügen")}">+</button></form>
        <div class="zk-actions"><button type="button" class="link-btn" id="zk-set">${t("Tagesstand korrigieren")}</button>${cur ? `<button type="button" class="link-btn danger" id="zk-reset">${t("Auf 0 setzen")}</button>` : ""}</div>
      </div>
      <div class="card zk-tap-card"><p class="eyebrow">${t("Mitzählen")}</p>
        <button type="button" class="zk-tap" id="zk-tap"><b id="zk-tap-n">${num(cur)}</b><span>${t("Tippen = +1")}</span></button>
        <p class="small muted">${t("Jeder Tipp zählt eins dazu und wird automatisch gespeichert.")}</p>
      </div>
      <div class="section-head"><h3>${t("Statistik")}</h3><button type="button" class="link-btn" id="zk-goal">${t("Ziel: {g}", { g: num(g) })}</button></div>
      <div class="rv-grid">
        <div class="rv-tile"><small>${t("Serie")}</small><b>${t("{n} Tage", { n: s.streak })}</b><span class="small muted">${t("Bestwert {n}", { n: s.best })}</span></div>
        <div class="rv-tile"><small>${t("7 Tage")}</small><b>${num(s.sum7)}</b><span class="small muted">${t("Ziel an {n} von 7 Tagen", { n: s.week.filter((x) => x.goal && x.n >= x.goal).length })}</span></div>
        <div class="rv-tile"><small>${t("Schnitt pro Tag")}</small><b>${num(s.avg30)}</b><span class="small muted">${t("letzte 30 Tage")}</span></div>
        <div class="rv-tile"><small>${t("Gesamt")}</small><b>${num(s.total)}</b><span class="small muted">${s.bestDay ? t("bester Tag {n}", { n: num(s.bestDay.zikr) }) : "–"}</span></div>
      </div>
      <div class="card"><p class="eyebrow">${t("Diese Woche")}</p>${bars(s.week, true)}</div>
      <div class="card"><p class="eyebrow">${t("Letzte 30 Tage")}</p>${bars(s.month, false)}
        <p class="small muted">${s.days30 ? t("Ziel an {n} von {d} Tagen erreicht · {sum} insgesamt", { n: s.reached30, d: s.days30, sum: num(s.sum30) }) : t("Noch keine Einträge.")}</p></div>`;
    host.innerHTML = html;

    const save = async (r) => { if (r.msg) toast(r.msg, r.undo ? async () => { await r.undo(); render(host); ctx.onChange(); } : null); render(host); ctx.onChange(); };
    host.querySelectorAll("[data-zday]").forEach((b) => (b.onclick = () => { flushTap(); sel = b.dataset.zday === today() ? null : b.dataset.zday; render(host); }));
    host.querySelectorAll("[data-zadd]").forEach((b) => (b.onclick = async () => save(await add(Number(b.dataset.zadd), d))));
    host.querySelector("#zk-form").onsubmit = async (e) => {
      e.preventDefault();
      const n = Number(host.querySelector("#zk-n").value.replace(/\D/g, ""));
      if (!n) return;
      host.querySelector("#zk-n").blur();
      save(await add(n, d));
    };
    host.querySelector("#zk-set").onclick = () => openSet(d, host);
    host.querySelector("#zk-reset")?.addEventListener("click", async () => save(await setCount(0, d)));
    host.querySelector("#zk-goal").onclick = () => openGoal(() => render(host));
    // Mitzählen: sofort anzeigen, gesammelt speichern
    const tapBtn = host.querySelector("#zk-tap"), tapN = host.querySelector("#zk-tap-n");
    tapBtn.onclick = () => {
      tapPending++;
      navigator.vibrate?.(8);
      tapN.textContent = num(cur + tapPending);
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => flushTap(host), 1200);
    };
  }

  async function flushTap(host) {
    clearTimeout(tapTimer);
    if (!tapPending) return;
    const n = tapPending, d = sel ?? today();
    tapPending = 0;
    const g = goal(), before = daylog.get(d).zikr ?? 0;
    await daylog.set(d, { zikr: Math.min(MAX_ZIKR, before + n), zikr_goal: g });
    if (g && before < g && before + n >= g) toast(t("Zikir-Ziel geschafft: {n}. Mâşallah!", { n: num(before + n) }));
    if (host?.isConnected) render(host);
    ctx.onChange();
  }

  function openSet(d, host) {
    form.innerHTML = `<h3>${t("Tagesstand korrigieren")}</h3>
      <p class="small muted">${d === today() ? t("Heute") : fmtDay(d, { weekday: "long", day: "numeric", month: "long" })}</p>
      <label>${t("Zikir insgesamt an diesem Tag")}</label>
      <input name="n" inputmode="numeric" pattern="[0-9]*" value="${daylog.get(d).zikr ?? 0}" required>
      <div class="sheet-actions"><button class="primary">${t("Speichern")}</button></div>`;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const r = await setCount(Number(String(new FormData(form).get("n")).replace(/\D/g, "")) || 0, d);
      closeSheet(sheet);
      if (r.msg) toast(r.msg, r.undo);
      render(host); ctx.onChange();
    };
    openSheet(sheet);
  }

  function openGoal(after) {
    form.innerHTML = `<h3>${t("Zikir-Tagesziel")}</h3>
      <label>${t("Anzahl pro Tag")}</label>
      <input name="g" inputmode="numeric" pattern="[0-9]*" value="${goal()}" required>
      <div class="chips">${[1000, 3000, 5000, 10000].map((n) => `<button type="button" class="chip" data-zg="${n}">${num(n)}</button>`).join("")}</div>
      <p class="small muted">${t("Gilt ab heute. Frühere Tage behalten ihr altes Ziel in der Statistik.")}</p>
      <div class="sheet-actions"><button class="primary">${t("Speichern")}</button></div>`;
    form.querySelectorAll("[data-zg]").forEach((b) => (b.onclick = () => { form.querySelector("[name=g]").value = b.dataset.zg; }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const r = await setGoal(Number(String(new FormData(form).get("g")).replace(/\D/g, "")) || 0);
      closeSheet(sheet);
      toast(r.msg);
      after?.(); ctx.onChange();
    };
    openSheet(sheet);
  }

  async function setGoal(n) {
    const g = Math.max(0, Math.min(MAX_ZIKR, Math.round(n)));
    await saveSettings({ zikr_goal: g });
    // Heutiges Ziel mitziehen, falls heute schon etwas eingetragen ist
    if (daylog.get(today()).zikr) await daylog.set(today(), { zikr_goal: g });
    return { msg: g ? t("Zikir-Ziel: {n} pro Tag", { n: num(g) }) : t("Zikir-Ziel aus") };
  }

  async function runVoice(c) {
    await load();
    if (c.action === "add") return add(c.n, c.date ?? today());
    if (c.action === "set") return setCount(c.n, c.date ?? today());
    if (c.action === "goal") return setGoal(c.n);
    const s = stats();
    return { msg: t("Zikir heute: {n} von {g}", { n: num(s.today), g: num(s.goal) }) + (s.streak ? " · " + t("{n} Tage in Folge", { n: s.streak }) : "") };
  }

  function openAdd() {
    form.innerHTML = `<h3>${t("Zikir eintragen")}</h3>
      <label>${t("Anzahl")}</label>
      <input name="n" inputmode="numeric" pattern="[0-9]*" placeholder="${t("Anzahl, z. B. 1500")}" required>
      <div class="chips">${[33, 100, 500, 1000].map((n) => `<button type="button" class="chip" data-zq="${n}">+${num(n)}</button>`).join("")}</div>
      <div class="sheet-actions"><button class="primary">${t("Hinzufügen")}</button></div>`;
    form.querySelectorAll("[data-zq]").forEach((b) => (b.onclick = () => { const i = form.querySelector("[name=n]"); i.value = (Number(i.value) || 0) + Number(b.dataset.zq); }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const n = Number(String(new FormData(form).get("n")).replace(/\D/g, ""));
      if (!n) return;
      await load();
      const r = await add(n);
      closeSheet(sheet);
      toast(r.msg, r.undo);
      ctx.onChange();
    };
    openSheet(sheet);
  }

  return { load, render, dayCard, runVoice, openAdd, openGoal, setGoal, goal, stats, flush: () => flushTap() };
}
