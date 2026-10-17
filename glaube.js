// Koran-Fortschritt und Ramadan (Sahur, Iftar, Fasten-Tracker, verschobene Zeiten). Alles regelbasiert.
export const QURAN_PAGES = 604;
const toMin = (t) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + m; };
const fmt = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00") - Date.parse(a + "T12:00")) / 864e5);

// ---------- Ramadan ----------
export function ramadanActive(settings, pt) {
  const m = settings?.ramadan ?? "auto";
  return m === "an" || (m === "auto" && Number(pt?.HijriMonth) === 9);
}
export function fastTimes(pt) {
  if (!pt) return null;
  const imsak = toMin(pt.Imsak ?? pt.Fajr), iftar = toMin(pt.Maghrib);
  return { imsak: fmt(imsak), sahur: fmt(imsak - 40), iftar: fmt(iftar), imsakMin: imsak, iftarMin: iftar };
}
// Supplements, Training und Mahlzeiten, die in die Fastenzeit fallen, rutschen zu Sahur oder nach Iftar
export function ramadanShift(rt, time, pt) {
  if (!time || !pt || rt.prayer) return null;
  const cat = rt.category;
  if (!["supps", "training", "essen"].includes(cat)) return null;
  const f = fastTimes(pt), m = toMin(time);
  if (m < f.imsakMin - 60 || m >= f.iftarMin) return null;
  const morning = m < 11 * 60 || /frühstück|kahvaltı|morgen|sabah/i.test(rt.title);
  if (cat === "essen" && !/frühstück|mittag|lunch|kahvaltı|öğle/i.test(rt.title)) return null;
  if (cat === "training") return fmt(f.iftarMin + 90);
  return morning ? fmt(f.imsakMin - 30) : fmt(f.iftarMin + 15);
}

// ---------- Koran ----------
export const juzOf = (page) => Math.min(30, Math.max(1, page <= 21 ? 1 : Math.floor((page - 22) / 20) + 2));
export function quranState(goal, logs, today) {
  if (!goal) return null;
  const read = logs.filter((r) => r.on_date >= goal.since && r.on_date <= today).reduce((a, r) => a + (r.quran_pages ?? 0), 0);
  const todayRead = logs.find((r) => r.on_date === today)?.quran_pages ?? 0;
  const page = Math.min(QURAN_PAGES, (goal.start_page ?? 1) - 1 + read); // letzte gelesene Seite
  const before = page - todayRead;
  const daysLeft = Math.max(1, daysBetween(today, goal.target) + 1);
  const perDay = Math.max(1, Math.ceil((QURAN_PAGES - before) / daysLeft));
  return { page, todayRead, perDay, left: Math.max(0, perDay - todayRead), daysLeft, remaining: QURAN_PAGES - page, done: page >= QURAN_PAGES, juz: juzOf(Math.max(1, page)), late: daysBetween(today, goal.target) < 0 };
}

