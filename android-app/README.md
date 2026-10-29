# BonCore POS - Android El Terminali & Tablet Uygulaması

Bu klasör, **BonCore Restoran POS & Yönetim Sistemi** için optimize edilmiş hibrit Android uygulamasının tam kaynak kodunu ve Gradle proje yapısını içerir.

---

## 🚀 Öne Çıkan Yetenekler

1. **Canlı Senkronizasyon:** Web POS arayüzünü donanım hızlandırmalı (Hardware Accelerated) yüksek performanslı WebView içerisinde çalıştırır. Web sitesinde yapılan her değişiklik (menü, masa, siparişler) anında el terminaline yansır.
2. **Otomatik OTA (Over-The-Air) Güncelleme:** Uygulama açılışında BonCore sunucusundaki `GET /api/app/version` adresini kontrol eder. Yeni bir sürüm yayınlandığında garsonu bilgilendirerek APK paketini otomatik indirir ve günceller.
3. **Ekran Açık Tutma (WakeLock):** Sipariş alırken veya masaları gezerken ekranın kilitlenmesini veya kararmasını engeller.
4. **Haptik Dokunmatik Geri Bildirim:** Ürün eklendiğinde veya tuşlara dokunulduğunda fiziksel titreşim motorunu tetikler (`window.AndroidNative.vibrate(25)`).
5. **Akıllı Ağ & Çevrimdışı Koruması:** Wi-Fi koptuğunda garsonu uyarır, ağ geldiğinde otomatik yeniden bağlanır ve sunucu IP değiştirme arayüzü sunar.

---

## 🛠️ Nasıl Derlenir? (APK Oluşturma)

### Seçenek 1: Android Studio ile Derleme
1. **Android Studio** programını açın.
2. `File` > `Open` seçeneği ile bu klasörü (`android-app`) seçin.
3. Gradle senkronizasyonunun tamamlanmasını bekleyin.
4. Üst menüden `Build` > `Build Bundle(s) / APK(s)` > `Build APK(s)` seçeneğine tıklayın.
5. Oluşan `app-release.apk` veya `app-debug.apk` dosyasını alın.

### Seçenek 2: Komut Satırından Derleme (Gradle)
```bash
cd android-app
./gradlew assembleRelease
# veya Debug için:
./gradlew assembleDebug
```
Üretilen APK konumu: `app/build/outputs/apk/release/app-release.apk`

---

## 📲 APK'yı Sisteme Yükleme ve Garsonlara Dağıtma

1. BonCore POS Yönetici Paneline giriş yapın.
2. **Tanımlamalar** > **Ayarlar** > **📱 Mobil Terminal & APK** sekmesine gidin.
3. "Yeni APK Yükleme & OTA Güncelleme Yayınlama" alanından derlediğiniz `.apk` dosyasını seçip sürüm numarasını girin.
4. **"Yeni Sürümü Sisteme Yükle & OTA Dağıt"** butonuna basın.
5. Tüm el terminalleri bir sonraki açılışta güncellemeyi otomatik olarak alacaktır!
