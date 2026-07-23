package co.skillsale.print

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

@SuppressLint("CustomSplashScreen")
class SplashActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = getColor(R.color.splash_bg)
        window.navigationBarColor = getColor(R.color.splash_bg)
        WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = false

        val glow = findViewById<View>(R.id.glowView)
        val logo = findViewById<ImageView>(R.id.logoView)
        val title = findViewById<TextView>(R.id.titleView)
        val subtitle = findViewById<TextView>(R.id.subtitleView)
        val progress = findViewById<ProgressBar>(R.id.progressView)

        // Logo: fade + scale up
        logo.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(700)
            .setInterpolator(DecelerateInterpolator())
            .start()

        // Glow: soft pulse loop
        glow.animate()
            .alpha(1f)
            .scaleX(1.08f)
            .scaleY(1.08f)
            .setDuration(900)
            .setStartDelay(120)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction {
                glow.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .alpha(0.7f)
                    .setDuration(900)
                    .setInterpolator(AccelerateDecelerateInterpolator())
                    .withEndAction {
                        glow.animate()
                            .scaleX(1.1f)
                            .scaleY(1.1f)
                            .alpha(1f)
                            .setDuration(900)
                            .setInterpolator(AccelerateDecelerateInterpolator())
                            .start()
                    }
                    .start()
            }
            .start()

        // Title / subtitle stagger
        title.animate()
            .alpha(1f)
            .translationY(0f)
            .setStartDelay(380)
            .setDuration(500)
            .setInterpolator(DecelerateInterpolator())
            .start()
        title.translationY = 18f

        subtitle.animate()
            .alpha(1f)
            .translationY(0f)
            .setStartDelay(520)
            .setDuration(500)
            .setInterpolator(DecelerateInterpolator())
            .start()
        subtitle.translationY = 14f

        progress.animate()
            .alpha(0.9f)
            .setStartDelay(700)
            .setDuration(350)
            .start()

        handler.postDelayed({ goToMain(glow, logo, title, subtitle, progress) }, 2100)
    }

    private fun goToMain(
        glow: View,
        logo: ImageView,
        title: TextView,
        subtitle: TextView,
        progress: ProgressBar,
    ) {
        val fadeMs = 320L
        listOf(glow, logo, title, subtitle, progress).forEach { v ->
            v.animate().alpha(0f).setDuration(fadeMs).start()
        }
        handler.postDelayed({
            startActivity(Intent(this, MainActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }, fadeMs)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
