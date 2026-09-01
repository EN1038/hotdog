package co.skillsale.print.printer

import android.webkit.CookieManager
import android.webkit.WebView
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

object LabelLayoutFetcher {
    fun fetch(
        webView: WebView,
        brandId: String,
        clientVersion: Int,
    ): JSONObject? {
        if (brandId.isBlank()) return null
        val origin = originFromWebView(webView) ?: return null
        val versionQs =
            if (clientVersion > 0) "?version=$clientVersion" else ""
        val url = URL("$origin/api/staff/print/layouts/package-label$versionQs")
        val connection = (url.openConnection() as HttpURLConnection)
        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 12_000
            connection.readTimeout = 12_000
            connection.setRequestProperty("Accept", "application/json")
            if (clientVersion > 0) {
                connection.setRequestProperty(
                    "If-None-Match",
                    "\"package-label-v$clientVersion\"",
                )
            }
            val cookie = CookieManager.getInstance().getCookie(origin)
            if (!cookie.isNullOrBlank()) {
                connection.setRequestProperty("Cookie", cookie)
            }
            connection.connect()
            when (connection.responseCode) {
                HttpURLConnection.HTTP_NOT_MODIFIED -> null
                HttpURLConnection.HTTP_OK -> {
                    val body =
                        BufferedReader(InputStreamReader(connection.inputStream))
                            .use { it.readText() }
                    val root = JSONObject(body)
                    root.optJSONObject("layout")
                }
                else -> null
            }
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun originFromWebView(webView: WebView): String? {
        val current = webView.url?.trim().orEmpty()
        if (current.isBlank()) return null
        return try {
            val parsed = URL(current)
            "${parsed.protocol}://${parsed.host}"
        } catch (_: Exception) {
            null
        }
    }
}
