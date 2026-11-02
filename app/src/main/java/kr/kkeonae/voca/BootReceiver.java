package kr.kkeonae.voca;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 폰을 껐다 켜거나, 앱을 업데이트하거나, 시간이 바뀌면 알람을 다시 건다. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Reminders.scheduleAll(context.getApplicationContext());
    }
}
