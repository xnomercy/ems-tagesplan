// Kalender-Abo (ICS) für die Tagesplan-App.
// Aufruf: /functions/v1/kalender?token=<calendar_token aus settings>
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TZ = "Europe/Berlin";
const DAYS = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const PRAYER_KEY: Record<string, string> = {
  fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};

const esc = (s: string) =>
  (s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const ymd = (d: string) => d.replaceAll("-", "");
const hms = (t: string) => t.slice(0, 5).replace(":", "") + "00";

function addMinutes(t: string, min: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = Math.min(h * 60 + m + min, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function event(uid: string, date: string, start: string, end: string, title: string, notes?: string, rrule?: string, location?: string) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}@tagesplan`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=${TZ}:${ymd(date)}T${hms(start)}`,
    `DTEND;TZID=${TZ}:${ymd(date)}T${hms(end)}`,
    `SUMMARY:${esc(title)}`,
  ];
  if (rrule) lines.push(`RRULE:${rrule}`);
  if (notes) lines.push(`DESCRIPTION:${esc(notes)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
  return lines.join("\r\n");
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response("Nicht erlaubt", { status: 403 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: settings } = await db.from("settings").select("*").eq("calendar_token", token).maybeSingle();
  if (!settings) return new Response("Nicht erlaubt", { status: 403 });
  const uid = settings.user_id;

  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [{ data: routines }, { data: items }] = await Promise.all([
    db.from("routines").select("*").eq("user_id", uid).eq("active", true),
    db.from("items").select("*").eq("user_id", uid).gte("on_date", since).not("start_time", "is", null),
  ]);

  const out: string[] = [];
  const startDate = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);

  for (const r of routines ?? []) {
    if (r.prayer || r.anchor_prayer || !r.at_time) continue;
    const byday = (r.days as number[]).map((d) => DAYS[d]).join(",");
    out.push(event(r.id, startDate, r.at_time, addMinutes(r.at_time, 15), r.title, r.notes, `FREQ=WEEKLY;BYDAY=${byday}`));
  }

  // Serien: die jüngste Folge bekommt eine Wiederholungsregel, damit der Kalender auch die künftigen zeigt
  const FREQ: Record<string, string> = { taeglich: "DAILY", woechentlich: "WEEKLY", monatlich: "MONTHLY", jaehrlich: "YEARLY" };
  const latest = new Map<string, { id: string; on_date: string }>();
  for (const i of items ?? []) {
    if (!i.series_id || !i.repeat) continue;
    const cur = latest.get(i.series_id);
    if (!cur || i.on_date > cur.on_date) latest.set(i.series_id, i);
  }
  for (const i of items ?? []) {
    const end = i.end_time ?? addMinutes(i.start_time, 60);
    const rrule = i.series_id && latest.get(i.series_id)?.id === i.id && FREQ[i.repeat] ? `FREQ=${FREQ[i.repeat]}` : undefined;
    out.push(event(i.id, i.on_date, i.start_time, end, i.kind === "aufgabe" ? `Aufgabe: ${i.title}` : i.title, i.notes, rrule, i.location));
  }

  // Gebete und an Gebete gekoppelte Routinen: Zeiten pro Tag für diesen und nächsten Monat
  const prayers = (routines ?? []).filter((r) => r.prayer || r.anchor_prayer);
  if (prayers.length && settings.lat != null && settings.lng != null) {
    const now = new Date();
    for (let k = 0; k < 2; k++) {
      const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
      try {
        const res = await fetch(
          `https://api.aladhan.com/v1/calendar/${d.getFullYear()}/${d.getMonth() + 1}?latitude=${settings.lat}&longitude=${settings.lng}&method=${settings.prayer_method}`,
        );
        const json = await res.json();
        for (const day of json.data ?? []) {
          const [dd, mm, yyyy] = day.date.gregorian.date.split("-");
          const date = `${yyyy}-${mm}-${dd}`;
          if (date < startDate) continue;
          const weekday = ((new Date(date).getUTCDay() + 6) % 7) + 1;
          for (const p of prayers) {
            if (!(p.days as number[]).includes(weekday)) continue;
            const base = String(day.timings[PRAYER_KEY[p.prayer ?? p.anchor_prayer]]).slice(0, 5);
            const t = p.prayer ? base : addMinutes(base, p.anchor_offset ?? 15);
            out.push(event(`${p.id}-${date}`, date, t, addMinutes(t, 15), p.title, p.notes));
          }
        }
      } catch (_) { /* Gebetszeiten-Dienst nicht erreichbar: Rest trotzdem ausliefern */ }
    }
  }

  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tagesplan//DE", "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Tagesplan", `X-WR-TIMEZONE:${TZ}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    ...out, "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
});
