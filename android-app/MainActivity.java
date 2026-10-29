package com.boncore.pos;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends AppCompatActivity {

    private static final String DEFAULT_SERVER_URL = "http://10.0.2.2:80"; // Emülatör veya Yerel Sunucu
    private static final int CURRENT_VERSION_CODE = 1;

    private WebView webView;
    private ProgressBar progressBar;
    private String serverUrl;
    private SharedPreferences prefs;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Ekranın kapanmasını engelle (WakeLock)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        prefs = getSharedPreferences("boncore_pos_prefs", MODE_PRIVATE);
        serverUrl = prefs.getString("server_url", DEFAULT_SERVER_URL);

        setupWebView();
        loadApp();
        checkForAppUpdates();
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        CookieManager.getInstance().setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }

        // Native JavaScript Arayüzü (Web ile Android iletişimi)
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidNative");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                showOfflineErrorDialog();
            }
        });
    }

    private void loadApp() {
        webView.loadUrl(serverUrl);
    }

    private void showOfflineErrorDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Bağlantı Hatası")
                .setMessage("BonCore POS sunucusuna bağlanılamadı (" + serverUrl + "). Lütfen Wi-Fi veya sunucu adresini kontrol edin.")
                .setPositiveButton("Yeniden Dene", (d, w) -> webView.reload())
                .setNeutralButton("Sunucu Adresi Değiştir", (d, w) -> showServerSettingsDialog())
                .setCancelable(false)
                .show();
    }

    private void showServerSettingsDialog() {
        android.widget.EditText input = new android.widget.EditText(this);
        input.setText(serverUrl);

        new AlertDialog.Builder(this)
                .setTitle("Sunucu IP / Web Adresi")
                .setView(input)
                .setPositiveButton("Kaydet & Bağlan", (d, w) -> {
                    String newUrl = input.getText().toString().trim();
                    if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                        newUrl = "http://" + newUrl;
                    }
                    serverUrl = newUrl;
                    prefs.edit().putString("server_url", newUrl).apply();
                    webView.loadUrl(serverUrl);
                })
                .setNegativeButton("İptal", null)
                .show();
    }

    // ==================== OTOMATİK GÜNCELLEME (IN-APP OTA UPDATER) ====================
    private void checkForAppUpdates() {
        new Thread(() -> {
            try {
                String apiUrl = serverUrl.replaceAll("/$", "") + ":8000/api/app/version";
                HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl).openConnection();
                conn.setConnectTimeout(5000);
                conn.setRequestMethod("GET");

                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) sb.append(line);

                    JSONObject json = new JSONObject(sb.toString());
                    int remoteVersion = json.optInt("version_code", 1);
                    String versionName = json.optString("version_name", "1.0.0");
                    String downloadUrl = json.optString("download_url", "/api/app/download");

                    if (remoteVersion > CURRENT_VERSION_CODE) {
                        runOnUiThread(() -> showUpdateAvailableDialog(versionName, downloadUrl));
                    }
                }
            } catch (Exception e) {
                // Güncelleme kontrolü sessizce başarısız olabilir (offline kullanım)
            }
        }).start();
    }

    private void showUpdateAvailableDialog(String newVersion, String downloadPath) {
        String fullDownloadUrl = serverUrl.replaceAll("/$", "") + ":8000" + downloadPath;
        new AlertDialog.Builder(this)
                .setTitle("🚀 Yeni Güncelleme Mevcut (" + newVersion + ")")
                .setMessage("BonCore POS için yeni bir uygulama güncellemesi bulundu. Hemen güncellemek istiyor musunuz?")
                .setPositiveButton("Şimdi Güncelle", (d, w) -> startApkDownload(fullDownloadUrl))
                .setNegativeButton("Daha Sonra", null)
                .show();
    }

    private void startApkDownload(String apkUrl) {
        Toast.makeText(this, "Güncelleme indiriliyor...", Toast.LENGTH_SHORT).show();
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
        request.setTitle("BonCore POS Güncellemesi");
        request.setDescription("Yeni sürüm indiriliyor...");
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "boncore-pos-update.apk");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

        DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (dm != null) {
            long downloadId = dm.enqueue(request);
            registerReceiver(new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    installDownloadedApk();
                    unregisterReceiver(this);
                }
            }, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        }
    }

    private void installDownloadedApk() {
        File apkFile = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "boncore-pos-update.apk");
        if (apkFile.exists()) {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".provider", apkFile);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            new AlertDialog.Builder(this)
                    .setTitle("Çıkış")
                    .setMessage("BonCore POS uygulamasından çıkmak istiyor musunuz?")
                    .setPositiveButton("Evet", (d, w) -> super.onBackPressed())
                    .setNegativeButton("Hayır", null)
                    .show();
        }
    }

    // ==================== WEB -> NATIVE KÖPRÜSÜ ====================
    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void vibrate(int milliseconds) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) {
                v.vibrate(milliseconds);
            }
        }

        @JavascriptInterface
        public void showToast(String message) {
            Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> showServerSettingsDialog());
        }
    }
}
