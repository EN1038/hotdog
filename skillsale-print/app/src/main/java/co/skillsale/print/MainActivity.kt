package co.skillsale.print

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import co.skillsale.print.printer.QueuePrintService
import java.io.File

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var printService: QueuePrintService
    private lateinit var bridge: WebAppInterface

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraImageUri: Uri? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = filePathCallback
            filePathCallback = null
            if (callback == null) return@registerForActivityResult

            if (result.resultCode != Activity.RESULT_OK) {
                callback.onReceiveValue(null)
                return@registerForActivityResult
            }

            val dataUri = result.data?.data
            val clipUris =
                result.data?.clipData?.let { clip ->
                    (0 until clip.itemCount).mapNotNull { clip.getItemAt(it)?.uri }
                }

            when {
                !clipUris.isNullOrEmpty() -> callback.onReceiveValue(clipUris.toTypedArray())
                dataUri != null -> callback.onReceiveValue(arrayOf(dataUri))
                cameraImageUri != null -> callback.onReceiveValue(arrayOf(cameraImageUri!!))
                else -> callback.onReceiveValue(null)
            }
            cameraImageUri = null
        }

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
            allowContentAccess = true
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

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?,
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback
                    return try {
                        launchFileChooser(fileChooserParams)
                        true
                    } catch (e: Exception) {
                        this@MainActivity.filePathCallback?.onReceiveValue(null)
                        this@MainActivity.filePathCallback = null
                        Toast.makeText(
                            this@MainActivity,
                            "เปิดกล้อง/แกลอรี่ไม่สำเร็จ",
                            Toast.LENGTH_SHORT,
                        ).show()
                        false
                    }
                }
            }

        requestRuntimePermissions()

        val url =
            getSharedPreferences(AppPrefs.PREFS, MODE_PRIVATE)
                .getString(AppPrefs.KEY_STAFF_URL, AppPrefs.DEFAULT_STAFF_URL)
                ?: AppPrefs.DEFAULT_STAFF_URL
        webView.loadUrl(url)
    }

    private fun launchFileChooser(params: WebChromeClient.FileChooserParams?) {
        val acceptTypes = params?.acceptTypes?.filter { it.isNotBlank() }.orEmpty()
        val wantsImage =
            acceptTypes.isEmpty() ||
                acceptTypes.any {
                    it.contains("image", ignoreCase = true) || it == "*/*"
                }
        val captureEnabled = params?.isCaptureEnabled == true

        val galleryIntent =
            Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = if (wantsImage) "image/*" else "*/*"
                if (params?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
            }

        val cameraIntent =
            if (wantsImage) {
                createCameraIntent()
            } else {
                null
            }

        if (captureEnabled && cameraIntent != null) {
            try {
                fileChooserLauncher.launch(cameraIntent)
                return
            } catch (_: ActivityNotFoundException) {
                /* fall through to chooser */
            }
        }

        val chooser =
            Intent(Intent.ACTION_CHOOSER).apply {
                putExtra(Intent.EXTRA_INTENT, galleryIntent)
                putExtra(Intent.EXTRA_TITLE, "เลือกรูปหรือถ่ายรูป")
                if (cameraIntent != null) {
                    putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
                }
            }
        fileChooserLauncher.launch(chooser)
    }

    private fun createCameraIntent(): Intent? {
        val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        if (intent.resolveActivity(packageManager) == null) return null

        val photoFile =
            try {
                val dir =
                    File(cacheDir, "camera").also { it.mkdirs() }
                File.createTempFile("capture_", ".jpg", dir)
            } catch (_: Exception) {
                val dir =
                    getExternalFilesDir(Environment.DIRECTORY_PICTURES)
                        ?: return null
                File.createTempFile("capture_", ".jpg", dir)
            }

        val uri =
            FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                photoFile,
            )
        cameraImageUri = uri
        intent.putExtra(MediaStore.EXTRA_OUTPUT, uri)
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        // Grant camera apps temporary access
        packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY).forEach { info ->
            grantUriPermission(
                info.activityInfo.packageName,
                uri,
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
        return intent
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed += Manifest.permission.READ_MEDIA_IMAGES
            needed += Manifest.permission.POST_NOTIFICATIONS
        } else {
            needed += Manifest.permission.READ_EXTERNAL_STORAGE
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
        if (filePathCallback != null) {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
        }
        printService.closeAll()
        super.onDestroy()
    }

    companion object {
        private const val REQ_PERMS = 1001
    }
}
