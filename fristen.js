// Fristen und Verträge: TÜV, Versicherungen, Kündigungsfristen, Ausweise.
// Jede Frist legt eine wichtige Aufgabe zum Erinnerungsdatum an, damit Mitteilung und Kalender sie kennen.
export const KINDS = {
  tuev: { label: "TÜV / HU", repeat: 2, lead: 30, notice: null, task: "TÜV-Termin machen: {x}" },
  versicherung: { label: "Versicherung", repeat: 1, lead: 14, notice: 1, task: "Versicherung prüfen oder kündigen: {x}" },
  vertrag: { label: "Vertrag / Abo", repeat: 1, lead: 14, notice: 1, task: "Vertrag kündigen oder verlängern: {x}" },
  ausweis: { label: "Personalausweis", repeat: 10, lead: 90, notice: null, task: "Neuen Ausweis beantragen: {x}" },
  pass: { label: "Reisepass", repeat: 10, lead: 90, notice: null, task: "Neuen Reisepass beantragen: {x}" },
  fuehrerschein: { label: "Führerschein", repeat: 15, lead: 90, notice: null, task: "Führerschein verlängern: {x}" },
  steuer: { label: "Steuererklärung", repeat: 1, lead: 30, notice: null, task: "Steuererklärung abgeben: {x}" },
  sonstiges: { label: "Sonstiges", repeat: null, lead: 14, notice: null, task: "Frist: {x}" },
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addMonths = (s, n) => { const d = new Date(s + "T12:00"); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
const addDaysIso = (s, n) => { const d = new Date(s + "T12:00"); d.setDate(d.getDate() + n); return iso(d); };
export const daysUntil = (s, today) => Math.round((Date.parse(s + "T12:00") - Date.parse(today + "T12:00")) / 864e5);
// Bis wann man handeln muss (bei Verträgen: Kündigungsdatum) und wann die App erinnert
export const actionDate = (d) => (d.notice_months ? addMonths(d.due_date, -d.notice_months) : d.due_date);
export const remindDate = (d) => addDaysIso(actionDate(d), -(d.lead_days ?? 0));

// ---------- Sprache ----------
const KIND_RE = [
  ["tuev", /(?<!\p{L})(?:tüv|hauptuntersuchung|hu(?!\p{L})|muayene\p{L}*)/iu],
  ["versicherung", /versicherung|sigorta\p{L}*/iu],
  ["ausweis", /personalausweis|(?<!\p{L})ausweis|kimli\p{L}*/iu],
  ["pass", /reisepass|(?<!\p{L})pass(?!\p{L})|pasaport\p{L}*/iu],
  ["fuehrerschein", /führerschein|ehliyet\p{L}*/iu],
  ["steuer", /steuererklärung|vergi beyan\p{L}*/iu],
  ["vertrag", /vertrag|(?<!\p{L})abo(?:nnement)?(?!\p{L})|kündigungsfrist|sözleşme\p{L}*|abonelik\p{L}*|fesih/iu],
];
const MONTHS_DE = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
const MONTHS_TR = ["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];

export function parseDeadline(text, now, parseDate) {
  const s = text.replace(/\s+/g, " ").trim();
  if (/(?<!\p{L})(?:termin|randevu\p{L}*|uhr|saat)(?!\p{L})|um \d/iu.test(s)) return null;
  const kind = KIND_RE.find(([, re]) => re.test(s))?.[0];
  if (!kind) return null;
  let date = null, hit = "";
  // "März 2027" / "mart 2027" ohne Tag: Monatserster
  const my = s.match(new RegExp(`(?<![\\p{L}\\d.])(${[...MONTHS_DE, ...MONTHS_TR].join("|")})\\p{L}*\\s+(\\d{4})`, "iu"));
  const pd = parseDate(s, now);
  if (pd.hit) {
    hit = pd.hit;
    date = pd.date;
    const after = s.slice(s.indexOf(pd.hit) + pd.hit.length).match(/^\s*(\d{4})/);
    if (after && !/\d{4}/.test(pd.hit)) { date = new Date(Number(after[1]), date.getMonth(), date.getDate()); hit += after[0]; }
    if (!/\d/.test(pd.hit)) return null;
  } else if (my) {
    const mon = [...MONTHS_DE, ...MONTHS_TR].indexOf(my[1].toLocaleLowerCase("de-DE").replace("i̇", "i")) % 12;
    date = new Date(Number(my[2]), mon, 1); hit = my[0];
  }
  if (!date) return null;
  const nm = s.match(/(\d{1,2})\s*(?:monat\p{L}*|ay)(?!\p{L})/iu) ?? s.match(/(?:kündigungsfrist|fesih süresi)\s*(?:von\s*)?(\d{1,2})/iu);
  const notice = nm && /kündig|frist|fesih|süre/iu.test(s) ? Number(nm[1]) : null;
  let title = s.replace(hit, " ")
    .replace(/(?<!\p{L})(?:kündigungsfrist\s*(?:von\s*)?\d*\s*monat\p{L}*|\d+\s*monat\p{L}*\s*kündigungsfrist|fesih süresi\s*\d+\s*ay|\d+\s*ay\s*fesih süresi|(?:läuft|lauft)\s+(?:am\s+)?(?:ab|aus)|endet(?:\s+am)?|ist fällig|fällig(?:\s+am)?|bis zum|bis|am|im|ab|zum|eintragen|merken|trag\p{L}*\s+ein|frist|bitiyor|sona eriyor|kadar|tarihinde)(?!\p{L})/giu, " ")
    .replace(/'\p{L}{1,3}(?!\p{L})/gu, " ")
    .replace(/[.,]+$/g, "").replace(/\s+/g, " ").trim();
  if (!title) title = KINDS[kind].label;
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { type: "frist", kind, due: iso(date), notice, title };
}

export function createDeadlines(ctx) {
  const { db, t, esc, toast, openSheet, closeSheet, sheet, form, fmtDay, enhancePickers, today } = ctx;
  let list = [];

  async function load() {
    const { data } = await db.from("deadlines").select("*").order("due_date");
    list = data ?? [];
    return list;
  }
  const taskTitle = (d) => t(KINDS[d.kind]?.task ?? KINDS.sonstiges.task, { x: d.title });

  // Erinnerungs-Aufgabe anlegen oder nachziehen
  async function syncItem(d) {
    const on = [remindDate(d), today()].sort()[1];
    const row = { kind: "aufgabe", title: taskTitle(d), on_date: on, priority: "hoch",
      notes: t("Fällig am {d}", { d: fmtDay(d.due_date, { day: "numeric", month: "long", year: "numeric" }) }) + (d.notice_months ? ". " + t("Kündigen bis {d}", { d: fmtDay(actionDate(d), { day: "numeric", month: "long", year: "numeric" }) }) : "") };
    if (d.item_id) {
      const { data } = await db.from("items").update({ ...row, done: false }).eq("id", d.item_id).select();
      if (data?.length) return d.item_id;
    }
    const { data } = await db.from("items").insert(row).select().single();
    if (!data) return null;
    await db.from("deadlines").update({ item_id: data.id }).eq("id", d.id);
    d.item_id = data.id;
    return data.id;
  }

  async function save(d) {
    const row = { title: d.title, kind: d.kind, due_date: d.due_date, notice_months: d.notice_months ?? null, lead_days: d.lead_days ?? KINDS[d.kind].lead, repeat_years: d.repeat_years ?? null, notes: d.notes ?? null };
    let saved;
    if (d.id) { const { data, error } = await db.from("deadlines").update(row).eq("id", d.id).select().single(); if (error) return { error }; saved = data ?? { ...d, ...row }; }
    else { const { data, error } = await db.from("deadlines").insert(row).select().single(); if (error) return { error }; saved = data; }
    await syncItem(saved);
    await load();
    return { data: saved };
  }
  async function remove(d) {
    await db.from("deadlines").delete().eq("id", d.id);
    if (d.item_id) await db.from("items").delete().eq("id", d.item_id);
    await load();
  }
  // Erledigt: wiederkehrende Fristen rutschen ins nächste Intervall
  async function done(d) {
    if (d.repeat_years) {
      const next = { ...d, due_date: addMonths(d.due_date, 12 * d.repeat_years) };
      if (d.item_id) await db.from("items").update({ done: true }).eq("id", d.item_id);
      next.item_id = null;
      await db.from("deadlines").update({ due_date: next.due_date, item_id: null }).eq("id", d.id);
      await syncItem(next);
      await load();
      return t("Nächste Frist: {d}", { d: fmtDay(next.due_date, { day: "numeric", month: "long", year: "numeric" }) });
    }
    await db.from("deadlines").update({ done: true }).eq("id", d.id);
    if (d.item_id) await db.from("items").update({ done: true }).eq("id", d.item_id);
    await load();
    return t("Erledigt: {x}", { x: d.title });
  }

  function render(host) {
    const td = today();
    const open = list.filter((d) => !d.done).sort((a, b) => actionDate(a).localeCompare(actionDate(b)));
    const row = (d) => {
      const act = actionDate(d), n = daysUntil(act, td);
      const cls = n < 0 ? "late" : n <= (d.lead_days ?? 30) ? "soon" : "";
      const when = n < 0 ? t("seit {n} Tagen vorbei", { n: -n }) : n === 0 ? t("heute") : t("in {n} Tagen", { n });
      return `<button type="button" class="dl-row ${cls}" data-dl="${d.id}">
        <span class="dl-main"><b>${esc(d.title)}</b><span class="small muted">${t(KINDS[d.kind]?.label ?? "Sonstiges")} · ${t("fällig {d}", { d: fmtDay(d.due_date, { day: "numeric", month: "short", year: "numeric" }) })}${d.notice_months ? " · " + t("kündigen bis {d}", { d: fmtDay(act, { day: "numeric", month: "short" }) }) : ""}</span></span>
        <span class="dl-when">${when}</span></button>`;
    };
    host.innerHTML = `<div class="section-head"><h3>${t("Fristen und Verträge")}</h3><span class="muted">${open.length}</span></div>
      ${open.length ? `<div class="card dl-card">${open.map(row).join("")}</div>` : `<div class="empty">${t("Noch keine Fristen. Trag TÜV, Versicherungen, Verträge oder Ausweise ein. Die App erinnert rechtzeitig.")}</div>`}
      <button class="primary" id="dl-add">${t("Frist hinzufügen")}</button>
      ${open.length ? "" : `<div class="chips shop-sug wrap" style="margin-top:12px">${["tuev", "versicherung", "vertrag", "ausweis", "pass"].map((k) => `<button type="button" class="chip" data-dl-kind="${k}">+ ${t(KINDS[k].label)}</button>`).join("")}</div>`}`;
    host.querySelector("#dl-add").onclick = () => openEdit();
    host.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = () => openEdit(list.find((d) => d.id === b.dataset.dl))));
    host.querySelectorAll("[data-dl-kind]").forEach((b) => (b.onclick = () => openEdit({ kind: b.dataset.dlKind })));
  }

  function openEdit(d = {}) {
    const isNew = !d.id;
    const v = { kind: d.kind ?? "sonstiges" };
    const draw = (f = {}) => {
      const k = KINDS[v.kind];
      const val = (key, def) => esc(f[key] ?? def ?? "");
      form.innerHTML = `<h3>${t(isNew ? "Neue Frist" : "Frist")}</h3>
        <label>${t("Art")}</label><div class="chips ci">${Object.entries(KINDS).map(([key, x]) => `<button type="button" class="chip ${key === v.kind ? "on" : ""}" data-kind="${key}">${t(x.label)}</button>`).join("")}</div>
        <label>${t("Bezeichnung")}</label><input name="title" value="${val("title", d.title ?? (isNew && v.kind !== "sonstiges" ? t(k.label) : ""))}" placeholder="${t("z. B. TÜV Golf, Handyvertrag, Kfz-Versicherung")}" required>
        <label>${t(v.kind === "vertrag" || v.kind === "versicherung" ? "Vertragsende" : "Fällig / läuft ab am")}</label><input type="date" name="due" value="${val("due", d.due_date ?? "")}" required>
        ${v.kind === "vertrag" || v.kind === "versicherung" || f.notice || d.notice_months ? `<label>${t("Kündigungsfrist")}</label><select name="notice">${[["", "Keine"], ["1", "1 Monat"], ["2", "2 Monate"], ["3", "3 Monate"], ["6", "6 Monate"], ["12", "12 Monate"]].map(([x, l]) => `<option value="${x}" ${String(f.notice ?? d.notice_months ?? (isNew ? k.notice ?? "" : "")) === x ? "selected" : ""}>${t(l)}</option>`).join("")}</select>` : ""}
        <label>${t("Erinnern")}</label><select name="lead">${[[7, "1 Woche vorher"], [14, "2 Wochen vorher"], [30, "1 Monat vorher"], [60, "2 Monate vorher"], [90, "3 Monate vorher"]].map(([x, l]) => `<option value="${x}" ${Number(f.lead ?? d.lead_days ?? k.lead) === x ? "selected" : ""}>${t(l)}</option>`).join("")}</select>
        <label>${t("Wiederholt sich")}</label><select name="repeat">${[["", "Nein"], ["1", "Jedes Jahr"], ["2", "Alle 2 Jahre"], ["5", "Alle 5 Jahre"], ["10", "Alle 10 Jahre"], ["15", "Alle 15 Jahre"]].map(([x, l]) => `<option value="${x}" ${String(f.repeat ?? d.repeat_years ?? (isNew ? k.repeat ?? "" : "")) === x ? "selected" : ""}>${t(l)}</option>`).join("")}</select>
        <label>${t("Notiz")}</label><input name="notes" value="${val("notes", d.notes)}" placeholder="${t("z. B. Vertragsnummer, Kennzeichen")}">
        <div class="sheet-actions"><button class="primary">${t(isNew ? "Hinzufügen" : "Speichern")}</button></div>
        ${isNew ? "" : `<button type="button" class="btn" id="dl-done">${t(d.repeat_years ? "Erledigt, nächste Frist planen" : "Erledigt")}</button><button type="button" class="ghost danger" id="dl-del">${t("Löschen")}</button>`}`;
      enhancePickers?.(form);
      form.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => {
        const keep = Object.fromEntries(new FormData(form));
        // Vorgeschlagene Bezeichnung mitwechseln, solange nichts Eigenes drinsteht
        if (Object.values(KINDS).some((x) => t(x.label) === keep.title) || !keep.title) keep.title = b.dataset.kind === "sonstiges" ? "" : t(KINDS[b.dataset.kind].label);
        v.kind = b.dataset.kind;
        delete keep.lead; delete keep.repeat; delete keep.notice;
        draw(keep);
      }));
      form.querySelector("#dl-done")?.addEventListener("click", async () => { closeSheet(sheet); toast(await done(d)); ctx.onChange(); });
      form.querySelector("#dl-del")?.addEventListener("click", async () => { closeSheet(sheet); await remove(d); toast(t("Gelöscht: {x}", { x: d.title })); ctx.onChange(); });
    };
    draw();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      if (!f.get("due")) return toast(t("Bitte ein Datum wählen"));
      const r = await save({ ...d, kind: v.kind, title: f.get("title").trim(), due_date: f.get("due"), notice_months: Number(f.get("notice")) || null, lead_days: Number(f.get("lead")), repeat_years: Number(f.get("repeat")) || null, notes: f.get("notes").trim() || null });
      if (r.error) return toast(r.error.message);
      closeSheet(sheet);
      toast(t("Frist gespeichert. Erinnerung am {d}", { d: fmtDay([remindDate(r.data), today()].sort()[1], { day: "numeric", month: "long", year: "numeric" }) }));
      ctx.onChange();
    };
    openSheet(sheet);
  }

  async function runVoice(c) {
    const k = KINDS[c.kind];
    const r = await save({ kind: c.kind, title: c.title, due_date: c.due, notice_months: c.notice ?? k.notice, lead_days: k.lead, repeat_years: k.repeat });
    if (r.error) return { msg: r.error.message };
    const d = r.data;
    return { msg: t("Frist: {x}, fällig {d}. Erinnerung am {r}", { x: d.title, d: fmtDay(d.due_date, { day: "numeric", month: "short", year: "numeric" }), r: fmtDay([remindDate(d), today()].sort()[1], { day: "numeric", month: "short", year: "numeric" }) }),
      undo: async () => { await remove(d); ctx.onChange(); } };
  }

  return { load, render, openEdit, runVoice, list: () => list };
}
