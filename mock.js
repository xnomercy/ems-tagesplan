// Nur für ?demo: Daten im Speicher statt Supabase, zum Ausprobieren und Testen.
const uid = "demo-user";
const id = () => Math.random().toString(36).slice(2);
const tables = { settings: [], routines: [], items: [], completions: [] };
const defaults = {
  settings: () => ({ user_id: uid, lat: null, lng: null, prayer_method: 13, calendar_token: "demo" }),
  routines: () => ({ id: id(), user_id: uid, category: "sonstiges", prayer: null, at_time: null, days: [1, 2, 3, 4, 5, 6, 7], notes: null, active: true }),
  items: () => ({ id: id(), user_id: uid, kind: "aufgabe", on_date: new Date().toISOString().slice(0, 10), start_time: null, end_time: null, notes: null, done: false }),
  completions: () => ({ user_id: uid }),
};

class Query {
  constructor(t) { this.t = t; this.filters = []; this.op = "select"; this.orders = []; this.one = null; this.opts = {}; }
  select(_c, opts = {}) { if (this.op === "select") this.opts = opts; this.returning = true; return this; }
  eq(k, v) { this.filters.push((r) => r[k] === v); return this; }
  gte(k, v) { this.filters.push((r) => r[k] >= v); return this; }
  lte(k, v) { this.filters.push((r) => r[k] <= v); return this; }
  not(k, _op, _v) { this.filters.push((r) => r[k] != null); return this; }
  order(k) { this.orders.push(k); return this; }
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
      out = T.filter(match); out.forEach((r) => Object.assign(r, this.patch));
    } else if (this.op === "delete") {
      for (let i = T.length - 1; i >= 0; i--) if (match(T[i])) T.splice(i, 1);
    } else {
      out = T.filter(match);
      for (const k of [...this.orders].reverse()) out = [...out].sort((a, b) => String(a[k] ?? "~").localeCompare(String(b[k] ?? "~")));
    }
    out = out.map((r) => ({ ...r }));
    if (this.opts.head) return { data: null, count: out.length, error: null };
    if (this.one) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  }
}

const session = { user: { id: uid, email: "demo@example.org" } };
export const db = {
  from: (t) => new Query(t),
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => {},
    signOut: async () => location.reload(),
  },
};
