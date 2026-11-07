package kr.kkeonae.voca;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Iterator;
import java.util.Locale;

/**
 * 하루 두 번(공부 알림, 출석 마감 알림) 알람을 예약하고 알림을 띄운다.
 * 알림 내용은 앱이 저장해 둔 summary.json을 읽어서 만든다. 서버는 쓰지 않는다.
 */
final class Reminders {
    static final String CHANNEL = "study";
    private static final long HOUR = 3600000L;
    private static final long DAY = 86400000L;

    private Reminders() {
    }

    static void ensureChannel(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) {
            return;
        }
        NotificationChannel ch = new NotificationChannel(CHANNEL, "공부 알림", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("오늘 할 카드와 출석 마감을 알려 줘요");
        nm.createNotificationChannel(ch);
    }

    static JSONObject summary(Context c) {
        String s = Storage.read(c, "summary.json");
        try {
            return new JSONObject(s.isEmpty() ? "{}" : s);
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void scheduleAll(Context c) {
        JSONObject s = summary(c);
        schedule(c, 1, s.optJSONObject("n1"));
        schedule(c, 2, s.optJSONObject("n2"));
    }

    private static PendingIntent alarmIntent(Context c, int slot) {
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setAction("kr.kkeonae.voca.REMIND_" + slot);
        i.putExtra("slot", slot);
        return PendingIntent.getBroadcast(c, slot, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) {
            return true;
        }
        AlarmManager am = c.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    static void schedule(Context c, int slot, JSONObject cfg) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) {
            return;
        }
        PendingIntent p = alarmIntent(c, slot);
        am.cancel(p);
        if (cfg == null || !cfg.optBoolean("on", false)) {
            return;
        }
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, cfg.optInt("h", slot == 1 ? 21 : 23));
        cal.set(Calendar.MINUTE, cfg.optInt("m", 0));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 5000) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }
        long at = cal.getTimeInMillis();
        try {
            if (canExact(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p);
        }
    }

    static void fire(Context c, int slot) {
        JSONObject s = summary(c);
        try {
            show(c, slot, s, false);
        } finally {
            schedule(c, slot, s.optJSONObject(slot == 1 ? "n1" : "n2"));
        }
    }

    static void showTest(Context c) {
        show(c, 1, summary(c), true);
    }

    static String dayKey(long t, int dsh) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(t - dsh * HOUR);
        return String.format(Locale.US, "%04d-%02d-%02d",
                cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    private static long nextDayStart(long now, int dsh) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now - dsh * HOUR);
        cal.set(Calendar.HOUR_OF_DAY, dsh);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        cal.add(Calendar.DAY_OF_YEAR, 1);
        return cal.getTimeInMillis();
    }

    private static boolean contains(JSONArray a, String v) {
        if (a == null) {
            return false;
        }
        for (int i = 0; i < a.length(); i++) {
            if (v.equals(a.optString(i))) {
                return true;
            }
        }
        return false;
    }

    /** 오늘(새벽 기준 시각 적용)의 요일이 쉬는 요일인지. 0 = 일요일, JS의 getDay()와 같다. */
    private static boolean isRestDow(JSONArray dows, long now, int dsh) {
        if (dows == null) {
            return false;
        }
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now - dsh * HOUR);
        int dow = cal.get(Calendar.DAY_OF_WEEK) - 1;
        for (int i = 0; i < dows.length(); i++) {
            if (dows.optInt(i, -1) == dow) {
                return true;
            }
        }
        return false;
    }

    /** 날짜별 값. 그날 값이 없을 때 누적값이면 가장 가까운 이전 날 값을 쓴다. */
    private static int valueFor(JSONObject map, String key, boolean cumulative) {
        if (map == null) {
            return 0;
        }
        if (map.has(key)) {
            return map.optInt(key, 0);
        }
        if (!cumulative) {
            return 0;
        }
        String best = null;
        Iterator<String> it = map.keys();
        while (it.hasNext()) {
            String k = it.next();
            if (k.compareTo(key) <= 0 && (best == null || k.compareTo(best) > 0)) {
                best = k;
            }
        }
        return best == null ? 0 : map.optInt(best, 0);
    }

    static void show(Context c, int slot, JSONObject s, boolean test) {
        ensureChannel(c);
        if (!s.optBoolean("hasCards", false) && !test) {
            return;
        }
        int dsh = s.optInt("dayStartHour", 4);
        long now = System.currentTimeMillis();
        String today = dayKey(now, dsh);
        if (contains(s.optJSONArray("attended"), today) && !test) {
            return;
        }
        // 쉬는 요일에는 알림을 보내지 않는다. 앱이 30일치 쉬는 날을 적어 두고,
        // 앱을 30일 넘게 안 열었으면 요일 설정으로 판단한다.
        boolean restDay;
        String restUntil = s.optString("restUntil", "");
        if (!restUntil.isEmpty() && today.compareTo(restUntil) <= 0) {
            restDay = contains(s.optJSONArray("restDays"), today);
        } else {
            restDay = isRestDow(s.optJSONArray("restDows"), now, dsh);
        }
        if (restDay && !test) {
            return;
        }
        int due = valueFor(s.optJSONObject("dueBy"), today, true);
        int fresh = valueFor(s.optJSONObject("newBy"), today, false);
        int streak = valueFor(s.optJSONObject("streakBy"), today, false);
        int goal = s.optInt("minAnswers", 20);
        int total = due + fresh;
        int minutes = Math.max(1, Math.round((due * 8 + fresh * 25) / 60f));

        String title;
        StringBuilder body = new StringBuilder();
        if (slot == 1) {
            if (total == 0) {
                title = "오늘은 쉬어 가는 날이에요";
                body.append("복습할 카드가 없어요. 앱을 한 번 열면 출석으로 쳐 줘요.");
            } else {
                title = "오늘 꺼낼 카드 " + total + "장";
                body.append("복습 ").append(due).append("장, 새 단어 ").append(fresh)
                        .append("장이에요. 약 ").append(minutes).append("분 걸려요.");
                if (streak > 0) {
                    body.append(" 지금 ").append(streak).append("일 연속 출석 중이에요.");
                }
            }
            long lastBackup = s.optLong("lastBackupAt", 0);
            Calendar cal = Calendar.getInstance();
            boolean sunday = cal.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY;
            if ((sunday || test) && now - lastBackup > 7 * DAY) {
                body.append("\n백업한 지 오래됐어요. 설정에서 백업 파일을 폰 밖에 하나 두세요.");
            }
        } else {
            long left = nextDayStart(now, dsh) - now;
            int hours = (int) Math.max(1, Math.ceil(left / (double) HOUR));
            if (total == 0) {
                title = "앱을 한 번 열어 주세요";
                body.append("오늘은 할 카드가 없어서 열기만 해도 출석이에요.");
            } else {
                title = "출석 마감까지 " + hours + "시간 남았어요";
                if (streak > 0) {
                    body.append(streak).append("일 연속 출석을 이어 가요. ");
                }
                body.append(goal).append("문제만 풀면 오늘 도장을 받아요.");
            }
        }
        if (test) {
            title = "알림 테스트: " + title;
        }

        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(c, 100 + slot, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = body.toString();
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF2457A6)
                .setAutoCancel(true)
                .setContentIntent(content)
                .build();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) {
            return;
        }
        try {
            nm.notify(slot, n);
        } catch (SecurityException ignored) {
            // 알림 권한이 없으면 조용히 넘어간다 (앱 화면에서 켜기 안내)
        }
    }
}
