package com.boncore.pos;

import android.annotation.SuppressLint;
import android.app.Activity;
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
import android.os.StrictMode;
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
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private static final String DEFAULT_SERVER_URL = "http://10.0.2.2:80";
    private static final int CURRENT_VERSION_CODE = 1;

    private WebView webView;
    private ProgressBar progressBar;
    private SharedPreferences prefs;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // StrictMode VM Policy to allow direct APK file intents
        StrictMode.VmPolicy.Builder vmBuilder = new StrictMode.VmPolicy.Builder();
        StrictMode.setVmPolicy(vmBuilder.build());

        // Keep screen awake for restaurant POS
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("boncore_pos_prefs", MODE_PRIVATE);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        setupWebView();

        String serverUrl = getServerUrl();
        webView.loadUrl(serverUrl);

        // Check for OTA updates
        checkForAppUpdates();
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                progressBar.setVisibility(View.GONE);
                showOfflineErrorDialog();
            }
        });

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
    }

    private String getServerUrl() {
        return prefs.getString("server_url", DEFAULT_SERVER_URL);
    }

    private void showServerSettingsDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("BonCore Sunucu Ayarı");
        builder.setMessage("Lütfen restoran ana bilgisayarının IP adresini giriniz:");

        final EditText input = new EditText(this);
        input.setText(getServerUrl());
        builder.setView(input);

        builder.setPositiveButton("Kaydet ve Yeniden Başlat", (dialog, which) -> {
            String newUrl = input.getText().toString().trim();
            if (!newUrl.startsWith("http://") && !newUrl.startsWith("https://")) {
                newUrl = "http://" + newUrl;
            }
            prefs.edit().putString("server_url", newUrl).apply();
            webView.loadUrl(newUrl);
        });

        builder.setNegativeButton("İptal", null);
        builder.show();
    }

    private void showOfflineErrorDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Bağlantı Hatası")
                .setMessage("BonCore POS sunucusuna ulaşılamadı. Lütfen Wi-Fi bağlantınızı veya sunucu IP adresini kontrol edin.")
                .setPositiveButton("Tekrar Dene", (dialog, which) -> webView.reload())
                .setNeutralButton("Sunucu IP Değiştir", (dialog, which) -> showServerSettingsDialog())
                .setCancelable(false)
                .show();
    }

    private void checkForAppUpdates() {
        new Thread(() -> {
            try {
                String serverUrl = getServerUrl();
                String apiUrl = serverUrl.replaceAll("/$", "") + "/api/app/version";

                URL url = new URL(apiUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setRequestMethod("GET");

                if (conn.getResponseCode() == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();

                    JSONObject json = new JSONObject(sb.toString());
                    int remoteVersionCode = json.optInt("version_code", 1);
                    String remoteVersionName = json.optString("version_name", "1.0.0");
                    String downloadUrl = json.optString("download_url", "/api/app/download");

                    if (remoteVersionCode > CURRENT_VERSION_CODE) {
                        runOnUiThread(() -> promptUpdateDialog(remoteVersionName, downloadUrl));
                    }
                }
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void promptUpdateDialog(String versionName, String downloadUrl) {
        new AlertDialog.Builder(this)
                .setTitle("Yeni Güncelleme Mevcut")
                .setMessage("BonCore POS v" + versionName + " sürümü yayınlandı. Şimdi güncellemek ister misiniz?")
                .setPositiveButton("Hemen Güncelle", (dialog, which) -> downloadAndInstallUpdate(downloadUrl))
                .setNegativeButton("Daha Sonra", null)
                .setCancelable(false)
                .show();
    }

    private void downloadAndInstallUpdate(String downloadUrl) {
        String fullUrl = downloadUrl.startsWith("http") ? downloadUrl : getServerUrl().replaceAll("/$", "") + downloadUrl;

        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(fullUrl));
        request.setTitle("BonCore POS Güncellemesi");
        request.setDescription("Yeni sürüm indiriliyor...");
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "boncore-pos-update.apk");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm != null) {
            dm.enqueue(request);
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
            Uri apkUri = Uri.fromFile(apkFile);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
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
