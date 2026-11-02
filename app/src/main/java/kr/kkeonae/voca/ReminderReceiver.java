package kr.kkeonae.voca;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 예약한 시간이 되면 알림을 띄우고 다음 날 알람을 다시 건다. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int slot = intent.getIntExtra("slot", 1);
        Reminders.fire(context.getApplicationContext(), slot);
    }
}
