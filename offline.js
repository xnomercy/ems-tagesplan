// Offline-Modus: Schreibvorgänge ohne Netz landen in einer Warteschlange und werden nachgeschickt,
// Lesen fällt auf die letzte Antwort zurück. Änderungen erscheinen sofort, auch in den gemerkten Antworten.
const QKEY = "tagesplan-outbox", CKEY = "tagesplan-readcache", MAX_CACHE = 120;
const WRITES = ["insert", "upsert", "update", "delete"];
// Tabellen mit eigener id: offline vergeben wir sie selbst, damit spätere Änderungen dieselbe Zeile treffen
const ID_TABLES = new Set(["routines", "items", "supplies", "exercises", "workouts", "workout_sessions", "workout_sets", "body_metrics", "shopping_items", "shopping_trips", "shopping_lists", "deadlines"]);
const DEFAULTS = {
  items: { done: false, checklist: [], priority: "normal", repeat: null, series_id: null, start_time: null, end_time: null, notes: null, location: null, area: null, remind_before: null },
  routines: { active: true, priority: "normal", days: [1, 2, 3, 4, 5, 6, 7], prayer: null, anchor_prayer: null, at_time: null, notes: null },
  shopping_items: { done: false, urgent: false, qty: null, price: null, need_by: null, note: null, flag: null, purchased_at: null, trip_id: null, every_days: null },
  workout_sets: { kg: null, reps: null, rir: null, duration_sec: null, speed: null, incline: null },
  daily_log: { water: 0, fasted: null, quran_pages: 0 },
  deadlines: { done: false, notice_months: null, repeat_years: null, notes: null, item_id: null, lead_days: 30, kind: "sonstiges" },
};

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const isNetErr = (e) => !!e && (/fetch|network|load failed|internet|offline|timed? ?out/i.test(String(e.message ?? e)) || e.status === 0);
const online = () => navigator.onLine !== false && !globalThis.__forceOffline;

