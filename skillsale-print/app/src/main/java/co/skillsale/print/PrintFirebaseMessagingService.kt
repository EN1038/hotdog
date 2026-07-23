package co.skillsale.print

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Receives FCM pushes (order alerts later). */
class PrintFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        Log.i(TAG, "FCM new token (${token.take(12)}…)")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        Log.i(TAG, "FCM message from=${message.from} data=${message.data}")
        // Notification display for background/closed will be wired with staff order events.
    }

    companion object {
        private const val TAG = "SkillSaleFCM"
    }
}
