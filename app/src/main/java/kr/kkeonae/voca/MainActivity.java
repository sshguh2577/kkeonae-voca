package kr.kkeonae.voca;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** 앱 화면(assets/www)을 띄우고, 화면이 부탁하는 폰 기능(저장, 알림, 파일, 발음)을 처리한다. */
public class MainActivity extends Activity {
    private static final int REQ_EXPORT = 1001;
    private static final int REQ_IMPORT = 1002;
    private static final int REQ_NOTIF = 1003;
    private static final int MAX_IMPORT_BYTES = 30 * 1024 * 1024;

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile boolean ttsFailed = false;
    private String pendingExport = null;
    private volatile String pickedText = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Reminders.ensureChannel(this);

        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.desk));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        float scale = getResources().getConfiguration().fontScale;
        s.setTextZoom(Math.max(85, Math.min(130, Math.round(scale * 100))));
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                    // 열 수 있는 앱이 없으면 무시
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS && tts != null) {
                int r = tts.setLanguage(Locale.US);
                if (r >= TextToSpeech.LANG_AVAILABLE) {
                    tts.setSpeechRate(0.95f);
                    ttsReady = true;
                } else {
                    ttsFailed = true;
                }
            } else {
                ttsFailed = true;
            }
        });
        Reminders.scheduleAll(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        Reminders.scheduleAll(this);
        notifyJs("resume", "");
    }

    @Override
    protected void onPause() {
        notifyJs("pause", "");
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        if (web != null) {
            web.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.__handleBack && window.__handleBack()) ? '1' : '0'", value -> {
            if (value == null || !value.contains("1")) {
                finish();
            }
        });
    }

    /* ---------- 화면에 신호 보내기 ---------- */
    private void notifyJs(String event, String arg) {
        if (web == null) {
            return;
        }
        final String js = "window.__native && window.__native(" + JSONObject.quote(event) + "," + JSONObject.quote(arg == null ? "" : arg) + ")";
        web.post(() -> {
            if (web != null) {
                web.evaluateJavascript(js, null);
            }
        });
    }

    /* ---------- 파일 저장·공유·불러오기 ---------- */
    /** 확장자로 파일 종류를 정한다 (.csv = 학습 기록 표, 그 밖 = 백업·Day 파일). */
    static String mimeFor(String name) {
        return name != null && name.toLowerCase(java.util.Locale.ROOT).endsWith(".csv") ? "text/csv" : "application/json";
    }

    private void startExport(String text, String name) {
        pendingExport = text;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mimeFor(name));
        i.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(i, REQ_EXPORT);
        } catch (Exception e) {
            pendingExport = null;
            notifyJs("exported", "fail");
        }
    }

    private void startShare(String text, String name) {
        try {
            File dir = new File(getCacheDir(), "share");
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) {
                for (File f : old) {
                    f.delete();
                }
            }
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            File f = new File(dir, safe);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(safe));
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeFor(safe));
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, safe);
            send.setClipData(ClipData.newRawUri(safe, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, safe.endsWith(".csv") ? "학습 기록 보내기" : "백업 파일 보내기"));
            notifyJs("shared", "ok");
        } catch (Exception e) {
            notifyJs("shared", "fail");
        }
    }

    private void startPick() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        try {
            startActivityForResult(i, REQ_IMPORT);
        } catch (Exception e) {
            notifyJs("picked-fail", "");
        }
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null) {
                    return n;
                }
            }
        } catch (Exception ignored) {
            // 이름을 못 읽어도 내용은 읽는다
        }
        String last = uri.getLastPathSegment();
        return last == null ? "file" : last;
    }

    private void writeTo(Uri uri, String text) throws Exception {
        OutputStream os;
        try {
            os = getContentResolver().openOutputStream(uri, "wt");
        } catch (Exception e) {
            os = getContentResolver().openOutputStream(uri, "w");
        }
        if (os == null) {
            throw new Exception("no stream");
        }
        try (OutputStream out = os) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_EXPORT) {
            String text = pendingExport;
            pendingExport = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) {
                notifyJs("exported", "cancel");
                return;
            }
            try {
                writeTo(data.getData(), text);
                notifyJs("exported", "ok");
            } catch (Exception e) {
                notifyJs("exported", "fail");
            }
        } else if (requestCode == REQ_IMPORT) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                return;
            }
            Uri uri = data.getData();
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) {
                    throw new Exception("no stream");
                }
                pickedText = Storage.readText(in, MAX_IMPORT_BYTES);
                notifyJs("picked", displayName(uri));
            } catch (Exception e) {
                pickedText = null;
                notifyJs("picked-fail", "");
            }
        }
    }

    /* ---------- 알림 권한 ---------- */
    private boolean notificationsAllowed() {
        boolean granted = Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        NotificationManager nm = getSystemService(NotificationManager.class);
        return granted && nm != null && nm.areNotificationsEnabled();
    }

    private void openAppNotificationSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(i);
        } catch (Exception e) {
            openAppDetails();
        }
    }

    private void openAppDetails() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
        } catch (Exception ignored) {
            // 설정 화면이 없으면 무시
        }
    }

    private void requestNotif() {
        if (notificationsAllowed()) {
            notifyJs("notif-permission", "1");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            SharedPreferences sp = getSharedPreferences("app", MODE_PRIVATE);
            boolean askedBefore = sp.getBoolean("asked_notif", false);
            if (!askedBefore || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)) {
                sp.edit().putBoolean("asked_notif", true).apply();
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                return;
            }
        }
        openAppNotificationSettings();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIF) {
            Reminders.scheduleAll(this);
            notifyJs("notif-permission", notificationsAllowed() ? "1" : "0");
        }
    }

    /* ---------- 화면에서 부르는 기능 ---------- */
    public class Bridge {
        @JavascriptInterface
        public String loadData() {
            return Storage.read(MainActivity.this, "data.json");
        }

        @JavascriptInterface
        public boolean saveData(String json) {
            return Storage.saveData(MainActivity.this, json);
        }

        @JavascriptInterface
        public boolean saveSummary(String json) {
            boolean ok = Storage.write(MainActivity.this, "summary.json", json);
            Reminders.scheduleAll(MainActivity.this);
            return ok;
        }

        @JavascriptInterface
        public void saveRestorePoint(String json) {
            Storage.saveRestorePoint(MainActivity.this, json);
        }

        @JavascriptInterface
        public String listSnapshots() {
            return Storage.listSnapshots(MainActivity.this);
        }

        @JavascriptInterface
        public String loadSnapshot(String name) {
            return Storage.readSnapshot(MainActivity.this, name);
        }

        @JavascriptInterface
        public void exportFile(String text, String name) {
            runOnUiThread(() -> startExport(text, name));
        }

        @JavascriptInterface
        public void shareFile(String text, String name) {
            runOnUiThread(() -> startShare(text, name));
        }

        @JavascriptInterface
        public void pickFile() {
            runOnUiThread(MainActivity.this::startPick);
        }

        @JavascriptInterface
        public String takePickedText() {
            String t = pickedText;
            pickedText = null;
            return t == null ? "" : t;
        }

        @JavascriptInterface
        public void copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = getSystemService(ClipboardManager.class);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("꺼내보카", text));
                }
            });
        }

        /** 1 = 읽음, 0 = 아직 준비 중, -1 = 영어 음성이 없음 */
        @JavascriptInterface
        public int speak(String text) {
            TextToSpeech t = tts;
            if (t == null || ttsFailed) {
                return -1;
            }
            if (!ttsReady) {
                return 0;
            }
            t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kv");
            return 1;
        }

        @JavascriptInterface
        public String notificationStatus() {
            try {
                JSONObject o = new JSONObject();
                o.put("granted", notificationsAllowed());
                o.put("exact", Reminders.canExact(MainActivity.this));
                PowerManager pm = getSystemService(PowerManager.class);
                o.put("battery", pm != null && pm.isIgnoringBatteryOptimizations(getPackageName()));
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("maker", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::requestNotif);
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(MainActivity.this::openAppNotificationSettings);
        }

        @JavascriptInterface
        public void openExactAlarmSettings() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 31) {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
                        return;
                    } catch (Exception ignored) {
                        // 아래 앱 정보 화면으로
                    }
                }
                openAppDetails();
            });
        }

        @JavascriptInterface
        public void requestIgnoreBattery() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
                } catch (Exception e) {
                    try {
                        startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                    } catch (Exception ignored) {
                        openAppDetails();
                    }
                }
            });
        }

        @JavascriptInterface
        public void testNotification() {
            Reminders.showTest(MainActivity.this);
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "?";
            }
        }
    }
}