// Filter einer gemerkten Abfrage auf eine Zeile anwenden (fehlende Spalten zählen als passend)
function matches(row, calls) {
  for (const [m, a] of calls) {
    const [k, v] = a, have = row[k];
    if (["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "not"].includes(m) && !(k in row)) continue;
    if (m === "eq" && have !== v) return false;
    if (m === "neq" && have === v) return false;
    if (m === "gt" && !(have > v)) return false;
    if (m === "gte" && !(have >= v)) return false;
    if (m === "lt" && !(have < v)) return false;
    if (m === "lte" && !(have <= v)) return false;
    if (m === "in" && !v.includes(have)) return false;
    if (m === "contains" && !(Array.isArray(have) && [].concat(v).every((x) => have.includes(x)))) return false;
    if (m === "not" && a[1] === "is" && a[2] === null && have == null) return false;
    if (m === "match" && Object.entries(k).some(([kk, vv]) => row[kk] !== undefined && row[kk] !== vv)) return false;
  }
  return true;
}
const sortRows = (rows, calls) => {
  let out = rows;
  for (const [, a] of [...calls.filter(([m]) => m === "order")].reverse()) {
    const dir = a[1]?.ascending === false ? -1 : 1;
    out = [...out].sort((x, y) => dir * String(x[a[0]] ?? "~").localeCompare(String(y[a[0]] ?? "~")));
  }
  return out;
};
const keyCols = (t) => (t === "completions" ? ["routine_id", "on_date"] : t === "daily_log" ? ["on_date"] : t === "settings" ? ["user_id"] : ["id"]);
const sameRow = (t, a, b) => keyCols(t).every((k) => a[k] !== undefined && a[k] === b[k]);

export function withOffline(db, { onChange = () => {} } = {}) {
  let queue = read(QKEY, []);
  let cache = read(CKEY, []); // [{key, t, calls, data, single}]
  let syncing = null;
  const saveQ = () => { write(QKEY, queue); onChange(queue.length); };
  const saveC = () => { if (cache.length > MAX_CACHE) cache = cache.slice(-MAX_CACHE); write(CKEY, cache); };

  // Offline-Änderung in alle gemerkten Antworten derselben Tabelle einarbeiten
  function patchCaches(t, op, calls, rows, patch) {
    for (const c of cache) {
      if (c.t !== t) continue;
      const filters = c.calls.filter(([m]) => !["select", "order", "limit", "maybeSingle", "single"].includes(m));
      const list = c.single ? (c.data ? [c.data] : []) : c.data ?? [];
      let next = list;
      if (op === "insert" || op === "upsert") {
        for (const r of rows) {
          const i = next.findIndex((x) => sameRow(t, x, r));
          if (i >= 0) next = next.map((x, k) => (k === i ? { ...x, ...r } : x));
          else if (!c.single && matches(r, filters)) next = [...next, r];
        }
        next = sortRows(next, c.calls);
      } else if (op === "update") next = next.map((x) => (matches(x, calls) ? { ...x, ...patch } : x));
      else if (op === "delete") next = next.filter((x) => !matches(x, calls));
      c.data = c.single ? next[0] ?? null : next;
    }
    saveC();
  }

  function enqueue(t, calls) {
    const op = calls.find(([m]) => WRITES.includes(m))[0];
    const wi = calls.findIndex(([m]) => m === op);
    let rows = [], patch = null;
    if (op === "insert" || op === "upsert") {
      rows = [].concat(calls[wi][1][0]).map((r) => (ID_TABLES.has(t) && !r.id ? { ...r, id: crypto.randomUUID() } : { ...r }));
      calls = calls.map((c, i) => (i === wi ? [op, [Array.isArray(c[1][0]) ? rows : rows[0], ...c[1].slice(1)]] : c));
      rows = rows.map((r) => ({ created_at: new Date().toISOString(), ...DEFAULTS[t], ...r }));
    } else if (op === "update") patch = calls[wi][1][0];
    // Betroffene Zeilen aus dem Cache holen, damit .select() auch offline etwas liefert
    const filters = calls.filter(([m]) => !WRITES.includes(m) && !["select", "single", "maybeSingle"].includes(m));
    const known = op === "update" ? cache.filter((c) => c.t === t).flatMap((c) => (c.single ? [c.data] : c.data ?? [])).filter((x) => x && matches(x, filters)) : [];
    patchCaches(t, op, filters, rows, patch);
    queue.push({ t, calls, at: Date.now() });
    saveQ();
    const out = op === "update" ? known.map((x) => ({ ...x, ...patch })) : rows;
    const single = calls.some(([m]) => m === "single" || m === "maybeSingle");
    return { data: single ? out[0] ?? null : out, error: null, offline: true };
  }

  const build = (t, calls) => calls.reduce((q, [m, a]) => q[m](...a), db.from(t));

  async function exec(t, calls) {
    const isWrite = calls.some(([m]) => WRITES.includes(m));
    if (isWrite) {
      if (!online() || queue.length) return enqueue(t, calls);
      try {
        const r = await build(t, calls);
        if (r.error && isNetErr(r.error)) return enqueue(t, calls);
        if (!r.error) {
          const op = calls.find(([m]) => WRITES.includes(m))[0];
          const filters = calls.filter(([m]) => !WRITES.includes(m) && !["select", "single", "maybeSingle"].includes(m));
          const rows = op === "insert" || op === "upsert" ? [].concat(r.data ?? calls.find(([m]) => m === op)[1][0]) : [];
          patchCaches(t, op, filters, rows, op === "update" ? calls.find(([m]) => m === "update")[1][0] : null);
        }
        return r;
      } catch (e) { if (isNetErr(e)) return enqueue(t, calls); throw e; }
    }
    const key = JSON.stringify([t, calls]);
    const single = calls.some(([m]) => m === "single" || m === "maybeSingle");
    const fromCache = () => {
      const c = cache.find((x) => x.key === key);
      return { data: c ? c.data : single ? null : [], error: null, count: c?.count ?? null, offline: true };
    };
    if (!online() || queue.length) {
      // Mit wartenden Änderungen lieber die angepasste Kopie zeigen, sonst wären sie kurz weg
      if (online() && queue.length) sync();
      return fromCache();
    }
    try {
      const r = await build(t, calls);
      if (r.error && isNetErr(r.error)) return fromCache();
      if (!r.error) {
        cache = cache.filter((x) => x.key !== key);
        // Sehr große Antworten nicht merken, der Speicher im Browser ist knapp
        if (JSON.stringify(r.data ?? null).length < 250000) cache.push({ key, t, calls, data: r.data, count: r.count ?? null, single });
        saveC();
      }
      return r;
    } catch (e) { if (isNetErr(e)) return fromCache(); throw e; }
  }

  class Q {
    constructor(t, calls = []) { this.t = t; this.calls = calls; }
    then(res, rej) { return exec(this.t, this.calls).then(res, rej); }
  }
  for (const m of ["select", "insert", "upsert", "update", "delete", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not", "match", "contains", "order", "limit", "range", "single", "maybeSingle", "ilike", "like", "or", "filter"]) {
    Q.prototype[m] = function (...a) { return new Q(this.t, [...this.calls, [m, a]]); };
  }

  // Warteschlange der Reihe nach abschicken; bei Funkloch abbrechen und später weitermachen
  async function sync() {
    if (syncing || !queue.length || !online()) return syncing;
    syncing = (async () => {
      let sent = 0, failed = 0;
      while (queue.length && online()) {
        const job = queue[0];
        let r;
        try { r = await build(job.t, job.calls); } catch (e) { r = { error: e }; }
        if (r.error && isNetErr(r.error)) break;
        if (r.error) { failed++; console.warn("Offline-Änderung abgelehnt", job, r.error); }
        else sent++;
        queue.shift();
        saveQ();
      }
      syncing = null;
      if (sent || failed) onChange(queue.length, { sent, failed });
      return { sent, failed };
    })();
    return syncing;
  }
  addEventListener("online", () => sync());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
  setInterval(() => { if (queue.length) sync(); }, 30000);

  return {
    from: (t) => new Q(t),
    rpc: async (...a) => {
      if (!online()) return { data: null, error: null, offline: true };
      try { return await db.rpc(...a); } catch (e) { return { data: null, error: isNetErr(e) ? null : e }; }
    },
    auth: db.auth,
    get functions() { return db.functions; },
    pending: () => queue.length,
    isOnline: online,
    sync,
    raw: db,
  };
}
