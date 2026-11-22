package kr.kkeonae.voca;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** 앱 화면(assets/www)을 띄우고, 화면이 부탁하는 폰 기능(저장, 알림, 파일, 발음)을 처리한다. */
public class MainActivity extends Activity {
    private static final int REQ_EXPORT = 1001;
    private static final int REQ_IMPORT = 1002;
    private static final int REQ_NOTIF = 1003;
    private static final int REQ_LOC = 1004;
    private static final int REQ_SPEECH = 1005;
    private static final int MAX_IMPORT_BYTES = 30 * 1024 * 1024;

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private volatile boolean ttsFailed = false;
    private String pendingExport = null;
    private volatile String pickedText = null;
    private volatile String launchAction = null; // 1.0.20 알림을 눌러 켠 경우 'brief' (화면이 takeLaunchAction으로 한 번 가져간다)

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Reminders.ensureChannel(this);
        launchAction = openActionOf(getIntent());

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
                    tts.setOnUtteranceProgressListener(new BriefSpeech());
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

    /** 앱이 켜져 있을 때 아침 영어 알림을 누르면 여기로 온다 (launchMode singleTask). */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String a = openActionOf(intent);
        if (a != null) {
            notifyJs("open", a);
        }
    }

    /** 알림에서 온 '열 화면'. 최근 앱 목록에서 다시 연 경우(같은 intent가 다시 옴)는 무시한다. */
    private static String openActionOf(Intent i) {
        if (i == null || (i.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            return null;
        }
        String a = i.getStringExtra("open");
        return "brief".equals(a) ? a : null;
    }

    /** 1.0.20 아침 영어를 문장마다 읽을 때, 문장이 끝났다고 화면에 알린다 (아이디가 b로 시작하는 것만). */
    private final class BriefSpeech extends UtteranceProgressListener {
        @Override
        public void onStart(String id) {
            if (id != null && id.startsWith("b")) notifyJs("tts", "start|" + id);
        }

        @Override
        public void onDone(String id) {
            if (id != null && id.startsWith("b")) notifyJs("tts", "done|" + id);
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onError(String id) {
            if (id != null && id.startsWith("b")) notifyJs("tts", "error|" + id);
        }

        @Override
        public void onError(String id, int code) {
            onError(id);
        }

        @Override
        public void onStop(String id, boolean interrupted) {
            if (id != null && id.startsWith("b")) notifyJs("tts", "stop|" + id);
        }
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

    /* ---------- 앱 업데이트: GitHub에 올라온 최신 빌드를 받아 설치 화면을 연다 ---------- */
    private static final String UPDATE_BASE = "https://raw.githubusercontent.com/sshguh2577/kkeonae-voca/ci-out/";
    private static final String UPDATE_FILE = "kkeonae-voca-update.apk";
    private volatile boolean updateBusy = false;

    @SuppressWarnings("deprecation")
    private int installedVersionCode() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private static HttpURLConnection openGet(String url, int readTimeoutMs) throws IOException {
        return openGet(url, readTimeoutMs, true);
    }

    /** bust = 캐시를 피하려고 주소 끝에 시각을 붙일지. 날씨처럼 이미 '?'가 있는 주소에는 붙이지 않는다. */
    private static HttpURLConnection openGet(String url, int readTimeoutMs, boolean bust) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(bust ? url + "?t=" + System.currentTimeMillis() : url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(readTimeoutMs);
        c.setRequestProperty("Cache-Control", "no-cache");
        c.setInstanceFollowRedirects(true);
        return c;
    }

    private static String httpText(String url) throws IOException {
        HttpURLConnection c = openGet(url, 15000);
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return new String(bo.toByteArray(), StandardCharsets.UTF_8).trim();
            }
        } finally {
            c.disconnect();
        }
    }

    /* ---------- 오늘의 지문: 깃허브에 올려 둔 지문 파일을 받아 화면 쪽에 넘긴다 ---------- */
    private static final String READS_URL = "https://raw.githubusercontent.com/sshguh2577/kkeonae-voca/reads/reads.json";
    private static final int READS_MAX_BYTES = 3 * 1024 * 1024; // 지문 파일은 글자뿐이라 작다. 이보다 크면 잘못된 것으로 본다
    private volatile boolean readsBusy = false;

    /** 글 파일을 받는다. 정해 둔 크기를 넘으면 그만둔다. */
    private static String httpTextMax(String url, int maxBytes) throws IOException {
        return httpTextMax(url, maxBytes, true);
    }

    private static String httpTextMax(String url, int maxBytes, boolean bust) throws IOException {
        HttpURLConnection c = openGet(url, 15000, bust);
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    bo.write(buf, 0, n);
                    if (bo.size() > maxBytes) throw new IOException("too large");
                }
                return new String(bo.toByteArray(), StandardCharsets.UTF_8).trim();
            }
        } finally {
            c.disconnect();
        }
    }

    /** 지문 파일을 받아 화면에 넘긴다. 성공하면 'reads'와 글, 실패하면 'reads-fail'. 화면 쪽(app.js)이 내용을 확인하고 넣는다. */
    private void fetchReadsAsync() {
        if (readsBusy) {
            return;
        }
        readsBusy = true;
        new Thread(() -> {
            try {
                String text = httpTextMax(READS_URL, READS_MAX_BYTES);
                notifyJs("reads", text);
            } catch (Exception e) {
                notifyJs("reads-fail", "");
            } finally {
                readsBusy = false;
            }
        }).start();
    }

    /* ---------- 1.0.20 아침 영어: 브리핑 파일, 날씨, 위치 ---------- */
    private static final String BRIEF_URL = "https://raw.githubusercontent.com/sshguh2577/kkeonae-voca/brief/brief.json";
    private static final int BRIEF_MAX_BYTES = 300 * 1024;
    private static final String WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=%.2f&longitude=%.2f"
            + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation"
            + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max"
            + "&timezone=auto&forecast_days=1";
    private volatile boolean briefBusy = false;
    private volatile boolean weatherBusy = false;

    /** 브리핑 파일을 받아 화면에 넘긴다. 성공하면 'brief'와 글, 실패하면 'brief-fail'. */
    private void fetchBriefAsync() {
        if (briefBusy) {
            return;
        }
        briefBusy = true;
        new Thread(() -> {
            try {
                notifyJs("brief", httpTextMax(BRIEF_URL, BRIEF_MAX_BYTES));
            } catch (Exception e) {
                notifyJs("brief-fail", "");
            } finally {
                briefBusy = false;
            }
        }).start();
    }

    private boolean locGranted() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private boolean locEnabled() {
        LocationManager lm = getSystemService(LocationManager.class);
        if (lm == null) return false;
        if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
        try {
            return lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) || lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Exception e) {
            return false;
        }
    }

    private void requestLoc() {
        if (locGranted()) {
            notifyJs("loc-permission", "1");
            return;
        }
        SharedPreferences sp = getSharedPreferences("app", MODE_PRIVATE);
        boolean askedBefore = sp.getBoolean("asked_loc", false);
        if (!askedBefore || shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            sp.edit().putBoolean("asked_loc", true).apply();
            requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOC);
            return;
        }
        // 두 번 거절하면 안드로이드가 더 묻지 않는다: 앱 정보 화면에서 직접 켜게 한다
        notifyJs("loc-permission", "settings");
        openAppDetails();
    }

    private interface LocCb {
        void got(Location l);
    }

    /** 위치를 한 번 잡는다(화면 스레드에서 부른다). 30분 안에 잡힌 위치가 있으면 그것, 없으면 새로 한 번(10초까지), 못 잡으면 예전 위치나 null. */
    @SuppressWarnings({"deprecation", "MissingPermission"})
    private void locateThen(LocCb cb) {
        LocationManager lm = getSystemService(LocationManager.class);
        if (lm == null) {
            cb.got(null);
            return;
        }
        Location best = null;
        List<String> provs = new ArrayList<>();
        try {
            provs = lm.getProviders(true);
        } catch (Exception ignored) {
            // 목록을 못 읽으면 아래에서 null
        }
        for (String p : provs) {
            try {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            } catch (Exception ignored) {
                // 권한이 없는 제공자(GPS 등)는 건너뛴다
            }
        }
        if (best != null && System.currentTimeMillis() - best.getTime() < 30 * 60000L) {
            cb.got(best);
            return;
        }
        String prov = provs.contains("fused") ? "fused" : provs.contains(LocationManager.NETWORK_PROVIDER) ? LocationManager.NETWORK_PROVIDER : null;
        if (prov == null) {
            cb.got(best);
            return;
        }
        final Location fallback = best;
        final boolean[] done = {false};
        final Handler h = new Handler(Looper.getMainLooper());
        final Runnable[] timeout = new Runnable[1];
        final LocCb once = l -> {
            if (done[0]) return;
            done[0] = true;
            h.removeCallbacks(timeout[0]);
            cb.got(l != null ? l : fallback);
        };
        timeout[0] = () -> once.got(null);
        h.postDelayed(timeout[0], 10000);
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                lm.getCurrentLocation(prov, null, getMainExecutor(), once::got);
            } else {
                lm.requestSingleUpdate(prov, new LocationListener() {
                    @Override
                    public void onLocationChanged(Location l) {
                        once.got(l);
                    }

                    @Override
                    public void onStatusChanged(String p, int status, Bundle extras) {
                    }

                    @Override
                    public void onProviderEnabled(String p) {
                    }

                    @Override
                    public void onProviderDisabled(String p) {
                    }
                }, Looper.getMainLooper());
            }
        } catch (Exception e) {
            once.got(null);
        }
    }

    private static String firstText(String... xs) {
        for (String x : xs) {
            if (x != null && !x.trim().isEmpty()) return x.trim();
        }
        return "";
    }

    /** 시·군 이름. 한국어는 '춘천시' → '춘천', '서울특별시' → '서울'. 영어는 'Chuncheon-si' → 'Chuncheon'. */
    static String cityName(String locality, String subAdmin, String admin, boolean ko) {
        String n = firstText(locality, subAdmin, admin);
        if (n.isEmpty()) return "";
        if (ko) {
            n = n.replaceAll("(특별시|광역시|특별자치시|특별자치도)$", "");
            if (n.length() >= 3 && n.endsWith("시")) n = n.substring(0, n.length() - 1);
        } else {
            n = n.replaceAll("(?i)-(si|gun|gu)$", "").replaceAll("(?i)\\s+(Metropolitan City|Special City|City)$", "");
        }
        return n.trim();
    }

    @SuppressWarnings("deprecation")
    private String[] placeNames(double lat, double lon) {
        String[] out = {"", ""};
        if (!Geocoder.isPresent()) return out;
        Locale[] locales = {Locale.KOREAN, Locale.US};
        for (int i = 0; i < 2; i++) {
            try {
                List<Address> a = new Geocoder(this, locales[i]).getFromLocation(lat, lon, 1);
                if (a != null && !a.isEmpty()) {
                    Address x = a.get(0);
                    out[i] = cityName(x.getLocality(), x.getSubAdminArea(), x.getAdminArea(), i == 0);
                }
            } catch (Exception ignored) {
                // 이름을 못 찾아도 날씨는 보여 준다
            }
        }
        return out;
    }

    /**
     * 날씨를 받는다. arg = {"useLoc":true, "lat", "lon", "ko", "en"}. lat·lon·ko·en은 마지막으로 위치를 잡은 곳이고, 잡은 적이 없으면 빠진다.
     * 결과는 window.__native('weather', {"ok":true, "src":"here|last|off|denied|nofix", "lat", "lon", "ko", "en", "data":{Open-Meteo 응답}}).
     * 앱에 정해 둔 도시는 없다: 위치를 못 쓰고 마지막 곳도 없으면 날씨를 받지 않고 {"ok":false, "src", "noplace":true}를 보낸다.
     */
    private void fetchWeatherAsync(String arg) {
        if (weatherBusy) return;
        weatherBusy = true;
        double flat = Double.NaN, flon = Double.NaN;
        String fko = "", fen = "";
        boolean useLoc = true;
        try {
            JSONObject a = new JSONObject(arg == null || arg.isEmpty() ? "{}" : arg);
            flat = a.optDouble("lat", Double.NaN);
            flon = a.optDouble("lon", Double.NaN);
            fko = a.optString("ko", "");
            fen = a.optString("en", "");
            useLoc = a.optBoolean("useLoc", true);
        } catch (Exception ignored) {
            // 마지막 곳 없이
        }
        final boolean hasLast = !Double.isNaN(flat) && !Double.isNaN(flon) && Math.abs(flat) <= 90 && Math.abs(flon) <= 180;
        final double lat0 = flat, lon0 = flon;
        final String ko0 = fko, en0 = fen;
        String why = !useLoc ? "last" : !locGranted() ? "denied" : !locEnabled() ? "off" : null;
        if (why != null) {
            if (hasLast) weatherFor(null, lat0, lon0, ko0, en0, why);
            else weatherNone(why);
            return;
        }
        runOnUiThread(() -> locateThen(l -> {
            if (l != null) weatherFor(l, lat0, lon0, ko0, en0, "here");
            else if (hasLast) weatherFor(null, lat0, lon0, ko0, en0, "nofix");
            else weatherNone("nofix");
        }));
    }

    /** 위치를 못 쓰고 마지막으로 잡은 곳도 없을 때: 날씨를 받지 않았다고 알린다 */
    private void weatherNone(String src) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", false);
            o.put("src", src);
            o.put("noplace", true);
        } catch (Exception ignored) {
            // 빈 결과
        }
        weatherBusy = false;
        notifyJs("weather", o.toString());
    }

    private void weatherFor(Location loc, double flat, double flon, String fko, String fen, String src) {
        new Thread(() -> {
            JSONObject o = new JSONObject();
            try {
                double lat = loc != null ? loc.getLatitude() : flat;
                double lon = loc != null ? loc.getLongitude() : flon;
                String ko = fko, en = fen;
                if (loc != null) {
                    String[] n = placeNames(lat, lon);
                    ko = n[0];
                    en = n[1];
                }
                String text = httpTextMax(String.format(Locale.US, WEATHER_URL, lat, lon), 200 * 1024, false);
                o.put("ok", true);
                o.put("src", src);
                o.put("lat", Math.round(lat * 100) / 100.0);
                o.put("lon", Math.round(lon * 100) / 100.0);
                o.put("ko", ko);
                o.put("en", en);
                o.put("data", new JSONObject(text));
            } catch (Exception e) {
                try {
                    o.put("ok", false);
                    o.put("src", src);
                } catch (Exception ignored) {
                    // 빈 결과
                }
            } finally {
                weatherBusy = false;
            }
            notifyJs("weather", o.toString());
        }).start();
    }

    /* ---------- 1.0.20 말로 답하기, Claude 앱으로 보내기 ---------- */
    private static final String CLAUDE_PKG = "com.anthropic.claude";

    private void startSpeechInput() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-US");
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "영어로 말해 주세요");
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(i, REQ_SPEECH);
        } catch (Exception e) {
            notifyJs("speech-fail", "none");
        }
    }

    private boolean hasClaudeApp() {
        try {
            getPackageManager().getPackageInfo(CLAUDE_PKG, 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 글을 다른 앱으로 보낸다. target이 claude면 Claude 앱으로 바로, 안 되면 보낼 곳 고르기 창. */
    private void shareTextTo(String text, String target) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        if ("claude".equals(target)) {
            try {
                Intent c = new Intent(send);
                c.setPackage(CLAUDE_PKG);
                startActivity(c);
                notifyJs("shared-text", "claude");
                return;
            } catch (Exception ignored) {
                // Claude 앱이 없거나 받지 못하면 고르기 창으로
            }
        }
        try {
            startActivity(Intent.createChooser(send, "보낼 곳 고르기"));
            notifyJs("shared-text", "chooser");
        } catch (Exception e) {
            notifyJs("shared-text", "fail");
        }
    }

    private void checkUpdateAsync() {
        new Thread(() -> {
            JSONObject o = new JSONObject();
            try {
                String status = httpText(UPDATE_BASE + "status.txt");
                int build = Integer.parseInt(httpText(UPDATE_BASE + "run.txt").replaceAll("[^0-9]", ""));
                o.put("ok", true);
                o.put("build", build);
                o.put("current", installedVersionCode());
                o.put("ready", "success".equals(status));
            } catch (Exception e) {
                try {
                    o.put("ok", false);
                } catch (Exception ignored) {
                }
            }
            notifyJs("update-info", o.toString());
        }).start();
    }

    @SuppressWarnings("deprecation")
    private void downloadUpdateAsync() {
        if (updateBusy) return;
        updateBusy = true;
        new Thread(() -> {
            File dir = new File(getCacheDir(), "share");
            File tmp = new File(dir, UPDATE_FILE + ".part");
            File out = new File(dir, UPDATE_FILE);
            HttpURLConnection c = null;
            try {
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("dir");
                c = openGet(UPDATE_BASE + "kkeonae-voca.apk", 30000);
                if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
                long total = c.getContentLengthLong();
                long done = 0;
                int lastPct = -1;
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        os.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                notifyJs("update-progress", String.valueOf(pct));
                            }
                        }
                    }
                }
                // 받은 파일이 정말 이 앱의 더 새 버전인지 확인한다 (서명은 설치할 때 안드로이드가 다시 확인)
                PackageInfo pi = getPackageManager().getPackageArchiveInfo(tmp.getAbsolutePath(), 0);
                if (pi == null || !getPackageName().equals(pi.packageName)) throw new IOException("bad apk");
                long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
                if (code <= installedVersionCode()) {
                    tmp.delete();
                    notifyJs("update-done", "same");
                    return;
                }
                if (out.exists()) out.delete();
                if (!tmp.renameTo(out)) throw new IOException("rename");
                runOnUiThread(this::installUpdate);
            } catch (Exception e) {
                tmp.delete();
                notifyJs("update-done", "fail");
            } finally {
                if (c != null) c.disconnect();
                updateBusy = false;
            }
        }).start();
    }

    private void installUpdate() {
        File f = new File(new File(getCacheDir(), "share"), UPDATE_FILE);
        if (!f.exists()) {
            notifyJs("update-done", "missing");
            return;
        }
        if (!getPackageManager().canRequestPackageInstalls()) {
            notifyJs("update-done", "permission");
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) {
            }
            return;
        }
        try {
            Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + UPDATE_FILE);
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, "application/vnd.android.package-archive");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            notifyJs("update-done", "installer");
        } catch (Exception e) {
            notifyJs("update-done", "fail");
        }
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
        String n = name == null ? "" : name.toLowerCase(java.util.Locale.ROOT);
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".apk")) return "application/vnd.android.package-archive";
        return "application/json";
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
        } else if (requestCode == REQ_SPEECH) {
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty() && r.get(0) != null && !r.get(0).trim().isEmpty()) {
                    notifyJs("speech", r.get(0).trim());
                    return;
                }
            }
            notifyJs("speech-fail", resultCode == RESULT_CANCELED ? "cancel" : "empty");
        } else if (requestCode == REQ_IMPORT) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                return;
            }
            Uri uri = data.getData();
            String mime = null;
            try {
                mime = getContentResolver().getType(uri);
            } catch (Exception ignored) {
                mime = null;
            }
            String early = Storage.notWordFileKind(mime, null);
            if (early != null) {
                pickedText = null;
                notifyJs("picked-fail", early);
                return;
            }
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) {
                    throw new Exception("no stream");
                }
                byte[] bytes = Storage.readBytes(in, MAX_IMPORT_BYTES);
                String kind = Storage.notWordFileKind(null, bytes);
                if (kind != null) {
                    pickedText = null;
                    notifyJs("picked-fail", kind);
                    return;
                }
                pickedText = Storage.utf8(bytes);
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
        } else if (requestCode == REQ_LOC) {
            notifyJs("loc-permission", locGranted() ? "1" : "0");
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

        /** 1.0.20 아침 영어: 문장 하나를 정한 빠르기로 읽는다. 끝나면 window.__native('tts', 'done|아이디'). 1 = 읽음, 0 = 준비 중, -1 = 음성 없음 */
        @JavascriptInterface
        public int speakLine(String text, String id, float rate) {
            TextToSpeech t = tts;
            if (t == null || ttsFailed) {
                return -1;
            }
            if (!ttsReady) {
                return 0;
            }
            t.setSpeechRate(rate >= 0.5f && rate <= 1.6f ? rate : 0.95f);
            int r = t.speak(text, TextToSpeech.QUEUE_FLUSH, null, id == null || id.isEmpty() ? "b" : id);
            t.setSpeechRate(0.95f); // 단어 읽기는 처음 빠르기 그대로
            return r == TextToSpeech.SUCCESS ? 1 : -1;
        }

        @JavascriptInterface
        public void stopSpeak() {
            TextToSpeech t = tts;
            if (t != null) {
                t.stop();
            }
        }

        @JavascriptInterface
        public void fetchBrief() {
            fetchBriefAsync();
        }

        @JavascriptInterface
        public void fetchWeather(String arg) {
            fetchWeatherAsync(arg);
        }

        /** {"granted": 위치 권한, "enabled": 폰 위치 켜짐} */
        @JavascriptInterface
        public String locationStatus() {
            try {
                JSONObject o = new JSONObject();
                o.put("granted", locGranted());
                o.put("enabled", locEnabled());
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void requestLocation() {
            runOnUiThread(MainActivity.this::requestLoc);
        }

        @JavascriptInterface
        public void openLocationSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
                } catch (Exception e) {
                    openAppDetails();
                }
            });
        }

        @JavascriptInterface
        public void startSpeech() {
            runOnUiThread(MainActivity.this::startSpeechInput);
        }

        @JavascriptInterface
        public boolean hasClaude() {
            return hasClaudeApp();
        }

        @JavascriptInterface
        public void shareText(String text, String target) {
            runOnUiThread(() -> shareTextTo(text, target));
        }

        /** 알림을 눌러 켰으면 'brief'를 한 번만 돌려준다. */
        @JavascriptInterface
        public String takeLaunchAction() {
            String a = launchAction;
            launchAction = null;
            return a == null ? "" : a;
        }

        @JavascriptInterface
        public void testBriefNotification() {
            Reminders.showBrief(MainActivity.this, true);
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
        public int versionCode() {
            return installedVersionCode();
        }

        @JavascriptInterface
        public void checkUpdate() {
            checkUpdateAsync();
        }

        @JavascriptInterface
        public void downloadUpdate() {
            downloadUpdateAsync();
        }

        /** 깃허브에 올려 둔 지문 파일을 받는다. 결과는 window.__native('reads', 글) 또는 ('reads-fail', '')로 간다. */
        @JavascriptInterface
        public void fetchReads() {
            fetchReadsAsync();
        }

        @JavascriptInterface
        public void installUpdate() {
            runOnUiThread(MainActivity.this::installUpdate);
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