export function createGlaube(ctx) {
  const { t, esc, toast, openSheet, closeSheet, sheet, form, daylog, settings, saveSettings, getPt, fmtDay, enhancePickers, today } = ctx;

  const goal = () => settings()?.quran_goal ?? null;
  async function load() {
    const td = today();
    const g = goal();
    const from = [g?.since, iso(addDays(new Date(), -400))].filter(Boolean).sort()[0];
    await daylog.load(from, td);
  }
  const quran = () => quranState(goal(), daylog.all(), today());

  async function addPages(n, date = today()) {
    const before = daylog.get(date).quran_pages ?? 0;
    await daylog.bump(date, "quran_pages", n, QURAN_PAGES);
    const q = quran();
    const msg = q ? (q.done ? t("Hatim geschafft! Mâşallah.") : t("Koran: Seite {p}, heute noch {n}", { p: q.page, n: q.left })) : t("Koran: {n} Seiten eingetragen", { n: before + n });
    return { msg, undo: async () => { await daylog.set(date, { quran_pages: before }); ctx.onChange(); } };
  }
  async function setPage(page) {
    const g = goal() ?? { target: iso(addDays(new Date(), 30)), start_page: 1, since: today() };
    const q = quranState(g, daylog.all(), today());
    // Aktuelle Seite setzen: ab heute neu zählen, damit auch eine kleinere Seite greift
    const ng = { ...g, since: today(), start_page: Math.max(1, page + 1 - (q?.todayRead ?? 0)) };
    await saveSettings({ quran_goal: ng });
    return { msg: t("Koran: Seite {p}", { p: page }) };
  }
  async function setGoal(target, startPage) {
    const q = quran();
    const start = startPage ?? (q && !q.done ? q.page + 1 : 1);
    // Heute gelesene Seiten zählen schon zum neuen Ziel
    await saveSettings({ quran_goal: { target, start_page: Math.max(1, start - (daylog.get(today()).quran_pages ?? 0)), since: today() } });
    const s = quran();
    return { msg: t("Koran-Ziel bis {d}: {n} Seiten am Tag", { d: fmtDay(target, { day: "numeric", month: "long" }), n: s.perDay }) };
  }

  // ---------- Fasten ----------
  const kaza = () => { const all = daylog.all(); return Math.max(0, all.filter((r) => r.fasted === "nein").length - all.filter((r) => r.fasted === "nachholen").length); };
  async function setFast(value, date = today()) {
    const before = daylog.get(date).fasted ?? null;
    await daylog.set(date, { fasted: before === value ? null : value });
    return { msg: value === "ja" ? t("Fasten eingetragen") : value === "nachholen" ? t("Nachgeholt. Noch {n} offen", { n: kaza() }) : t("Zum Nachholen vorgemerkt"), undo: async () => { await daylog.set(date, { fasted: before }); ctx.onChange(); } };
  }

  // Karte auf der Tagesansicht während Ramadan
  function dayCard() {
    const pt = getPt();
    if (!ramadanActive(settings(), pt)) return "";
    const f = fastTimes(pt);
    if (!f) return "";
    const st = daylog.get(today()).fasted;
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const left = f.iftarMin - nowM;
    const status = nowM < f.imsakMin ? t("Sahur bis {t}", { t: f.imsak }) : left > 0 ? t("Iftar in {h}:{m} Std.", { h: Math.floor(left / 60), m: String(left % 60).padStart(2, "0") }) : t("Iftar war um {t}", { t: f.iftar });
    const day = pt?.HijriMonth == 9 && pt?.HijriDay ? t("Tag {n}", { n: Number(pt.HijriDay) }) : "";
    return `<div class="card ramadan-card">
      <div class="ramadan-top"><b>${t("Ramadan")}${day ? " · " + day : ""}</b><span>${status}</span></div>
      <div class="ramadan-times"><div><small>${t("Sahur")}</small><b>${f.sahur}</b></div><div><small>${t("Imsak")}</small><b>${f.imsak}</b></div><div><small>${t("Iftar")}</small><b>${f.iftar}</b></div></div>
      <div class="seg ramadan-seg"><button type="button" data-fast="ja" class="${st === "ja" ? "on" : ""}">${t("Gefastet")}</button><button type="button" data-fast="nein" class="${st === "nein" ? "on" : ""}">${t("Nicht gefastet")}</button></div>
    </div>`;
  }
  // Hinweis Koran-Tagespensum
  function dayHint() {
    const q = quran();
    if (!q || q.done) return "";
    return `<div class="hint ${q.left ? "" : "ok"}">${q.left ? t("Koran heute: noch {n} Seiten (bis Seite {p})", { n: q.left, p: Math.min(QURAN_PAGES, q.page + q.left) }) : t("Koran-Pensum für heute geschafft")} <button data-quran-add>${t("+ Seiten")}</button></div>`;
  }

  function render(host) {
    const q = quran(), g = goal(), pt = getPt(), s = settings() ?? {};
    const active = ramadanActive(s, pt);
    const f = fastTimes(pt);
    const k = kaza();
    let html = `<div class="section-head"><h3>${t("Koran")}</h3>${q ? `<span class="muted">${t("Juz {n}", { n: q.juz })}</span>` : ""}</div><div class="card quran-card">`;
    if (q) {
      const pct = Math.round((q.page / QURAN_PAGES) * 100);
      html += `<div class="quran-top"><div><b class="big">${q.page}</b><span class="muted"> / ${QURAN_PAGES} ${t("Seiten")}</span></div><span class="muted small">${pct}%</span></div>
        <div class="bar"><div style="width:${pct}%"></div></div>
        <p class="small">${q.done ? t("Hatim geschafft! Mâşallah.") : q.late ? t("Ziel-Datum ist vorbei. Setz ein neues Ziel.") : t("Ziel {d}: {n} Seiten am Tag, heute noch {l}", { d: fmtDay(g.target, { day: "numeric", month: "short" }), n: q.perDay, l: q.left })}</p>
        <div class="chips quran-add">${[1, 2, 5, 10, 20].map((n) => `<button type="button" class="chip" data-qadd="${n}">+${n === 20 ? " 1 " + t("Juz") : " " + n}</button>`).join("")}</div>
        <button class="btn" id="quran-page">${t("Aktuelle Seite eintragen")}</button>`;
    } else {
      html += `<p class="small">${t("Setz ein Ziel, bis wann du den Koran durchlesen willst. Die App rechnet dir jeden Tag das Pensum aus.")}</p>`;
    }
    html += `<button class="btn ${q ? "" : "fill"}" id="quran-goal">${t(q ? "Ziel ändern" : "Ziel festlegen")}</button></div>`;

    html += `<div class="section-head"><h3>${t("Ramadan")}</h3><span class="muted">${active ? t("aktiv") : ""}</span></div><div class="card">
      <div class="seg" id="ram-seg">${[["auto", "Automatisch"], ["an", "An"], ["aus", "Aus"]].map(([v, n]) => `<button type="button" data-ram="${v}" class="${(s.ramadan ?? "auto") === v ? "on" : ""}">${t(n)}</button>`).join("")}</div>
      <p class="small muted">${t("Automatisch: an im Monat Ramadan laut Hidschri-Kalender. Dann rutschen Supplements und Training aus der Fastenzeit zu Sahur oder nach Iftar.")}</p>
      ${f ? `<div class="ramadan-times"><div><small>${t("Sahur")}</small><b>${f.sahur}</b></div><div><small>${t("Imsak")}</small><b>${f.imsak}</b></div><div><small>${t("Iftar")}</small><b>${f.iftar}</b></div></div>` : ""}`;
    if (active) {
      // Fastentage des laufenden Ramadan als Raster
      const hd = Number(pt?.HijriMonth) === 9 ? Number(pt?.HijriDay) || 1 : 1;
      const start = addDays(new Date(), -(hd - 1));
      const cells = Array.from({ length: 30 }, (_, i) => { const d = iso(addDays(start, i)); const st = daylog.get(d).fasted; return `<button type="button" class="fast-day ${st ?? ""} ${d === today() ? "today" : ""}" data-fday="${d}" ${d > today() ? "disabled" : ""}>${i + 1}</button>`; }).join("");
      const fasted = Array.from({ length: 30 }, (_, i) => daylog.get(iso(addDays(start, i))).fasted).filter((x) => x === "ja").length;
      html += `<p class="small" style="margin-top:12px"><b>${t("{n} Tage gefastet", { n: fasted })}</b>${k ? " · " + t("{n} nachzuholen", { n: k }) : ""}</p><div class="fast-grid">${cells}</div>`;
    }
    html += `<p class="small" style="margin-top:12px">${k ? t("Noch {n} Fastentage nachzuholen.", { n: k }) : t("Keine Fastentage offen.")}</p>
      ${k ? `<button class="btn" id="fast-kaza">${t("Heute nachgeholt")}</button>` : ""}</div>`;
    host.innerHTML = html;
    host.querySelectorAll("[data-qadd]").forEach((b) => (b.onclick = async () => { const r = await addPages(Number(b.dataset.qadd)); toast(r.msg, r.undo); ctx.onChange(); }));
    host.querySelector("#quran-goal").onclick = openGoal;
    host.querySelector("#quran-page")?.addEventListener("click", openPage);
    host.querySelectorAll("[data-ram]").forEach((b) => (b.onclick = async () => { await saveSettings({ ramadan: b.dataset.ram }); ctx.onChange(); }));
    host.querySelectorAll("[data-fday]").forEach((b) => (b.onclick = async () => {
      const cur = daylog.get(b.dataset.fday).fasted;
      await daylog.set(b.dataset.fday, { fasted: cur === "ja" ? "nein" : cur === "nein" ? null : "ja" });
      render(host);
    }));
    host.querySelector("#fast-kaza")?.addEventListener("click", async () => { const r = await setFast("nachholen"); toast(r.msg, r.undo); render(host); });
  }

  function openGoal() {
    const q = quran(), g = goal();
    const def = g?.target ?? iso(addDays(new Date(), 30));
    form.innerHTML = `<h3>${t("Koran-Ziel")}</h3>
      <label>${t("Durchlesen bis")}</label><input type="date" name="until" value="${def}" required>
      <div class="chips ci">${[["30 Tage", 30], ["3 Monate", 90], ["1 Jahr", 365]].map(([l, n]) => `<button type="button" class="chip" data-qd="${n}">${t(l)}</button>`).join("")}</div>
      <label>${t("Ich beginne bei Seite")}</label><input name="start" inputmode="numeric" value="${q && !q.done ? q.page + 1 : 1}">
      <div class="sheet-actions"><button class="primary">${t("Speichern")}</button></div>`;
    enhancePickers?.(form);
    const until = form.querySelector('[name="until"]');
    form.querySelectorAll("[data-qd]").forEach((b) => (b.onclick = () => {
      until.value = iso(addDays(new Date(), Number(b.dataset.qd)));
      const pick = form.querySelector(".pick-date");
      if (pick) pick.textContent = fmtDay(until.value, { weekday: "short", day: "numeric", month: "long" });
    }));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const start = Math.min(QURAN_PAGES, Math.max(1, Number(form.start.value) || 1));
      const r = await setGoal(until.value, start);
      closeSheet(sheet); toast(r.msg); ctx.onChange();
    };
    openSheet(sheet);
  }
  function openPage() {
    const q = quran();
    form.innerHTML = `<h3>${t("Aktuelle Seite")}</h3><label>${t("Zuletzt gelesene Seite")}</label><input name="page" inputmode="numeric" value="${q?.page ?? ""}">
      <div class="sheet-actions"><button class="primary">${t("Speichern")}</button></div>`;
    form.onsubmit = async (e) => { e.preventDefault(); const p = Math.min(QURAN_PAGES, Math.max(0, Number(form.page.value) || 0)); const r = await setPage(p); closeSheet(sheet); toast(r.msg); ctx.onChange(); };
    openSheet(sheet);
  }
  function openAdd() {
    form.innerHTML = `<h3>${t("Koran gelesen")}</h3><label>${t("Seiten heute")}</label><input name="n" inputmode="numeric" placeholder="z. B. 5">
      <div class="chips ci">${[1, 2, 5, 10, 20].map((n) => `<button type="button" class="chip" data-qn="${n}">${n === 20 ? "1 " + t("Juz") : n}</button>`).join("")}</div>
      <div class="sheet-actions"><button class="primary">${t("Eintragen")}</button></div>`;
    form.querySelectorAll("[data-qn]").forEach((b) => (b.onclick = () => (form.n.value = b.dataset.qn)));
    form.onsubmit = async (e) => { e.preventDefault(); const n = Number(form.n.value); if (!n) return; const r = await addPages(n); closeSheet(sheet); toast(r.msg, r.undo); ctx.onChange(); };
    openSheet(sheet);
  }

  async function runVoice(c) {
    if (c.action === "pages") return addPages(c.pages);
    if (c.action === "page") return setPage(c.page);
    if (c.action === "goal") return setGoal(c.target);
    if (c.action === "fast") return setFast(c.value);
    if (c.action === "ramadan") { await saveSettings({ ramadan: c.mode }); return { msg: t(c.mode === "an" ? "Ramadan-Modus an" : c.mode === "aus" ? "Ramadan-Modus aus" : "Ramadan-Modus automatisch") }; }
    if (c.action === "status") {
      const q = quran();
      return { msg: q ? t("Koran: Seite {p}, heute noch {n}", { p: q.page, n: q.left }) : t("Noch kein Koran-Ziel") };
    }
    return null;
  }

  return { load, render, dayCard, dayHint, runVoice, openAdd, openGoal, setFast, quran, kaza };
}
