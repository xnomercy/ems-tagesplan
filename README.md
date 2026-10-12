# Tagesplan-App (EMS-Design)

Private PWA für Enes: Tagesplan mit Routinen (Gebete, Lesen, Supps, Training, Pflege), Aufgaben mit Frist, Terminen, Sprachsteuerung und Kalender-Abo.

- Supabase-Projekt: `tagesplan` (ref hpxdhtuabzqwyslzcmbt, Frankfurt, Free Plan)
- Tabellen: routines, items, completions, settings (RLS: nur eigener Nutzer); app_owner + Trigger erlauben Registrierung nur für die hinterlegte E-Mail
- Edge Function `kalender`: ICS-Feed per geheimem Token aus settings.calendar_token
- `web/`: statische App (index.html, app.js, parser.js, style.css, sw.js). `?demo` startet mit Testdaten im Speicher.
- Sprachbefehle: `web/parser.js`, ohne KI, Web Speech API im Browser
