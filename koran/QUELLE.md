# Koran-Text und Schriften

- `quran-1.json`: Uthmani-Hafs-Text des King-Fahd-Komplexes (Version 13), übernommen aus
  fawazahmed0/quran-api (`ara-quranuthmanihaf`). Zwei Umwandlungsfehler dieser Kopie sind entfernt:
  unsichtbare RLM-Zeichen und ein Leerzeichen zwischen offenem Tanwin und folgendem Alif/Ya.
  Gegengeprüft gegen den Tanzil-Uthmani-Text: alle 6236 Ayets haben dieselben Buchstaben
  (abgesehen von bekannten Schreibvarianten wie يَٰصَٰحِبَيِ und مالي/ما لي).
  Seiten (604, Medina-Zählung) und Juz-Anfänge aus derselben Quelle (`info.json`).
  Neue Fassung = neuer Dateiname (`quran-2.json`), weil der Service Worker die Datei dauerhaft speichert.
- `../fonts/amiri-quran.woff2`: Amiri Quran (aliftype/amiri), SIL Open Font License 1.1.
- `../fonts/scheherazade-new.woff2`: Scheherazade New (SIL Global), SIL Open Font License 1.1.
