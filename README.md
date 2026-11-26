# BonCore POS v2.0 — Multi-Tenant SaaS Restoran POS, KDS, Stok ve Yönetim Sistemi

**BonCore POS**, çoklu şube/işletme (**Multi-Tenant SaaS**) destekli, **Go Fiber** tabanlı yüksek performanslı backend API, **WebSocket** gerçek zamanlı senkronizasyon, **React 19 + TypeScript** dokunmatik arayüz, **Offline-First (IndexedDB / Dexie.js)** satış kuyruğu, **BOM reçete & depo stok yönetimi**, **E-Adisyon ön izleme / ESC-POS termal yazdırma** ve yerel **Donanım & Terazi Ajanı** bileşenlerinden oluşan uçtan uca restoran yönetim platformudur.

---

## Mimari & Teknoloji Yığını

| Katman | Teknoloji | Görevi |
|---|---|---|
| **Backend API** | Go (Fiber v2) + GORM | REST API (`/api`), sunucu yetkili fiyatlama, KDV/tahsilat, Z-Raporu, RBAC ve Multi-Tenant iş kuralları (`backend-go/cmd/server`) |
| **Veritabanı** | SQLite (WAL ACID) & PostgreSQL 16 (+ PgBouncer) | İzole kiracı veritabanları (`tenants/*.db` veya PostgreSQL) ve Master SaaS veritabanı (`master.db`) |
| **Gerçek Zamanlı** | WebSocket (`internal/ws`) + Redis Pub/Sub (opsiyonel) | Tekil bağlantı havuzu, kısa ömürlü bilet (`ws-ticket`) ile POS, KDS ve masa ekranlarının anlık güncellenmesi |
| **Frontend & PWA** | React 19 + TypeScript + Vite + Tailwind CSS | Dokunmatik POS, kroki/salon planı, Mutfak KDS, Kasa, Raporlar, SaaS Master Admin ve Eski Cihaz Legacy Bundle desteği |
| **Offline-First** | Service Worker (`public/sw.js`) + Dexie.js | Çevrimdışı sipariş/tahsilat kuyruğu, `X-Idempotency-Key` ile mükerrer işlem önleme |
| **Donanım Ajanı** | Python (`hardware_agent/`) | Yerel ESC/POS termal fiş yazıcıları, seri/Ethernet terazi (CAS vb.) ve ajan heartbeat köprüsü |

---

## Proje Dizin Yapısı

```text
BonCore/
├── backend-go/
│   ├── cmd/
│   │   ├── server/                     # Ana Go Fiber HTTP + WebSocket sunucusu
│   │   ├── migrate_master/             # Master veritabanı geçiş aracı
│   │   └── migrate_timestamps/         # Naive yerel zaman damgalarını .bak yedeğiyle UTC'ye çeviren CLI
│   ├── internal/
│   │   ├── api/                        # HTTP handler'lar, WebSocket handler ve integration testleri
│   │   │   └── middleware/             # JWT/Tenant auth, RBAC, rate limit ve idempotency middleware
│   │   ├── config/                     # Ortam değişkenleri ve gizli anahtar yönetimi
│   │   ├── models/                     # GORM varlıkları ve JSON DTO modelleri
│   │   ├── repository/                 # SQLite/PostgreSQL havuz yönetimi ve PBKDF2 PIN hash yardımcıları
│   │   ├── service/                    # KDV, Z-Raporu, BOM stok düşümü, zaman aralığı ve rol normalizasyonu
│   │   └── ws/                         # Redis + In-Memory WebSocket hub
│   ├── deploy/
│   │   ├── nginx/nginx.conf            # HTTPS, WebSocket upgrade, X-Idempotency-Key ve no-store PWA kuralları
│   │   └── caddy/Caddyfile             # HTTP/2-3 TLS ters vekil ve güvenlik başlıkları
│   ├── migrations/
│   │   └── 001_postgresql_schema_and_indexes.sql
│   └── docker-compose.yml              # Go backend + PostgreSQL + PgBouncer + Redis kurulumu
├── frontend/
│   ├── public/sw.js                    # PWA Service Worker (güvenli navigasyon fallback)
│   ├── src/
│   │   ├── components/                 # POS, Kasa, KDS, Masalar, Raporlar, Stok, Ayarlar, Master Admin
│   │   ├── services/                   # API istemcisi (401 oturum yönetimi), singleton WS, Dexie offlineDb, localHardware
│   │   └── utils/                      # CSV formül koruma, TR tarih/para biçimleyici, ESC/POS termal yazdırma
│   └── tests/                          # esbuild + node:test gerçek modül test paketi
├── hardware_agent/                     # Yerel yazıcı & terazi köprü ajanı (config.json, Kurulum.bat)
├── docker-compose.yml                  # Kök tam yığın Docker Compose tanımı
├── start_all.py                        # Go backend + React/Vite tek komut başlatıcısı
└── start.bat                           # Windows başlatıcı kısayolu
```

