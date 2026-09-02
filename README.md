# 🍽️ BonCore - Simpra & Adisyo Seviyesinde Web Tabanlı Restoran POS & Yönetim Sistemi

> **Yeni Nesil, Offline-First Destekli, 0.1s Gecikmeli WebSocket Tabanlı, Dokunmatik Restoran POS, Mutfak Ekranı (KDS), Stok/Reçete ve GİB E-Adisyon Sistemi**

---

## 🚀 Hızlı Başlangıç (Tek Komutla Çalıştırma)

Sistemi tek bir komutla ayağa kaldırmak için:

```bash
# Windows / Linux / macOS
python start_all.py
```
veya Windows üzerinde:
```cmd
start.bat
```

- **POS Web Arayüzü**: [http://localhost](http://localhost) (Port 80)
- **FastAPI Backend & Swagger API**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **WebSocket Gerçek Zamanlı Kanal**: `ws://localhost:8000/ws/all`

---

## 🔑 Hızlı PIN Oturum Kodları

| PIN | Personel Adı | Rol & Yetki |
|---|---|---|
| **1111** | Ahmet Garson | Sipariş Alma, Masa Taşıma, Kuver Güncelleme |
| **2222** | Ayşe Kasiyer | Parçalı Tahsilat, Split Bill, Masraf Girişi, X-Raporu |
| **3333** | Mehmet Şef | Mutfak KDS, Hazırlama Aşamaları, Sipariş Tamamlama |
| **9999** | Kemal Müdür | İptal/İkram Onayı, Z-Raporu Kapatma, Stok Transferi, Yetkili Override |

---

## 🏗️ Mimari Katmanlar & Teknoloji Yığını

| Katman | Teknoloji | Fonksiyonel Karşılığı |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Tailwind CSS | Dokunmatik ergonomi, sepet durumu (state) sıfır gecikmeli yönetim. |
| **Offline-First** | PWA + IndexedDB (Dexie.js) | İnternet koptuğunda kesintisiz satış, bağlantı gelince otomatik senkron. |
| **Backend & API** | Python 3.12 (FastAPI) + WebSockets | Asenkron yüksek performans, KDS ve kasalara **0.1 saniyede** anlık emir yayını. |
| **ORM & Şema** | SQLAlchemy 2.0 (Async) + Pydantic v2 | Şema bozulmalarını ve veri tutarsızlıklarını önleyen katı ORM yapısı. |
| **Veritabanı** | PostgreSQL / Async SQLite | Finansal işlemlerde tam ACID ve transaction güvenliği. |
| **Önbellek (Cache)** | Redis & In-Memory Fallback | Canlı masa renkleri ve garson çağrılarını RAM'de tutarak sıfır gecikme sağlama. |
| **Altyapı & Konteyner** | Docker, Docker Compose, Cloudflare Tunnels | Tek tıkla konteynerize dağıtım ve portsuz dış dünyaya açılış. |

---

## 📦 Temel Modüller & Özellik Matrisi

### 1. 🪑 Masa & Alan Yönetimi (Dynamic Floor Map)
- **Dinamik Kroki Editörü**: Masaları sürükle-bırak ile konumlandırma ve boyutlandırma.
- **Canlı Durum Renkleri**: 🟢 Boş, 🔴 Dolu, 🔵 Hesap İstendi, 🟡 Rezerve, 🟣 Garson Çağrısı.
- **Masa Hareketleri**: Masa Taşıma (Transfer), Masa Birleştirme (Merge), Tekil/Çoklu Ürün Aktarımı.
- **Servis Parametreleri**: Otomatik kişi başı kuver hesabı ve masada oturma süresi sayacı.

### 2. 🛒 Dokunmatik POS Terminali
- **Hızlı Ürün Girişi**: Kategori sekmeleri, arama ve #PLU / Barkod kodu ile ürün ekleme.
- **Varyant & Modifikatörler**: Porsiyon (Küçük/Orta/Büyük), Pişme Derecesi, Ekstra Malzemeler.
- **Eksi Malzemeler**: "Soğansız", "Buzsuz", "Glutensiz" etiketleri ve serbest mutfak notu.
- **Hold / Fire (Kurs Yönetimi)**: 1. ve 2. kurs aşamalandırması; mutfağa bekletmeli iletme ve tek tuşla ateşleme.

### 3. 💳 Ödeme, Hesap Bölme & Kasa
- **Parçalı / Miks Tahsilat**: Nakit + Kredi Kartı + Sodexo + Multinet + Ticket kombinasyonu.
- **Split Bill (Hesap Bölme)**: Alman usulü eşit bölme ve seçilen ürün kalemlerine göre bölme.
- **İndirim & İkram**: Yüzdesel/tutarsal indirim, müdür onaylı yetkili ikramı, kuruş yuvarlama motoru.
- **Kasa İşlemleri**: Gün başı avansı, gün içi masraf/gider girişi, X-Raporu ve Gün Sonu Z-Raporu.

### 4. 👨‍🍳 Mutfak KDS & ESC/POS Yazıcı Ağı
- **KDS (Kitchen Display System)**: İstasyon filtreleri (Mutfak, Bar, Pastane), bekleme süresi renk uyarıları (🟢 0-8dk, 🟡 8-15dk, 🔴 >15dk), sesli zil (Ding-Dong) çanı.
- **ESC/POS Yönlendirme**: İçecekleri Bar'a, yemekleri Mutfak'a ayıran 80mm termal fiş simülatörü.

### 5. 📦 Stok, Reçete (BOM) & Çoklu Depo
- **Çok Kademeli Reçete**: Satış anında hammadde ve sos gramajlarının otomatik düşümü.
- **Fire Oranı Hesabı**: Pişme ve ayıklama firesi (%15 fireli et vb.).
- **Depo Yönetimi**: Ana Depo, Mutfak Deposu, Bar Deposu arası transfer, kritik stok alarmı ve tedarikçi irsaliye girişi.

### 6. 🛵 Paket Servis & Platform Entegratörü
- **Caller ID Simülatörü**: Gelen aramada müşteri adı, kayıtlı adresleri ve geçmiş siparişleri tanıma.
- **Kurye Yönetimi**: Kurye zimmetleme, teslimat durumu ve gün sonu kurye kasa mutabakatı.
- **Online Platformlar**: Yemeksepeti, Getir Yemek, Trendyol Yemek canlı sipariş akışı ve otomatik onay.

### 7. 📱 QR Menü & Masadan Sipariş
- **Masa QR Kod Kartı**: Masaya özel QR üretimi ve yazdırma.
- **Müşteri Telefon Simülatörü**: Mobil dijital menü, alerjen/kalori filtreleri, masadan doğrudan sipariş, Sanal POS (3D Secure) ile ödeme ve "Garson Çağır" / "Hesap İste" zilleri.

### 8. 🏛️ Mevzuat, GİB E-Adisyon & Denetim Logları
- **GİB E-Adisyon**: ETTN (UUID), resmi QR kod, KDV dökümü, XML indirme ve termal fiş yazdırma.
- **Denetim Logu (Audit Trail)**: Ürün iptalleri (zorunlu gerekçe kodu ile), ikramlar, indirimler ve kasa hareketlerinin zaman damgalı değiştirilemez dökümü.

---

## 🐳 Docker ile Çalıştırma

```bash
docker-compose up --build
```
PostgreSQL, Redis, FastAPI backend ve React frontend otomatik olarak ayağa kalkar.
