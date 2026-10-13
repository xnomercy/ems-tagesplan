// Mitteilung am Ende der Satzpause, auch wenn die App im Hintergrund ist.
// pg_cron ruft diese Funktion alle paar Sekunden auf, aber nur wenn eine Pause fällig ist.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const APP_URL = "https://xnomercy.github.io/ems-tagesplan/";

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: secrets } = await db.from("app_secrets").select("*");
  const sec = Object.fromEntries((secrets ?? []).map((s) => [s.name, s.value]));
  if (req.headers.get("x-cron-secret") !== sec.cron_secret) return new Response("Nicht erlaubt", { status: 403 });
  webpush.setVapidDetails(APP_URL, sec.vapid_public, sec.vapid_private);

  // Fällige Pausen holen und sofort löschen, damit nichts doppelt rausgeht
  const { data: due } = await db.from("rest_alarms").delete().lte("due_at", new Date().toISOString()).select();
  let sent = 0;
  for (const a of due ?? []) {
    // Länger als 2 Minuten überfällig: Training ist vermutlich vorbei, nicht mehr stören
    if (Date.now() - Date.parse(a.due_at) > 120000) continue;
    const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", a.user_id);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: a.title, body: a.body ?? "", tag: "rest", url: APP_URL }), { TTL: 60, urgency: "high" });
        sent++;
      } catch (e) {
        console.error("pause push fehlgeschlagen", String(e));
        if (String(e).includes("410") || String(e).includes("404")) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
