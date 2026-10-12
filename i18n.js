// Sprachen der App. Schlüssel ist der deutsche Text, Platzhalter in {geschweiften Klammern}.
const KEY = "tagesplan-lang";

export let LANG = "de";
try { LANG = localStorage.getItem(KEY) === "tr" ? "tr" : "de"; } catch {}
export const LOCALE = () => (LANG === "tr" ? "tr-TR" : "de-DE");

export function setLang(l) {
  LANG = l === "tr" ? "tr" : "de";
  try { localStorage.setItem(KEY, LANG); } catch {}
  document.documentElement.lang = LANG;
  translateStatic();
}

const TR = {
  // Anmeldung
  "Klarer Tag.<br>Alles im Griff.": "Net bir gün.<br>Her şey kontrol altında.",
  "E-Mail": "E-posta",
  "Passwort": "Şifre",
  "Anmelden": "Giriş yap",
  "Melde an …": "Giriş yapılıyor …",
  "E-Mail oder Passwort stimmt nicht.": "E-posta veya şifre yanlış.",
  "Bitte zuerst den Link in der Bestätigungsmail anklicken.": "Lütfen önce onay e-postasındaki bağlantıya tıkla.",
  "Diese E-Mail darf hier kein Konto anlegen.": "Bu e-posta ile burada hesap açılamaz.",
  "Passwort anzeigen": "Şifreyi göster",
  "Passwort verbergen": "Şifreyi gizle",
  // Kopf und Leiste
  "Guten Morgen": "Günaydın",
  "Hallo": "Merhaba",
  "Guten Abend": "İyi akşamlar",
  "Neu anlegen": "Yeni ekle",
  "Tag": "Gün",
  "Termine": "Randevular",
  "Routinen": "Rutinler",
  "Mehr": "Daha fazla",
  "Sprechen": "Konuş",
  "Schließen": "Kapat",
  // Kategorien und Bereiche
  "Gebet": "Namaz",
  "Lesen": "Okuma",
  "Training": "Antrenman",
  "Supplements": "Takviyeler",
  "Pflege": "Bakım",
  "Essen": "Yemek",
  "Sonstiges": "Diğer",
  "Arbeit": "İş",
  "Privat": "Özel",
  "Gesundheit": "Sağlık",
  "Familie": "Aile",
  "Finanzen": "Finans",
  "Haushalt": "Ev işleri",
  // Tagesansicht
  "Termin": "Randevu",
  "Aufgabe": "Görev",
  "Routine": "Rutin",
  "überfällig": "gecikmiş",
  "bis {d}": "son {d}",
  "Wichtig": "Önemli",
  " bis {t}": " – {t}",
  "Erledigt": "Tamamlandı",
  "Nicht erledigt": "Tamamlanmadı",
  "Zu heute": "Bugüne dön",
  "Dein Tag": "Günün",
  "Alles erledigt.": "Hepsi tamam.",
  "1 Punkt offen": "1 madde açık",
  "{n} Punkte offen": "{n} madde açık",
  "Noch nichts geplant": "Henüz plan yok",
  "Als Nächstes: {x} um {t}": "Sıradaki: {x}, saat {t}",
  "Für heute keine Uhrzeiten mehr offen.": "Bugün saatli iş kalmadı.",
  "Fortschritt": "İlerleme",
  "Für automatische Gebetszeiten einmal den Standort setzen.": "Otomatik namaz vakitleri için bir kez konum belirle.",
  "Jetzt einrichten": "Şimdi ayarla",
  "Zeitplan": "Program",
  "Ohne feste Zeit": "Saatsiz",
  "Offene Aufgaben": "Açık görevler",
  "mit Frist": "son tarihli",
  "Tippe unten aufs Mikro und sag, was ansteht.": "Aşağıdaki mikrofona dokun ve yapılacakları söyle.",
  "Laden fehlgeschlagen: {x}": "Yüklenemedi: {x}",
  // Routinen
  "{n} Einträge": "{n} kayıt",
  "Feste, wiederkehrende Punkte. Tippe zum Bearbeiten.": "Sabit, tekrarlanan işler. Düzenlemek için dokun.",
  "täglich": "her gün",
  "Täglich": "Her gün",
  "Neue Routine": "Yeni rutin",
  "auto": "oto",
  // Termine
  "Alle": "Hepsi",
  "Kommende Termine": "Yaklaşan randevular",
  "Keine Termine.": "Randevu yok.",
  "Aufgaben": "Görevler",
  "Keine offenen Aufgaben.": "Açık görev yok.",
  "Termin oder Aufgabe anlegen": "Randevu veya görev ekle",
  // Mehr
  "Einstellungen": "Ayarlar",
  "Sprache": "Dil",
  "Mitteilungen": "Bildirimler",
  "Prüfe …": "Kontrol ediliyor …",
  "Mitteilungen einschalten": "Bildirimleri aç",
  "Neu verbinden": "Yeniden bağla",
  "Test senden": "Test gönder",
  "Wichtiges erneut melden alle": "Önemlileri tekrar hatırlat, her",
  "{n} Minuten": "{n} dakika",
  "Gebete erinnern bis zum nächsten Gebet, Wichtiges bis du es abhakst (höchstens 5 Std., nachts ab 23:30 ist Ruhe).":
    "Namazlar bir sonraki vakte kadar, önemli işler sen işaretleyene kadar hatırlatılır (en fazla 5 saat, gece 23:30'dan sonra sessiz).",
  "Gebetszeiten": "Namaz vakitleri",
  "Standort gesetzt ({x}).": "Konum ayarlı ({x}).",
  "Noch kein Standort gesetzt.": "Henüz konum yok.",
  "Aktuellen Standort verwenden": "Mevcut konumu kullan",
  "Berechnung": "Hesaplama",
  "Ägypten": "Mısır",
  "ISNA (Nordamerika)": "ISNA (Kuzey Amerika)",
  "Diyanet (Türkei)": "Diyanet (Türkiye)",
  "Kalender verknüpfen": "Takvime bağla",
  "Abonniere diesen Link in deinem Kalender. Termine, Routinen und Gebetszeiten erscheinen dort mit Erinnerung und aktualisieren sich von selbst.":
    "Bu bağlantıya takviminde abone ol. Randevular, rutinler ve namaz vakitleri hatırlatmayla orada görünür ve kendiliğinden güncellenir.",
  "iPhone: Einstellungen › Kalender › Accounts › Account hinzufügen › Andere › Kalenderabo hinzufügen.":
    "iPhone: Ayarlar › Takvim › Hesaplar › Hesap Ekle › Diğer › Abone Olunan Takvim Ekle.",
  "Im Kalender öffnen": "Takvimde aç",
  "Link kopieren": "Bağlantıyı kopyala",
  "Link kopiert": "Bağlantı kopyalandı",
  "Passwort ändern": "Şifreyi değiştir",
  "Neues Passwort (mind. 10 Zeichen)": "Yeni şifre (en az 10 karakter)",
  "Neues Passwort wiederholen": "Yeni şifreyi tekrarla",
  "Passwort speichern": "Şifreyi kaydet",
  "Die beiden Passwörter sind nicht gleich.": "İki şifre aynı değil.",
  "Das ist schon dein aktuelles Passwort.": "Bu zaten mevcut şifren.",
  "Passwort geändert": "Şifre değiştirildi",
  "Angemeldet als {x}": "Giriş yapan: {x}",
  "Abmelden": "Çıkış yap",
  "Standort gespeichert": "Konum kaydedildi",
  "Standort nicht freigegeben": "Konum izni verilmedi",
  // Push
  "Auf dem iPhone gehen Mitteilungen nur, wenn die App über Teilen › „Zum Home-Bildschirm“ installiert ist und von dort geöffnet wird.":
    "iPhone'da bildirimler yalnızca uygulama Paylaş › „Ana Ekrana Ekle“ ile kurulup oradan açıldığında çalışır.",
  "Dieser Browser kann keine Mitteilungen.": "Bu tarayıcı bildirim desteklemiyor.",
  "Mitteilungen sind blockiert. Bitte in den Einstellungen des Handys für Tagesplan erlauben.": "Bildirimler engelli. Lütfen telefon ayarlarından Tagesplan için izin ver.",
  "Mitteilungen sind an für dieses Gerät.": "Bu cihazda bildirimler açık.",
  "Mitteilungen sind aus.": "Bildirimler kapalı.",
  "Mitteilungen sind an": "Bildirimler açık",
  "Mitteilungen gingen nicht an: {x}": "Bildirimler açılamadı: {x}",
  "Testmitteilung geschickt": "Test bildirimi gönderildi",
  "Kein Gerät verbunden. Erst Mitteilungen einschalten.": "Bağlı cihaz yok. Önce bildirimleri aç.",
  // Detail
  "Gebetszeit": "namaz vakti",
  "{n} Std. vorher": "{n} saat önce",
  "{n} Min. vorher": "{n} dk önce",
  "Fällig": "Son tarih",
  "Wann": "Ne zaman",
  "Ort": "Yer",
  "Priorität": "Öncelik",
  "Hoch, erinnert bis erledigt": "Yüksek, bitene kadar hatırlatır",
  "Normal": "Normal",
  "Erinnerung": "Hatırlatma",
  "Bereich": "Alan",
  "Notiz": "Not",
  "Checkliste": "Kontrol listesi",
  "Wieder öffnen": "Tekrar aç",
  "Bearbeiten": "Düzenle",
  "Löschen": "Sil",
  "Wirklich löschen?": "Gerçekten silinsin mi?",
  // Formulare
  "Hoch (nervt)": "Yüksek (ısrarlı)",
  "Was?": "Ne?",
  "Fällig am": "Son tarih",
  "Datum": "Tarih",
  "Von": "Başlangıç",
  "Bis": "Bitiş",
  "z. B. Praxis Dr. Müller, Neuwied": "örn. Dr. Müller muayenehanesi, Neuwied",
  "Zur Uhrzeit": "Tam saatinde",
  "1 Tag vorher": "1 gün önce",
  "Kein Bereich": "Alan yok",
  "+ Punkt hinzufügen": "+ Madde ekle",
  "Punkt": "Madde",
  "Entfernen": "Kaldır",
  "Speichern": "Kaydet",
  "Abbrechen": "Vazgeç",
  "Routine bearbeiten": "Rutini düzenle",
  "Die Uhrzeit kommt automatisch aus den Gebetszeiten.": "Saat otomatik olarak namaz vakitlerinden gelir.",
  "Zeitpunkt": "Zaman",
  "Feste Uhrzeit": "Sabit saat",
  "Nach {x}": "{x} sonrası",
  "Uhrzeit": "Saat",
  "Minuten danach": "Kaç dakika sonra",
  "Wiederholen an": "Tekrar günleri",
  "Aktiv": "Aktif",
  "Mindestens einen Tag wählen": "En az bir gün seç",
  // Sprache
  "Sag einfach, was ansteht": "Yapılacakları söyle",
  "Zuhören starten": "Dinlemeyi başlat",
  "Tippe zum Sprechen": "Konuşmak için dokun",
  "Oder hier tippen bzw. das Tastatur-Mikro nutzen": "Ya da buraya yaz veya klavye mikrofonunu kullan",
  "Übernehmen": "Uygula",
  "Tipp ins Feld und nutze das Mikro deiner Tastatur.": "Alana dokun ve klavyenin mikrofonunu kullan.",
  "Nichts gehört. Nochmal tippen.": "Bir şey duyulmadı. Tekrar dokun.",
  "Mikro hier nicht verfügbar. Nutze das Mikro deiner Tastatur.": "Mikrofon burada kullanılamıyor. Klavyenin mikrofonunu kullan.",
  "Ich höre zu …": "Dinliyorum …",
  "Abhaken": "İşaretle",
  "fällig {d}": "son {d}",
  "Abgehakt: {x}": "İşaretlendi: {x}",
  "Routine angelegt: {x}": "Rutin eklendi: {x}",
  "Rückgängig": "Geri al",
  "Leg Aufgabe an Steuer muss bis Freitag fertig sein": "Görev ekle vergi cumaya kadar bitmeli",
  "Täglich um 21 Uhr Buch lesen": "Her gün saat 21'de kitap oku",
  "Termin morgen um 15 Uhr Zahnarzt": "Yarın saat 15'te diş doktoru randevusu",
  "Asr erledigt": "İkindiyi kıldım",
  "Datum wählen": "Tarih seç",
  "Uhrzeit wählen": "Saat seç",
  "Heute": "Bugün",
  "Morgen": "Yarın",
  "Übermorgen": "Öbür gün",
  "Nächste Woche": "Gelecek hafta",
  "Stunde": "Saat",
  "Minute": "Dakika",
  "Keine Uhrzeit": "Saat yok",
  "Neue Version verfügbar": "Yeni sürüm hazır",
  "Aktualisieren": "Güncelle",
  "Nach Tageszeit": "Vakte göre",
  "Nach Bereich": "Alana göre",
  "Morgens": "Sabah",
  "Mittags": "Öğlen",
  "Abends": "Akşam",
  "Ohne feste Uhrzeit": "Saati belli değil",
  "Routinen nach Tageszeit sortiert": "Rutinler vakte göre sıralandı",
  "Routinen nach Bereich sortiert": "Rutinler alana göre sıralandı",
  "Hilfe": "Yardım",
  "Darstellung": "Görünüm",
  "Automatisch": "Otomatik",
  "Hell": "Açık",
  "Dunkel": "Koyu",
  "Routine „{x}“ ganz löschen?": "„{x}“ rutini tamamen silinsin mi?",
  "Was kann ich sagen?": "Ne söyleyebilirim?",
  "Zeigt, was du sagen kannst": "Neler söyleyebileceğini gösterir",
  "Anzeigen": "Göster",
  "Verschieben": "Ertele",
  "Aktivieren": "Etkinleştir",
  "Pausieren": "Durdur",
  "Wieder offen: {x}": "Tekrar açık: {x}",
  "{x} löschen?": "{x} silinsin mi?",
  "Gelöscht: {x}": "Silindi: {x}",
  "Für Routinen bitte eine Uhrzeit sagen.": "Rutinler için lütfen bir saat söyle.",
  "Gebetszeiten kommen automatisch.": "Namaz vakitleri otomatik gelir.",
  "{x} jetzt um {t}": "{x} artık saat {t}",
  "Verschoben: {x}": "Ertelendi: {x}",
  "Aktiviert: {x}": "Etkinleştirildi: {x}",
  "Pausiert: {x}": "Durduruldu: {x}",
  "Wichtig: {x}": "Önemli: {x}",
  "Normal: {x}": "Normal: {x}",
  "{y} auf {x}": "{y}, {x} listesine eklendi",
  "Das verstehe ich": "Bunları anlıyorum",
  "Mo": "Pzt", "Di": "Sal", "Mi": "Çar", "Do": "Per", "Fr": "Cum", "Sa": "Cmt", "So": "Paz",
};

export function t(key, vars = {}) {
  let s = LANG === "tr" ? TR[key] ?? key : key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

// Feste Texte in index.html: data-i18n (Inhalt), data-i18n-ph (Platzhalter), data-i18n-aria (aria-label)
const orig = new WeakMap();
export function translateStatic() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (!orig.has(el)) orig.set(el, el.innerHTML.trim());
    el.innerHTML = t(orig.get(el));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.dataset.i18nPh ||= el.placeholder;
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.dataset.i18nAria ||= el.getAttribute("aria-label");
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
}
