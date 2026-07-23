package co.skillsale.print

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import co.skillsale.print.printer.QueuePrintService

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var printService: QueuePrintService
    private lateinit var bridge: WebAppInterface

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        printService = QueuePrintService(this)
        webView = WebView(this)
        webView.tag = "skillsale_webview"
        setContentView(webView)

        bridge = WebAppInterface(this, printService) { webView }
        webView.addJavascriptInterface(bridge, "Android")

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString SkillSalePrint/1.0"
        }

        webView.webViewClient =
            object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    view?.evaluateJavascript(
                        """
                        (function(){
                          window.__SKILLSALE_PRINT__ = true;
                          try {
                            window.dispatchEvent(new Event('skillsale-print-ready'));
                          } catch (e) {}
                        })();
                        """.trimIndent(),
                        null,
                    )
                }
            }
        webView.webChromeClient =
            object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest?) {
                    request?.grant(request.resources)
                }
            }

        requestRuntimePermissions()

        val url =
            getSharedPreferences(AppPrefs.PREFS, MODE_PRIVATE)
                .getString(AppPrefs.KEY_STAFF_URL, AppPrefs.DEFAULT_STAFF_URL)
                ?: AppPrefs.DEFAULT_STAFF_URL
        webView.loadUrl(url)
        // Do not force printer picker — staff can work normally without a printer
    }

    private fun requestRuntimePermissions() {
        val needed = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            needed += Manifest.permission.BLUETOOTH_SCAN
            needed += Manifest.permission.BLUETOOTH_CONNECT
        }
        val missing =
            needed.filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_PERMS)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        printService.closeAll()
        super.onDestroy()
    }

    companion object {
        private const val REQ_PERMS = 1001
    }
}