---

## Hızlı Başlangıç

### Tek Komutla Çalıştırma

```bash
# Windows / Linux / macOS
python start_all.py
```

Windows üzerinde doğrudan `start.bat` dosyasını da çalıştırabilirsiniz. Script `backend-go/boncore-pos-server.exe` yoksa derleyip Port `8000` üzerinde başlatır, ardından `frontend` uygulamasını derleyerek Port `80` üzerinde önizleme sunucusunu ayağa kaldırır.

### Geliştirme Ortamında Ayrı Çalıştırma

```bash
# 1. Go Backend (Port 8000)
cd backend-go
go run ./cmd/server

# 2. Frontend Geliştirme Sunucusu (Port 80; /api ve /ws -> 127.0.0.1:8000 proxy)
cd frontend
npm run dev
```

Üretim önizlemesi (`vite preview`) için:

```bash
cd frontend
npm run build
npm run preview
```

- **Web Arayüzü**: `http://localhost` (veya geliştirme portu `80`)
- **Backend Sağlık Kontrolü**: `http://127.0.0.1:8000/health`
- **WebSocket Kanalı**: `ws://127.0.0.1:8000/ws/all` (kısa ömürlü `/api/auth/ws-ticket` bileti ile)

---

## Güvenlik & Kimlik Doğrulama Politikası

- **Sabit Demo Şifreleri Kaldırıldı**: Üretim (`BONCORE_ENV=production`) ortamında sabit/varsayılan şifre veya PIN arkakapısı bulunmaz.
- **Zorunlu Üretim Anahtarları**: `BONCORE_ENV=production` iken `BONCORE_SECRET_KEY` ve `BONCORE_MASTER_PASSWORD` ortam değişkenleri tanımlı değilse sunucu güvenli biçimde başlamayı reddeder.
- **Geliştirme Modu Davranışı**: `BONCORE_ENV=development` (varsayılan) modunda `BONCORE_MASTER_PASSWORD` ayarlanmamışsa açılışta tek seferlik rastgele bir geçici Master Admin parolası üretilip konsol loguna yazılır; JWT imzalama anahtarı ise `.auth_secret` dosyasından okunur veya kriptografik olarak üretilip kaydedilir.
- **Personel PIN Güvenliği**: Personel PIN kodları düz metin olarak saklanmaz; `PBKDF2-SHA256` (`pin_hash`) ve `HMAC-SHA256` arama özeti (`pin_lookup_hash`) ile doğrulanır, mevcut düz metin satırlar veritabanı açılışında otomatik olarak hashlenir.
- **Çok Katmanlı Koruma**:
  - `X-Restaurant-Code` ve JWT token talepleri arasında kiracı izolasyonu doğrulanır.
  - RBAC yetki kontrolleri hem UI hem backend API seviyesinde (`HTTP 403`) uygulanır.
  - Kimlik doğrulama ve kritik uç noktalarda hız sınırlaması (rate limiting), WebSocket bağlantılarında bilet doğrulaması ve sipariş/tahsilat/Z-raporu işlemlerinde `X-Idempotency-Key` koruması bulunur.
  - CSV dışa aktarımları formül enjeksiyonuna karşı, fiş HTML çıktıları XSS'e karşı kaçış karakterleriyle temizlenir.

---

## Ortam Değişkenleri

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `BONCORE_ENV` | `development` | Çalışma ortamı (`development` veya `production`) |
| `BONCORE_SECRET_KEY` | `.auth_secret` | JWT ve PIN lookup HMAC anahtarı (`production` için zorunlu) |
| `BONCORE_MASTER_PASSWORD` | Rastgele dev parola | SaaS Master Admin giriş parolası (`production` için zorunlu) |
| `HOST` / `PORT` | `0.0.0.0` / `8000` | Go Fiber dinleme adresi ve portu |
| `SQLITE_DATA_DIR` | `../backend/data` | SQLite veritabanı ve yedek dizini |
| `DATABASE_URL` | `""` | Opsiyonel tenant PostgreSQL bağlantı dizesi |
| `MASTER_DATABASE_URL` | `""` | Opsiyonel Master SaaS PostgreSQL bağlantı dizesi |
| `PGBOUNCER_MODE` | `true` | PgBouncer uyumlu basit sorgu protokolü modu |
| `REDIS_URL` | `""` | Opsiyonel Redis Pub/Sub adresi (yoksa dahili bellek içi Hub kullanılır) |
| `BONCORE_ALLOW_DEMO_SEED` | `false` | Yalnızca geliştirme amaçlı örnek veri üretimine izin verir |
| `MANAGER_OVERRIDE_PIN` | `""` | İsteğe bağlı ortam tabanlı yönetici onay PIN'i |
| `VITE_API_TARGET` | `http://127.0.0.1:8000` | Frontend Vite dev/preview proxy hedef adresi |

---

## Temel Modüller & Finansal Bütünlük

