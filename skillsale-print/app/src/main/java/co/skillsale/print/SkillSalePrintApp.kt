package co.skillsale.print

import android.app.Application
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging

class SkillSalePrintApp : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                Log.i(TAG, "FCM token ready (${token.take(12)}…)")
            }
            .addOnFailureListener { e ->
                Log.w(TAG, "FCM token failed: ${e.message}")
            }
    }

    companion object {
        private const val TAG = "SkillSalePrint"
    }
}
