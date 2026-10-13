// Homescreen-Widget: nächstes Gebet und nächste Aufgabe als JSON (Scriptable) oder Text (Kurzbefehle).
// Aufruf: /functions/v1/widget?token=<calendar_token>&lang=de|tr[&format=text]
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TZ = "Europe/Berlin";
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const KEY: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
const TR_NAME: Record<string, string> = { fajr: "Sabah", dhuhr: "Öğle", asr: "İkindi", maghrib: "Akşam", isha: "Yatsı" };
const L = {
  de: { prayer: "Nächstes Gebet", next: "Als Nächstes", tomorrow: "morgen", in: (h: number, m: number) => `in ${h ? `${h} Std. ` : ""}${m} Min.`, iftar: "Iftar", nothing: "Nichts mehr offen", now: "jetzt" },
  tr: { prayer: "Sıradaki namaz", next: "Sırada", tomorrow: "yarın", in: (h: number, m: number) => `${h ? `${h} sa ` : ""}${m} dk sonra`, iftar: "İftar", nothing: "Açık iş yok", now: "şimdi" },
};
const cors = { "Access-Control-Allow-Origin": "*" };
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(":").map(Number); return h * 60 + m; };
const fmt = (m: number) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

function berlinNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute), weekday, ddmmyyyy: `${p.day}-${p.month}-${p.year}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Nicht erlaubt", { status: 403, headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: settings } = await db.from("settings").select("*").eq("calendar_token", token).maybeSingle();
  if (!settings) return new Response("Nicht erlaubt", { status: 403, headers: cors });
  const uid = settings.user_id;
  const lang = (url.searchParams.get("lang") ?? settings.lang) === "tr" ? "tr" : "de";
  const tx = L[lang];
  const now = berlinNow();

  let pt = settings.pt_cache?.date === now.date ? settings.pt_cache.timings : null;
  if (!pt && settings.lat != null) {
    try {
      const res = await fetch(`https://api.aladhan.com/v1/timings/${now.ddmmyyyy}?latitude=${settings.lat}&longitude=${settings.lng}&method=${settings.prayer_method}`);
      const j = (await res.json()).data;
      pt = { ...j.timings, HijriMonth: j.date?.hijri?.month?.number ?? null, HijriDay: Number(j.date?.hijri?.day) || null };
      await db.from("settings").update({ pt_cache: { date: now.date, timings: pt } }).eq("user_id", uid);
    } catch (_) { pt = null; }
  }
  const out: Record<string, unknown> = { updated: fmt(now.min) };
  const inTxt = (m: number) => (m <= 0 ? tx.now : tx.in(Math.floor(m / 60), m % 60));

  if (pt) {
    const next = PRAYERS.map((p) => ({ p, at: toMin(pt[KEY[p]]) })).find((x) => x.at > now.min);
    const p = next ?? { p: "fajr", at: toMin(pt.Fajr) + 1440 };
    out.prayer = { label: tx.prayer, name: lang === "tr" ? TR_NAME[p.p] : KEY[p.p], time: fmt(p.at) + (next ? "" : ` (${tx.tomorrow})`), in: inTxt(p.at - now.min) };
    const ram = settings.ramadan === "an" || ((settings.ramadan ?? "auto") === "auto" && Number(pt.HijriMonth) === 9);
    if (ram) out.ramadan = { label: tx.iftar, iftar: fmt(toMin(pt.Maghrib)) };
  }

  // Nächste Aufgabe: Termine/Aufgaben von heute, sonst offene Routinen, sonst Fälliges ohne Uhrzeit
  const [{ data: items }, { data: routines }, { data: done }] = await Promise.all([
    db.from("items").select("title,kind,on_date,start_time,done").eq("user_id", uid).eq("done", false).lte("on_date", now.date).order("on_date"),
    db.from("routines").select("id,title,prayer,anchor_prayer,anchor_offset,at_time,days,active").eq("user_id", uid).eq("active", true),
    db.from("completions").select("routine_id").eq("user_id", uid).eq("on_date", now.date),
  ]);
  const doneSet = new Set((done ?? []).map((d) => d.routine_id));
  const cands: { title: string; at: number }[] = [];
  for (const i of items ?? []) if (i.on_date === now.date && i.start_time) cands.push({ title: i.title, at: toMin(i.start_time) });
  for (const r of routines ?? []) {
    if (r.prayer || !r.days.includes(now.weekday) || doneSet.has(r.id)) continue;
    let at: number | null = null;
    if (r.anchor_prayer && pt) {
      const off = r.anchor_offset ?? 15;
      at = toMin(pt[KEY[r.anchor_prayer]]) + off;
      if (off < 0) { at = ((at % 1440) + 1440) % 1440; const floor = toMin(pt.Isha) + 20; if (at >= 720 && at < floor) at = floor; }
    } else if (r.at_time) at = toMin(r.at_time);
    if (at != null) cands.push({ title: r.title, at });
  }
  const upcoming = cands.filter((c) => c.at >= now.min - 10).sort((a, b) => a.at - b.at)[0];
  const openTask = (items ?? []).find((i) => i.kind === "aufgabe" && !i.start_time);
  if (upcoming) out.task = { label: tx.next, title: upcoming.title, when: `${fmt(upcoming.at)} · ${inTxt(upcoming.at - now.min)}` };
  else if (openTask) out.task = { label: tx.next, title: openTask.title, when: "" };
  else out.task = { label: tx.next, title: tx.nothing, when: "" };

  if (url.searchParams.get("format") === "text") {
    const p = out.prayer as { name: string; time: string; in: string } | undefined;
    const tk = out.task as { title: string; when: string };
    const txt = [p ? `${p.name} ${p.time} (${p.in})` : "", `${tx.next}: ${tk.title}${tk.when ? ` (${tk.when})` : ""}`, out.ramadan ? `${tx.iftar} ${(out.ramadan as { iftar: string }).iftar}` : ""].filter(Boolean).join("\n");
    return new Response(txt, { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
});
