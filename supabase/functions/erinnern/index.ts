// Push-Erinnerungen für die Tagesplan-App. Läuft alle 5 Minuten per pg_cron.
// Hohe Priorität: erinnert alle nag_minutes erneut, bis abgehakt.
// Normale Priorität: eine Mitteilung zur Uhrzeit.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const TZ = "Europe/Berlin";
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const PRAYER_KEY: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };
const APP_URL = "https://xnomercy.github.io/ems-tagesplan/";
const END_OF_DAY = 23 * 60 + 30; // danach ist Ruhe
const MAX_NAG = 5 * 60; // höchstens 5 Stunden lang nachhaken

// Texte der Mitteilungen in der eingestellten App-Sprache
const TXT = {
  de: { testT: "Mitteilungen sind an", testB: "So erinnert dich dein Tagesplan.", prayer: (t: string) => `Gebet: ${t}`, prayerB: (t: string, at: string) => `Zeit für ${t} (${at})`,
    open: "Noch nicht abgehakt", termin: (t: string) => `Termin: ${t}`, at: (t: string) => `um ${t}`, still: "Noch offen", tomorrow: "Morgen",
    tasks: (n: number, late: number) => `${n} offene ${n === 1 ? "Aufgabe" : "Aufgaben"}${late ? `, ${late} überfällig` : ""}`, nth: (n: number) => `${n}. Erinnerung` },
  tr: { testT: "Bildirimler açık", testB: "Tagesplan sana böyle hatırlatır.", prayer: (t: string) => `Namaz: ${t}`, prayerB: (t: string, at: string) => `${t} vakti (${at})`,
    open: "Henüz işaretlenmedi", termin: (t: string) => `Randevu: ${t}`, at: (t: string) => `saat ${t}`, still: "Hâlâ açık", tomorrow: "Yarın",
    tasks: (n: number, late: number) => `${n} açık görev${late ? `, ${late} gecikmiş` : ""}`, nth: (n: number) => `${n}. hatırlatma` },
};
const PRAYER_TR: Record<string, string> = { fajr: "Sabah", dhuhr: "Öğle", asr: "İkindi", maghrib: "Akşam", isha: "Yatsı" };

