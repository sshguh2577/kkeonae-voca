package kr.kkeonae.voca;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** 폰 안(앱 전용 저장공간)에만 기록을 저장한다. */
final class Storage {
    private static final Object LOCK = new Object();
    private static final Pattern SNAP = Pattern.compile("^data-(\\d{8}|before-restore)\\.json$");
    private static final Pattern DATED = Pattern.compile("^data-\\d{8}\\.json$");
    private static final int KEEP_DAYS = 7;

    private Storage() {
    }

    static String readText(InputStream in, int maxBytes) throws IOException {
        return utf8(readBytes(in, maxBytes));
    }

    static byte[] readBytes(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        int total = 0;
        while ((n = in.read(buf)) != -1) {
            total += n;
            if (total > maxBytes) {
                throw new IOException("file too large");
            }
            bos.write(buf, 0, n);
        }
        return bos.toByteArray();
    }

    static String utf8(byte[] b) {
        return new String(b, StandardCharsets.UTF_8);
    }

    /**
     * 단어 파일이 아닌 것(사진·영상·PDF·문서)을 알아본다. 사진을 글자로 읽으면
     * 파일 안의 보이지 않는 정보(xmlns, hdrgm 같은 줄)가 단어처럼 들어가기 때문이다.
     * 단어 파일이면 null, 아니면 "image", "media", "pdf", "doc", "binary" 중 하나.
     */
    static String notWordFileKind(String mime, byte[] b) {
        if (mime != null) {
            String m = mime.toLowerCase(Locale.ROOT);
            if (m.startsWith("image/")) {
                return "image";
            }
            if (m.startsWith("video/") || m.startsWith("audio/")) {
                return "media";
            }
            if (m.equals("application/pdf")) {
                return "pdf";
            }
        }
        if (b == null || b.length == 0) {
            return null;
        }
        if (starts(b, 0xFF, 0xD8, 0xFF) || starts(b, 0x89, 'P', 'N', 'G') || starts(b, 'G', 'I', 'F', '8')
                || (starts(b, 'R', 'I', 'F', 'F') && b.length > 12 && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P')) {
            return "image";
        }
        if (b.length > 12 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p') {
            return "image"; // HEIC 사진, MP4 영상
        }
        if (starts(b, '%', 'P', 'D', 'F')) {
            return "pdf";
        }
        if (starts(b, 'P', 'K', 3, 4) || starts(b, 0xD0, 0xCF, 0x11, 0xE0)) {
            return "doc"; // 워드·엑셀·한글 문서, 압축 파일
        }
        int n = Math.min(b.length, 8192);
        for (int i = 0; i < n; i++) {
            if (b[i] == 0) {
                return "binary";
            }
        }
        return null;
    }

    private static boolean starts(byte[] b, int... sig) {
        if (b.length < sig.length) {
            return false;
        }
        for (int i = 0; i < sig.length; i++) {
            if ((b[i] & 0xFF) != (sig[i] & 0xFF)) {
                return false;
            }
        }
        return true;
    }

    static String readFile(File f) {
        if (!f.exists()) {
            return "";
        }
        try (FileInputStream in = new FileInputStream(f)) {
            return readText(in, 64 * 1024 * 1024);
        } catch (IOException e) {
            return "";
        }
    }

    /** 임시 파일에 먼저 쓰고 바꿔치기해서, 쓰는 도중 꺼져도 기존 기록이 남게 한다. */
    static boolean writeFile(File f, String text) {
        File dir = f.getParentFile();
        if (dir != null && !dir.exists()) {
            dir.mkdirs();
        }
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (IOException e) {
            tmp.delete();
            return false;
        }
        if (tmp.renameTo(f)) {
            return true;
        }
        f.delete();
        return tmp.renameTo(f);
    }

    static String read(Context c, String name) {
        synchronized (LOCK) {
            return readFile(new File(c.getFilesDir(), name));
        }
    }

    static boolean write(Context c, String name, String text) {
        synchronized (LOCK) {
            return writeFile(new File(c.getFilesDir(), name), text);
        }
    }

    /** 그날 처음 저장할 때, 저장 직전 기록을 자동 저장본으로 남긴다 (최근 7일). */
    static boolean saveData(Context c, String json) {
        synchronized (LOCK) {
            File data = new File(c.getFilesDir(), "data.json");
            File dir = new File(c.getFilesDir(), "snapshots");
            String day = new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date());
            File snap = new File(dir, "data-" + day + ".json");
            if (data.exists() && !snap.exists()) {
                String previous = readFile(data);
                if (!previous.isEmpty()) {
                    writeFile(snap, previous);
                    prune(dir);
                }
            }
            return writeFile(data, json);
        }
    }

    static void saveRestorePoint(Context c, String json) {
        synchronized (LOCK) {
            writeFile(new File(new File(c.getFilesDir(), "snapshots"), "data-before-restore.json"), json);
        }
    }

    private static void prune(File dir) {
        File[] files = dir.listFiles();
        if (files == null) {
            return;
        }
        List<File> dated = new ArrayList<>();
        for (File f : files) {
            if (DATED.matcher(f.getName()).matches()) {
                dated.add(f);
            }
        }
        Collections.sort(dated, (a, b) -> b.getName().compareTo(a.getName()));
        for (int i = KEEP_DAYS; i < dated.size(); i++) {
            dated.get(i).delete();
        }
    }

    static String listSnapshots(Context c) {
        JSONArray arr = new JSONArray();
        File[] files = new File(c.getFilesDir(), "snapshots").listFiles();
        if (files != null) {
            Arrays.sort(files, (a, b) -> b.getName().compareTo(a.getName()));
            for (File f : files) {
                if (!SNAP.matcher(f.getName()).matches()) {
                    continue;
                }
                try {
                    JSONObject o = new JSONObject();
                    o.put("name", f.getName());
                    o.put("size", f.length());
                    o.put("modified", f.lastModified());
                    arr.put(o);
                } catch (Exception ignored) {
                    // 목록에서 빼고 계속
                }
            }
        }
        return arr.toString();
    }

    static String readSnapshot(Context c, String name) {
        if (name == null || !SNAP.matcher(name).matches()) {
            return "";
        }
        synchronized (LOCK) {
            return readFile(new File(new File(c.getFilesDir(), "snapshots"), name));
        }
    }
}
