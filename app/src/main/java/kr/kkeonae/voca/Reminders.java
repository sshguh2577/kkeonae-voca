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

    /**
     * 1.0.17: 오늘이 그 갈래(tr: 토익이면 요약 전체, 전공이면 major)의 '보충할 수 있는 날'인지.
     * 앱이 오늘 요약을 썼으면 앱이 계산한 값(mk)을 그대로 쓴다. 아니면 지난 6일을 직접 센다:
     * 쉬는 요일(weekRest)인 오늘 앞 6일 안에, 갈래를 시작한 뒤의 쉬는 날이 아닌 날 가운데 출석 안 한 날이 있으면 보충하는 날이다.
     * 그 사이에 있던 다른 쉬는 요일에 출석했으면 그날이 하나를 채운 것으로 본다.
     */
    private static boolean makeupToday(JSONObject s, JSONObject tr, String today, long now, int dsh) {
        if (tr == null) {
            return false;
        }
        long gen = s.optLong("generatedAt", 0);
        if (gen > 0 && today.equals(dayKey(gen, dsh)) && tr.has("mk")) {
            return tr.optBoolean("mk", false);
        }
        JSONArray week = s.optJSONArray("weekRest");
        if (!contains(week, today)) {
            return false;
        }
        String start = tr.optString("start", "");
        String from = s.optString("restFrom", "");
        if (start.isEmpty() || from.isEmpty()) {
            return false;
        }
        JSONArray rest = s.optJSONArray("restDays");
        JSONArray att = tr.optJSONArray("attended");
        int miss = 0;
        int filled = 0;
        for (int i = 1; i <= 6; i++) {
            String k = dayKey(now - i * DAY, dsh);
            if (k.compareTo(start) < 0 || k.compareTo(from) < 0) {
                continue;
            }
            boolean done = contains(att, k);
            if (contains(rest, k)) {
                if (done && contains(week, k)) {
                    filled++;
                }
            } else if (!done) {
                miss++;
            }
        }
        return miss > filled;
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

    /** 갈래 하나(토익 또는 전공)의 오늘 남은 양. 앱이 summary.json에 날짜별로 적어 둔다. */
    private static final class Track {
        int due;
        int fresh;
        int streak;
        int goal;

        int total() {
            return due + fresh;
        }

        /** 이만큼 풀면 도장: 기준 문제 수, 남은 카드가 더 적으면 남은 카드를 다 끝낼 때 */
        int need() {
            return Math.max(1, Math.min(goal, total()));
        }
    }

    private static Track track(JSONObject t, String today, int defGoal) {
        Track r = new Track();
        if (t == null) {
            return r;
        }
        r.due = valueFor(t.optJSONObject("dueBy"), today, true);
        r.fresh = valueFor(t.optJSONObject("newBy"), today, false);
        r.streak = valueFor(t.optJSONObject("streakBy"), today, false);
        r.goal = t.optInt("minAnswers", defGoal);
        return r;
    }

    private static String streakText(Track t, Track m) {
        if (t.streak > 0 && m.streak > 0) {
            return "토익 " + t.streak + "일, 전공 " + m.streak + "일 연속 출석 중이에요.";
        }
        if (t.streak > 0) {
            return "토익 " + t.streak + "일 연속 출석 중이에요.";
        }
        if (m.streak > 0) {
            return "전공 " + m.streak + "일 연속 출석 중이에요.";
        }
        return "";
    }

    private static void appendBackupNote(StringBuilder body, JSONObject s, long now, boolean test) {
        long lastBackup = s.optLong("lastBackupAt", 0);
        Calendar cal = Calendar.getInstance();
        boolean sunday = cal.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY;
        if ((sunday || test) && now - lastBackup > 7 * DAY) {
            body.append("\n백업한 지 오래됐어요. 설정에서 백업 파일을 폰 밖에 하나 두세요.");
        }
    }

    static void show(Context c, int slot, JSONObject s, boolean test) {
        ensureChannel(c);
        // 1.0.8부터 전공 갈래가 따로 있다. 전공 카드가 없으면 major가 없고, 예전과 똑같이 토익만 알린다
        boolean hasT = s.optBoolean("hasCards", false);
        JSONObject mj = s.optJSONObject("major");
        boolean hasM = mj != null;
        if (!hasT && !hasM && !test) {
            return;
        }
        int dsh = s.optInt("dayStartHour", 4);
        long now = System.currentTimeMillis();
        String today = dayKey(now, dsh);
        boolean needT = hasT && !contains(s.optJSONArray("attended"), today);
        boolean needM = hasM && !contains(mj.optJSONArray("attended"), today);
        if (test) {
            needT = hasT || !hasM;
            needM = hasM;
        } else if (!needT && !needM) {
            return; // 토익도 전공도 출석했으면 알리지 않는다
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
        // 1.0.17: 쉬는 요일이라도 이번 주에 빠진 날이 있으면 그 갈래는 '보충할 수 있는 날'이라 알린다 (토익·전공 따로)
        boolean makeup = false;
        if (restDay && !test) {
            boolean mkT = needT && makeupToday(s, s, today, now, dsh);
            boolean mkM = needM && makeupToday(s, mj, today, now, dsh);
            if (!mkT && !mkM) {
                return;
            }
            needT = mkT;
            needM = mkM;
            makeup = true;
        }
        Track t = needT ? track(s, today, 20) : new Track();
        Track m = needM ? track(mj, today, 10) : new Track();
        if (makeup) { // 쉬는 날로 적어 둔 날이라 새 단어가 0으로 적혀 있으면, 보충하는 날에 나올 수로 바꾼다
            if (needT && t.fresh == 0) {
                t.fresh = valueFor(s.optJSONObject("newByMakeup"), today, false);
            }
            if (needM && m.fresh == 0) {
                m.fresh = valueFor(mj.optJSONObject("newByMakeup"), today, false);
            }
        }
        int due = t.due;
        int fresh = t.fresh;
        int streak = t.streak;
        int goal = t.goal;
        int total = due + fresh;
        // 앱이 최근 기록으로 잰 한 장당 시간(1.0.6부터). 없으면 예전 기본값(복습 8초, 새 단어 25초)
        long revMs = s.optLong("revMs", 8000);
        long newMs = s.optLong("newMs", 25000);
        if (revMs <= 0) revMs = 8000;
        if (newMs <= 0) newMs = 25000;
        int minutes = (int) Math.max(1, Math.round(((due + m.due) * revMs + (fresh + m.fresh) * newMs) / 60000.0));

        String title;
        StringBuilder body = new StringBuilder();
        if (slot == 1 && needM) {
            if (!needT) {
                if (m.total() == 0) {
                    title = "오늘 전공은 쉬어 가는 날이에요";
                    body.append("할 전공 카드가 없어요. 앱을 한 번 열면 전공 출석으로 쳐 줘요.");
                } else {
                    title = "오늘 꺼낼 전공 카드 " + m.total() + "장";
                    body.append("복습 ").append(m.due).append("장, 새 단어 ").append(m.fresh)
                            .append("장이에요. 약 ").append(minutes).append("분 걸려요.");
                    if (m.streak > 0) {
                        body.append(" 지금 전공 ").append(m.streak).append("일 연속 출석 중이에요.");
                    }
                }
            } else if (total + m.total() == 0) {
                title = "오늘은 쉬어 가는 날이에요";
                body.append("토익도 전공도 할 카드가 없어요. 앱을 한 번 열면 둘 다 출석으로 쳐 줘요.");
            } else {
                title = "오늘 꺼낼 카드: 토익 " + total + "장, 전공 " + m.total() + "장";
                body.append(total == 0 ? "토익: 할 카드 없음 (앱을 열면 출석)"
                        : "토익: 복습 " + due + "장, 새 단어 " + fresh + "장").append('\n');
                body.append(m.total() == 0 ? "전공: 할 카드 없음 (앱을 열면 출석)"
                        : "전공: 복습 " + m.due + "장, 새 단어 " + m.fresh + "장").append('\n');
                body.append("합쳐서 약 ").append(minutes).append("분 걸려요.");
                String st = streakText(t, m);
                if (!st.isEmpty()) {
                    body.append(' ').append(st);
                }
            }
            appendBackupNote(body, s, now, test);
        } else if (slot != 1 && needM) {
            long left = nextDayStart(now, dsh) - now;
            int hours = (int) Math.max(1, Math.ceil(left / (double) HOUR));
            if (!needT) {
                if (m.total() == 0) {
                    title = "앱을 한 번 열어 주세요";
                    body.append("오늘은 할 전공 카드가 없어서 열기만 해도 전공 출석이에요.");
                } else {
                    title = "전공 출석 마감까지 " + hours + "시간 남았어요";
                    if (m.streak > 0) {
                        body.append("전공 ").append(m.streak).append("일 연속 출석을 이어 가요. ");
                    }
                    body.append("전공 ").append(m.need()).append("문제만 풀면 오늘 전공 도장을 받아요.");
                }
            } else if (total + m.total() == 0) {
                title = "앱을 한 번 열어 주세요";
                body.append("오늘은 할 카드가 없어서 열기만 해도 토익과 전공 모두 출석이에요.");
            } else {
                title = "출석 마감까지 " + hours + "시간 남았어요";
                body.append(total == 0 ? "토익: 앱을 열기만 해도 출석" : "토익: " + t.need() + "문제 풀면 도장").append('\n');
                body.append(m.total() == 0 ? "전공: 앱을 열기만 해도 출석" : "전공: " + m.need() + "문제 풀면 도장");
                String st = streakText(t, m);
                if (!st.isEmpty()) {
                    body.append('\n').append(st);
                }
            }
        } else if (slot == 1) {
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
            appendBackupNote(body, s, now, test);
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
        if (makeup) {
            String who = needT && needM ? "" : needT ? "토익 " : "전공 ";
            if (slot == 1) {
                title = "오늘은 " + who + "보충할 수 있는 날이에요";
                body.insert(0, "이번 주에 빠진 날을 오늘 채울 수 있어요.\n");
            } else {
                long leftMs = nextDayStart(now, dsh) - now;
                int hoursLeft = (int) Math.max(1, Math.ceil(leftMs / (double) HOUR));
                title = who + "보충 마감까지 " + hoursLeft + "시간 남았어요";
                body.insert(0, "오늘 출석하면 이번 주에 빠진 날이 채워져요.\n");
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