const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(":").map(Number); return h * 60 + m; };
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function berlinNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute), weekday, ddmmyyyy: `${p.day}-${p.month}-${p.year}` };
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: secrets } = await db.from("app_secrets").select("*");
  const sec = Object.fromEntries((secrets ?? []).map((s) => [s.name, s.value]));
  webpush.setVapidDetails(APP_URL, sec.vapid_public, sec.vapid_private);

  // Testmitteilung aus der App: nur für den angemeldeten Nutzer selbst
  if (new URL(req.url).searchParams.has("test")) {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await db.auth.getUser(jwt);
    if (!user) return new Response("Nicht erlaubt", { status: 401, headers: cors });
    const { data: mine } = await db.from("push_subscriptions").select("*").eq("user_id", user.id);
    const { data: st } = await db.from("settings").select("lang").eq("user_id", user.id).maybeSingle();
    const tx = TXT[st?.lang === "tr" ? "tr" : "de"];
    let ok = 0;
    for (const s of mine ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: tx.testT, body: tx.testB, tag: "test", url: APP_URL }));
        ok++;
      } catch (e) { console.error("test push fehlgeschlagen", String(e)); }
    }
    return new Response(JSON.stringify({ ok }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (req.headers.get("x-cron-secret") !== sec.cron_secret) return new Response("Nicht erlaubt", { status: 403 });

  const now = berlinNow();
  const { data: subs } = await db.from("push_subscriptions").select("*");
  const users = [...new Set((subs ?? []).map((s) => s.user_id))];
  let sent = 0;

  for (const uid of users) {
    const { data: settings } = await db.from("settings").select("*").eq("user_id", uid).maybeSingle();
    if (!settings) continue;
    const tr = settings.lang === "tr";
    const tx = TXT[tr ? "tr" : "de"];

    // Gebetszeiten des Tages, einmal pro Tag geholt
    let pt = settings.pt_cache?.date === now.date ? settings.pt_cache.timings : null;
    if (!pt && settings.lat != null) {
      try {
        const res = await fetch(`https://api.aladhan.com/v1/timings/${now.ddmmyyyy}?latitude=${settings.lat}&longitude=${settings.lng}&method=${settings.prayer_method}`);
        pt = (await res.json()).data.timings;
        await db.from("settings").update({ pt_cache: { date: now.date, timings: pt } }).eq("user_id", uid);
      } catch (_) { pt = null; }
    }
    const tomorrow = new Date(Date.parse(now.date) + 864e5).toISOString().slice(0, 10);
    const prayerMin = (p: string) => (pt ? toMin(String(pt[PRAYER_KEY[p]])) : null);

    const [{ data: routines }, { data: done }, { data: items }, { data: logs }] = await Promise.all([
      db.from("routines").select("*").eq("user_id", uid).eq("active", true),
      db.from("completions").select("routine_id").eq("user_id", uid).eq("on_date", now.date),
      db.from("items").select("*").eq("user_id", uid).eq("done", false).lte("on_date", tomorrow),
      db.from("notify_log").select("*").eq("user_id", uid),
    ]);
    const doneSet = new Set((done ?? []).map((d) => d.routine_id));
    const log = new Map((logs ?? []).map((l) => [l.key, l]));

    // Was ist heute fällig?
    type Due = { key: string; title: string; body: string; at: number; until: number; high: boolean };
    const due: Due[] = [];
    for (const r of routines ?? []) {
      if (!r.days.includes(now.weekday) || doneSet.has(r.id)) continue;
      let at: number | null = null;
      if (r.prayer) at = prayerMin(r.prayer);
      else if (r.anchor_prayer) { const b = prayerMin(r.anchor_prayer); at = b == null ? null : b + (r.anchor_offset ?? 15); }
      else if (r.at_time) at = toMin(r.at_time);
      if (at == null) continue;
      let until = Math.min(at + MAX_NAG, END_OF_DAY);
      if (r.prayer) {
        // Ein Gebet nervt nur bis zum nächsten Gebet
        const next = PRAYERS[PRAYERS.indexOf(r.prayer) + 1];
        until = next && prayerMin(next) != null ? prayerMin(next)! : END_OF_DAY;
      }
      const pname = tr && r.prayer ? PRAYER_TR[r.prayer] : r.title;
      const body = r.prayer ? tx.prayerB(pname, fmt(at)) : `${fmt(at)} · ${r.notes ?? tx.open}`;
      due.push({ key: `r:${r.id}:${now.date}`, title: r.prayer ? tx.prayer(pname) : r.title, body, at, until, high: r.priority === "hoch" });
    }
    for (const i of items ?? []) {
      if (!i.start_time || i.on_date < now.date) continue;
      // Minuten ab heute 0 Uhr, damit auch "1 Tag vorher" klappt
      const dayOffset = Math.round((Date.parse(i.on_date) - Date.parse(now.date)) / 864e5) * 1440;
      const at = dayOffset + toMin(i.start_time) - (i.remind_before ?? (i.kind === "termin" ? 15 : 0));
      if (at > 24 * 60) continue;
      due.push({ key: `i:${i.id}`, title: i.kind === "termin" ? tx.termin(i.title) : i.title, body: [dayOffset ? tx.tomorrow : "", i.kind === "termin" ? tx.at(i.start_time.slice(0, 5)) : tx.still, i.location ?? ""].filter(Boolean).join(" · "),
        at, until: END_OF_DAY, high: i.priority === "hoch" && i.kind === "aufgabe" });
    }
    // Offene Aufgaben ohne Uhrzeit: Sammel-Erinnerung um 9 und 17 Uhr
    const open = (items ?? []).filter((i) => i.kind === "aufgabe" && !i.start_time && i.on_date <= now.date);
    if (open.length) {
      for (const slot of [9 * 60, 17 * 60]) {
        const late = open.filter((i) => i.on_date < now.date).length;
        due.push({ key: `t:${now.date}:${slot}`, title: tx.tasks(open.length, late),
          body: open.slice(0, 4).map((i) => i.title).join(" · "), at: slot, until: slot + 60, high: false });
      }
    }

    // Senden, was jetzt dran ist
    const nag = settings.nag_minutes ?? 20;
    for (const d of due) {
      if (now.min < d.at || now.min > d.until) continue;
      const prev = log.get(d.key);
      if (prev) {
        if (!d.high) continue;
        if (Date.now() - new Date(prev.last_sent).getTime() < (nag - 1) * 60000) continue;
      }
      const count = (prev?.sent_count ?? 0) + 1;
      const payload = JSON.stringify({
        title: count > 1 ? `${d.title} (${tx.nth(count)})` : d.title,
        body: d.body, tag: d.key, high: d.high, url: APP_URL,
      });
      for (const s of (subs ?? []).filter((s) => s.user_id === uid)) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, urgency: d.high ? "high" : "normal" });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          else console.error("push fehlgeschlagen", code, String(e));
        }
      }
      await db.from("notify_log").upsert({ user_id: uid, key: d.key, last_sent: new Date().toISOString(), sent_count: count });
    }
  }

  // Alte Einträge im Log aufräumen
  await db.from("notify_log").delete().lt("last_sent", new Date(Date.now() - 3 * 864e5).toISOString());
  return new Response(JSON.stringify({ sent, at: now }), { headers: { "Content-Type": "application/json" } });
});
