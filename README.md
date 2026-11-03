# 🍽️ BonCore POS v2.0 — Çok Şubeli (Multi-Tenant SaaS) Web & Mobil Restoran POS, KDS, Stok ve Yönetim Sistemi

> **Yeni Nesil, Multi-Tenant SaaS Mimarili, Offline-First Destekli, 0.1s Gecikmeli WebSocket Tabanlı, Dokunmatik Restoran POS, Mutfak Ekranı (KDS), Rol & Sekme Yetkilendirme Motoru, Stok/Reçete (BOM) ve GİB E-Adisyon Sistemi**

---

## 🚀 Hızlı Başlangıç

Sistemi tek bir komutla ayağa kaldırmak için:

```bash
# Windows / Linux / macOS
python start_all.py
```
veya Windows üzerinde:
```cmd
start.bat
```

Geliştirme ortamında ayrı ayrı çalıştırmak için:
```bash
# Backend (FastAPI - Port 8000)
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload

# Frontend (React + Vite - Port 5173 / 80)
npm --prefix frontend run dev
```

- **POS Web & SaaS Arayüzü**: [http://localhost:5173](http://localhost:5173) (veya Prod Port 80)
- **FastAPI Backend & Swagger API**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **WebSocket Gerçek Zamanlı Kanal**: `ws://localhost:8000/ws/pos` & `ws://localhost:8000/ws/kds`

---

## 🔑 Varsayılan Giriş Bilgileri & Hızlı PIN Kodları

### 1. İşletme & SaaS Paneli Girişi
| Giriş Türü | Kullanıcı Adı | Şifre | Açıklama |
|---|---|---|---|
| **Restoran Yönetici Girişi** | `admin` | `123456` | Restoran tam yetkili müdür / yönetici hesabı |
| **SaaS Master Admin Paneli** | `superadmin` | `boncore2026` | Tüm restoranları (tenant), lisansları ve kullanıcı adlarını yöneten süper yönetici paneli |

### 2. POS Hızlı Personel PIN Kodları
| PIN | Personel Adı | Rol | Varsayılan Yetki Kapsamı |
|---|---|---|---|
| **1111** | Ahmet Garson | `waiter` (Garson) | Sipariş Alma, Masa Taşıma/Birleştirme, Ürün Aktarma, Öde / Hızlı Öde (Yetkiye Bağlı) |
| **2222** | Ayşe Kasiyer | `cashier` (Kasa) | Parçalı Tahsilat, Split Bill, İndirim/İkram, Masraf Girişi, Gün Sonu (Z) |
| **3333** | Mehmet Şef | `kitchen` (Mutfak) | Mutfak KDS, Hazırlama Aşamaları, Reçete & Stok Görüntüleme |
| **9999** | Kemal Müdür | `manager` (Yönetici) | Tüm İşlem Yetkileri, Sekme Görünürlük Yönetimi, İptal/İkram Override, Genel Ayarlar |

---

## 🏗️ Mimari Katmanlar & Teknoloji Yığını

| Katman | Teknoloji | Fonksiyonel Karşılığı |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Tailwind CSS | Dokunmatik POS ergonomisi, masaüstü ve mobil duyarlı (responsive) arayüz. |
| **Multi-Tenant SaaS** | İzole Tenant DB + `X-Restaurant-Code` | Her restoran/şube için bağımsız SQLite/PostgreSQL veritabanı ve SaaS Master yönetim paneli. |
| **Yetki Motoru (RBAC)** | Reaktif Rol & Sekme Yetkilendirme | **38 İşlem Yetkisi** + **25 Sekme Görünürlük Kuralı** (UI + Backend `HTTP 403` korumalı). |
| **Offline-First** | PWA + IndexedDB (Dexie.js) | İnternet koptuğunda kesintisiz satış, bağlantı geldiğinde otomatik senkronizasyon. |
| **Backend & API** | Python 3.12 (FastAPI) + WebSockets | Asenkron yüksek performans, KDS, masa planı ve kasalara **0.1 saniyede** anlık yayın. |
| **ORM & Şema** | SQLAlchemy 2.0 (Async) + Pydantic v2 | Otomatik şema migrasyonu ve veri bütünlüğü sağlayan katı ORM katmanı. |
| **Mobil Uygulama** | Capacitor / Android POS APK | Doğrudan yan menüden indirilebilir kurumsal Android POS APK desteği. |

---

## 📦 Temel Modüller & Özellik Matrisi

### 1. 🏢 SaaS Master Admin Paneli (Çoklu Restoran Yönetimi)
- **Restoran (Tenant) Yönetimi**: Yeni restoran açma, paket/lisans tanımlama, restoran başlığı (`name`) ve yönetici kullanıcı adını (`owner_username`) anlık değiştirme.
- **İzole Veri Mimarisi**: Her restoranın masaları, ürünleri, adisyonları, personelleri ve ayarları kendi veritabanında izole tutulur.
- **Canlı Senkronizasyon**: SaaS panelinden yapılan restoran adı veya kullanıcı adı değişiklikleri tüm açık POS terminallerindeki üst bara ve yan menüye anında yansır.

### 2. 🛡️ Gelişmiş Rol & Sekme Yetkilendirme Sistemi (`RightsManagement`)
- **Sadece Yöneticiye Özel Yetki Ekranı**: *Yetki / İzin Ekranı* yalnızca **Müdür (`manager`)** rolünde gözükür ve sadece yönetici tarafından değiştirilebilir (`HTTP 403` Backend korumalı).
- **İşlem Yetkileri Sekmesi (38 Yetki)**:
  - Garson ve diğer rollerin **Genel Sipariş Alma**, **Öde (`ÖDE`)**, **Hızlı Öde (`HIZLI ÖDE`)**, **Sipariş / Ürün İptali**, **İndirim (Genel / Kalem / Sadece Ön Tanımlı)**, **İkram (Kalem / Tüm Adisyon)**, **Masa Taşıma & Birleştirme**, **Ürün Aktarma**, **Açık Hesaba Aktarma** ve **Bahşiş Ekleme** yetkilerini anlık açıp kapatma.
- **Sekmeler Bölümü (25 Menü & Ekran Görünürlüğü)**:
  - Garson, Mutfak, Kurye, Kasa ve Çağrı Merkezi rollerinin sol menüde ve alt barda hangi sekmeleri (*Ana Sayfa, Masalar, Mutfak KDS, Paket Servis, Kasa, Tanımlamalar, Stok, Raporlar, Uygulama Mağazası vb.*) görebileceğini tek tek belirleme.
- **Çift Katmanlı Güvenlik**: Yetkisi kapatılan bir işlem hem arayüzde gizlenir hem de API seviyesinde (`X-User-Role` doğrulaması ile) engellenir.

### 3. 🪑 Masa & Bölge Yönetimi (Salon Planı & Açık Siparişler)
- **Bölge ve Masa Sıralama**: *Tanımlamalar -> Masa / Bölgeler* ekranından hem bölgelerin hem de masaların sırasını sürükle-bırak veya ok butonlarıyla kalıcı olarak değiştirme.
- **Sabitlenmiş Sipariş Ekranı**: Sipariş ekranında masalar yanlışlıkla kaydırılamaz; masa konumları yalnızca tanımlama ekranından yönetilir.
- **Masalar & Siparişler Görünümü**:
  - Özellikle mobil ve tablet arayüzde **Masalar** sekmesinin yanında yer alan **Siparişler** sekmesi ile açık olan tüm masaları açılış süresine göre alt alta listeleme, geçen süreyi (`dk/saat`), garson adını ve adisyon tutarını canlı takip etme.
- **Masa İşlemleri**: Masa Taşıma, Masa Birleştirme ve Kalem Bazlı Ürün Aktarımı.

### 4. 🛒 Dokunmatik POS Terminali & Terazili (Kg/gr) Satış
- **Hızlı Ürün Girişi**: Kategori filtreleme, A-Z / Z-A sıralama, anlık arama ve ürün kartı üzerinden `+ / -` miktar kontrolü.
- **Kg / Gramajlı Ürün Desteği**: Kasap, şarküteri ve balık restoranları için `Kg` veya `Gram` cinsinden hassas tartım girişi, hazır gramaj butonları (`250 gr`, `500 gr`, `1 Kg`, `1.5 Kg`) ve otomatik fiyat hesaplama.
- **Varyant & Modifikatörler**: Porsiyon seçimi, pişme derecesi, ekstra malzemeler, eksi malzemeler ve mutfak notu.
- **Reçete (BOM) Stok Koruması**: Reçetesindeki hammaddesi biten ürünlerin satışını otomatik engelleyen ve eksik malzemeyi bildiren akıllı stok kilidi.

### 5. 💳 Tahsilat, Parçalı Ödeme & Kasa Yönetimi
- **Hızlı Öde & Gelişmiş Tahsilat**: POS ekranından tek tıkla Nakit / Kredi Kartı ile **Hızlı Öde** veya detaylı tahsilat ekranı (**Öde**).
- **Parçalı Öde & 1/n Hesap Bölme**: Adisyondaki ürünleri seçerek kalem bazlı ödeme alma, Alman usulü `1/n` kişi başı bölme ve ara tahsilat geçmişi (tahsilat iptali destekli).
- **Eksik Tutar Koruması**: Kalan bakiye sıfırlanmadan masanın yanlışlıkla kapatılmasını önleyen finansal koruma.
- **Kasa & Gün Sonu (Z)**: Kasa açılış avansı, gün içi gelir/gider ve masraf kayıtları, X-Raporu ve Gün Sonu Z-Raporu.

### 6. 👨‍🍳 Mutfak KDS & İstasyon Yönetimi
- **Özelleştirilebilir Mutfak Grupları**: *Mutfak, Izgara, Bar, Tatlı* gibi istasyonları tanımlama, hedef hazırlama süresi ve yazıcı eşleştirme.
- **Gerçek Zamanlı KDS**: Yeni sipariş geldiğinde veya ürün iptal edildiğinde sesli/görsel bildirim, kalem bazlı veya tüm fişi "Hazır" işaretleme.

### 7. 📊 Raporlar, GİB E-Adisyon & Denetim İzi (Audit Log)
- **Canlı Raporlama**: Restaurant İstatistikleri, Kapatılan Adisyonlar (geri açma ve ödeme tipi değiştirme destekli), Ürün Satış Raporu ve Maliyet & Kar Sihirbazı.
- **GİB E-Adisyon & Denetim İzi**: Resmi formatta E-Adisyon fişi, iptal/ikram/indirim ve masa taşıma işlemlerinin operatör ve zaman damgalı denetim kayıtları.

---

## 🐳 Docker ile Çalıştırma

```bash
docker-compose up --build
```
PostgreSQL, Redis, FastAPI backend ve React frontend otomatik olarak ayağa kalkar.
