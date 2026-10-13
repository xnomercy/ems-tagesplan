// Tageswerte (Wasser, Fasten, Koran-Seiten) in der Tabelle daily_log, eine Zeile pro Tag
export function createDayLog(db) {
  const rows = new Map(); // on_date -> Zeile
  let loadedFrom = null;

  async function load(from, to) {
    const { data } = await db.from("daily_log").select("*").gte("on_date", from).lte("on_date", to);
    for (const r of data ?? []) rows.set(r.on_date, r);
    if (!loadedFrom || from < loadedFrom) loadedFrom = from;
    return data ?? [];
  }
  const get = (d) => rows.get(d) ?? { on_date: d, water: 0, fasted: null, quran_pages: 0 };
  async function set(d, patch) {
    const row = { ...get(d), ...patch, on_date: d, updated_at: new Date().toISOString() };
    delete row.user_id;
    rows.set(d, row);
    const { error } = await db.from("daily_log").upsert(row, { onConflict: "user_id,on_date" });
    return error;
  }
  const bump = (d, field, delta, max = 999) => set(d, { [field]: Math.max(0, Math.min(max, (get(d)[field] ?? 0) + delta)) });
  const range = (from, to) => [...rows.values()].filter((r) => r.on_date >= from && r.on_date <= to);
  return { load, get, set, bump, range, all: () => [...rows.values()] };
}
