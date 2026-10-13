// Nur für ?demo: Daten im Speicher statt Supabase, zum Ausprobieren und Testen.
const uid = "demo-user";
const id = () => Math.random().toString(36).slice(2);
const tables = { settings: [], routines: [], items: [], completions: [], supplies: [], push_subscriptions: [], exercises: [], workouts: [], workout_sessions: [], workout_sets: [], rest_alarms: [], body_metrics: [], shopping_lists: [], shopping_items: [], shopping_trips: [], shopping_list_members: [] };
const defaults = {
  settings: () => ({ user_id: uid, lat: null, lng: null, prayer_method: 13, calendar_token: "demo", nag_minutes: 20 }),
  routines: () => ({ id: id(), user_id: uid, category: "sonstiges", prayer: null, at_time: null, anchor_prayer: null, anchor_offset: 15, priority: "normal", days: [1, 2, 3, 4, 5, 6, 7], notes: null, active: true }),
  items: () => ({ id: id(), user_id: uid, repeat: null, series_id: null, done_at: null, created_at: new Date().toISOString(), kind: "aufgabe", priority: "normal", location: null, remind_before: null, checklist: [], area: null, on_date: new Date().toISOString().slice(0, 10), start_time: null, end_time: null, notes: null, done: false }),
  completions: () => ({ user_id: uid }),
  supplies: () => ({ id: id(), user_id: uid, unit: "Kapseln", stock: 0, per_day: 1, counted_on: new Date().toISOString().slice(0, 10), warn_days: 7, created_at: new Date().toISOString() }),
  push_subscriptions: () => ({ user_id: uid }),
  exercises: () => ({ id: id(), user_id: uid, pattern: "generic", mode: "reps", notes: null, sets: 3, rest_sec: 90, created_at: new Date().toISOString() }),
  workouts: () => ({ id: id(), user_id: uid, exercise_ids: [], created_at: new Date().toISOString() }),
  workout_sessions: () => ({ id: id(), user_id: uid, workout_id: null, name: null, started_at: new Date().toISOString(), finished_at: null, notes: null, rpe: null, sleep_h: null, soreness: null, energy: null, pain: null }),
  body_metrics: () => ({ id: id(), user_id: uid, weight_kg: null, waist_cm: null, on_date: new Date().toISOString().slice(0, 10), created_at: new Date().toISOString() }),
  shopping_lists: () => ({ id: id(), owner: uid, name: "Einkaufsliste", budget_month: null, created_at: new Date().toISOString() }),
  shopping_items: () => ({ id: id(), qty: null, category: "sonstiges", store: "supermarkt", note: null, flag: null, done: false, done_at: null, purchased_at: null, trip_id: null, price: null, urgent: false, need_by: null, every_days: null, added_by: uid, created_at: new Date().toISOString() }),
  shopping_trips: () => ({ id: id(), store: null, amount: null, items: 0, finished_at: new Date().toISOString(), by_user: uid }),
  shopping_list_members: () => ({ status: "invited", created_at: new Date().toISOString() }),
  rest_alarms: () => ({ user_id: uid, created_at: new Date().toISOString() }),
  workout_sets: () => ({ id: id(), user_id: uid, set_no: 1, kg: null, reps: null, duration_sec: null, speed: null, incline: null, rir: null, created_at: new Date().toISOString() }),
};

class Query {
  constructor(t) { this.t = t; this.filters = []; this.op = "select"; this.orders = []; this.one = null; this.opts = {}; }
  select(_c, opts = {}) { if (this.op === "select") this.opts = opts; this.returning = true; return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  gte(k, v) { this.filters.push((r) => r[k] >= v); return this; }
  lte(k, v) { this.filters.push((r) => r[k] <= v); return this; }
  gt(k, v) { this.filters.push((r) => r[k] > v); return this; }
  limit(n) { this.max = n; return this; }
  not(k, _op, _v) { this.filters.push((r) => r[k] != null); return this; }
  order(k, o = {}) { this.orders.push([k, o.ascending === false ? -1 : 1]); return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  insert(rows) { this.op = "insert"; this.rows = [].concat(rows); return this; }
  upsert(rows) { this.op = "upsert"; this.rows = [].concat(rows); return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  delete() { this.op = "delete"; return this; }
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
  run() {
    const T = tables[this.t];
    const match = (r) => this.filters.every((f) => f(r));
    let out = [];
    if (this.op === "insert" || this.op === "upsert") {
      for (const r of this.rows) {
        const row = { ...defaults[this.t](), ...r };
        if (this.op === "upsert") {
          const i = T.findIndex((x) => x.routine_id === row.routine_id && x.on_date === row.on_date);
          if (i >= 0) T.splice(i, 1);
        }
        T.push(row); out.push(row);
      }
    } else if (this.op === "update") {
      out = T.filter(match);
      // wie der Trigger in der Datenbank: Erledigt-Zeitpunkt merken
      out.forEach((r) => Object.assign(r, this.patch, "done" in this.patch ? { done_at: this.patch.done ? new Date().toISOString() : null } : {}));
    } else if (this.op === "delete") {
      for (let i = T.length - 1; i >= 0; i--) if (match(T[i])) T.splice(i, 1);
    } else {
      out = T.filter(match);
      for (const [k, dir] of [...this.orders].reverse()) out = [...out].sort((a, b) => dir * String(a[k] ?? "~").localeCompare(String(b[k] ?? "~")));
      if (this.max) out = out.slice(0, this.max);
    }
    out = out.map((r) => ({ ...r }));
    if (this.opts.head) return { data: null, count: out.length, error: null };
    if (this.one) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
}

const session = { user: { id: uid, email: "demo@example.org" } };
// Nachbau von advance_series() aus der Datenbank
function advanceSeries() {
  const today = new Date().toISOString().slice(0, 10);
  const step = (d, rep, k) => { const x = new Date(d + "T12:00"); if (rep === "taeglich") x.setDate(x.getDate() + k); else if (rep === "woechentlich") x.setDate(x.getDate() + 7 * k); else if (rep === "monatlich") x.setMonth(x.getMonth() + k); else x.setFullYear(x.getFullYear() + k); return x.toISOString().slice(0, 10); };
  const latest = {};
  for (const r of tables.items) if (r.series_id && (!latest[r.series_id] || r.on_date > latest[r.series_id].on_date)) latest[r.series_id] = r;
  for (const r of Object.values(latest)) {
    if (!r.repeat || !((r.kind === "termin" && r.on_date < today) || (r.kind === "aufgabe" && r.done))) continue;
    const first = tables.items.filter((x) => x.series_id === r.series_id).map((x) => x.on_date).sort()[0];
    let k = 1, nd;
    do nd = step(first, r.repeat, k++); while (!(nd > r.on_date && nd >= today) && k < 5000);
    tables.items.push({ ...r, id: id(), on_date: nd, done: false, done_at: null, checklist: (r.checklist ?? []).map((c) => ({ ...c, d: false })) });
  }
}

export const db = {
  from: (t) => new Query(t),
  rpc: async (name) => { if (name === "advance_series") advanceSeries(); return { data: null, error: null }; },
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => {},
    signOut: async () => location.reload(),
    updateUser: async () => ({ data: {}, error: null }),
    signInWithPassword: async () => ({ error: null }),
  },
};