- **Multi-Tenant SaaS Master Paneli**: Kiracı oluşturma, modül lisanslama, fatura/gecikme takibi (ödenmemiş vadesi geçmiş fatura kaldığı sürece salt-okunur kilit koruması), destek biletleri, franchise şube özeti ve menü klonlama, destek amaçlı scoped tenant impersonation.
- **RBAC Yetki Motoru**: Rol bazlı işlem yetkileri ve sekme görünürlük kuralları (`chef` / `şef` → `kitchen` normalizasyonu dahil).
- **Masa Planı & POS Terminali**: Dokunmatik kroki düzenleme (Pointer Events + sınır koruması), masa taşıma/birleştirme, tartılı (`Kg`/`gr`) satış, varyant ve ekstra malzeme seçimleri, süreli masa tarifesi ve izole canlı masa sayacı (`ElapsedTimer`).
- **Sunucu Yetkili Fiyatlama & Tahsilat**: Sipariş oluşturma ve kalem eklemede varyant/ekstra fiyatları sunucuda hesaplanır; parçalı ödeme, `1/n` bölme, nakit para üstü (`change_amount`), sıfır bakiyede kapanış ve bahşiş ayrıştırması desteklenir.
- **Vardiya Kilidi & Z-Raporu**: Kapalı vardiyaya ait adisyonlarda iptal, ikram, indirim ve ödeme/masraf silme işlemleri (`HTTP 409`) engellenir; Z-raporu ön ödemeli açık siparişleri korur ve yalnızca aktif kiracılarda otomatik Z-raporu zamanlayıcısı çalışır.
- **Stok, Reçete (BOM) & Depo**: Fire oranlı ve çoklu kalem kümülatif stok kontrolü, depolar arası transfer, alım faturası ile `WarehouseStock` senkronizasyonu.
- **E-Adisyon Ön İzleme & Termal Bilgi Fişi**: Resmi GİB UUID/onay kaydı bulunmayan belgelerde açıkça bilgi fişi uyarısı gösterilir; çok kopyalı termal yazdırma desteklenir ve fiziksel yazdırma başarılıysa tarayıcı penceresi tekrar açılmaz.
- **Denetim İzi (Audit Log) & Raporlar**: Sayfalanmış denetim logları (`limit`, `offset`, `X-Total-Count`), gün sonu mutabakatı, ürün satış ve maliyet/kârlılık raporları.

---

## Donanım Ajanı & Bakım Araçları

### Yerel Donanım & Terazi Ajanı (`hardware_agent/`)

- `hardware_agent/config.json` içinde varsayılan sunucu adresi `https://boncoreapp.me` şeklindedir; dağıtım öncesi `restaurant_code`, `agent_api_key` ve `terminal_id` alanları işletmeye özel doldurulmalıdır.
- Windows kurulumu için `hardware_agent/Kurulum.bat` kullanılabilir.

### SQLite Zaman Damgası UTC Migrasyonu (`cmd/migrate_timestamps`)

Eski yerel saat (`Europe/Istanbul`) formatındaki naive SQLite zaman damgalarını güvenli şekilde `.bak` yedeği alarak UTC'ye dönüştürmek için:

```bash
cd backend-go

# Önce değişiklikleri önizle (dry-run)
go run ./cmd/migrate_timestamps --dir ../backend/data --dry-run

# Onaylı uygulama (.bak yedeği otomatik oluşturulur)
go run ./cmd/migrate_timestamps --dir ../backend/data --apply
```

---

## Docker & Ters Vekil (Production) Kurulumu

### Kök Docker Compose

Kök `docker-compose.yml`, parolaları sabit kodlamak yerine zorunlu ortam değişkenlerini kullanır:

```bash
export POSTGRES_PASSWORD="guclu-postgres-parolasi"
export AUTH_SECRET_KEY="guclu-jwt-hmac-anahtari"
docker compose up -d --build
```

### Go + PgBouncer + PostgreSQL + Redis Yığını

Alternatif üretim profili için `backend-go/docker-compose.yml` kullanılabilir; PostgreSQL şema kurulumu için `backend-go/migrations/001_postgresql_schema_and_indexes.sql` mevcuttur. Ters vekil yapılandırmaları `backend-go/deploy/nginx/nginx.conf` (HTTPS, WebSocket Upgrade, `X-Idempotency-Key`, `/sw.js` ve `/index.html` için `no-store`) ve `backend-go/deploy/caddy/Caddyfile` dosyalarındadır.

---

## Test ve Doğrulama Komutları

Tüm backend ve frontend değişikliklerinden sonra çalıştırılabilecek doğrulama paketi:

```bash
# Backend statik kontrol ve tüm testler
cd backend-go
go vet ./...
go test -count=1 ./...

# Frontend TypeScript tip kontrolü, üretim derlemesi ve gerçek modül testleri
cd ../frontend
./node_modules/.bin/tsc --noEmit
npm run build
npm test
```
