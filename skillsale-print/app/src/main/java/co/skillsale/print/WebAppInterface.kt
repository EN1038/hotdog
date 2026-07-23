package co.skillsale.print

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import co.skillsale.print.printer.QueuePrintService
import co.skillsale.print.printer.QueueTicket
import co.skillsale.print.ui.SelectPrinterActivity
import org.json.JSONObject

class WebAppInterface(
    private val activity: AppCompatActivity,
    private val printService: QueuePrintService,
    private val webViewProvider: () -> WebView,
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    private val selectLauncher =
        activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == AppCompatActivity.RESULT_OK) {
                @Suppress("DEPRECATION")
                val device =
                    result.data?.getSerializableExtra(SelectPrinterActivity.EXTRA_DEVICE)
                        as? PrinterDevice
                if (device != null) {
                    PrinterDevice.save(activity, device)
                    printService.closeAll()
                    Toast.makeText(activity, "เลือกเครื่อง: ${device.name}", Toast.LENGTH_SHORT)
                        .show()
                    notifyWebPrinterChanged()
                }
            }
        }

    private fun notifyWebPrinterChanged() {
        mainHandler.post {
            webViewProvider().evaluateJavascript(
                """
                (function(){
                  window.__SKILLSALE_PRINT__ = true;
                  try { window.dispatchEvent(new Event('skillsale-print-ready')); } catch (e) {}
                })();
                """.trimIndent(),
                null,
            )
        }
    }

    @JavascriptInterface
    fun isPrintBridge(): Boolean = true

    @JavascriptInterface
    fun getSelectedPrinter(): String {
        val device = PrinterDevice.load(activity) ?: return "null"
        if (device.transport == AppPrefs.TRANSPORT_NETWORK) return "null"
        return device.toJson()
    }

    @JavascriptInterface
    fun selectPrinter() {
        mainHandler.post {
            printService.closeAll()
            selectLauncher.launch(Intent(activity, SelectPrinterActivity::class.java))
        }
    }

    @JavascriptInterface
    fun printQueueNumber(queueNumber: String): String {
        return printQueueTickets(
            JSONObject()
                .put("queueNumber", queueNumber)
                .put("copies", 1)
                .toString(),
        )
    }

    /**
     * JSON: { queueNumber, orderNumber?, dateLabel?, copies? }
     * Prints N slips with roles ร้าน / ลูกค้า / สำเนา N.
     */
    @JavascriptInterface
    fun printQueueTickets(json: String): String {
        return try {
            val obj = JSONObject(json)
            val ticket =
                QueueTicket(
                    queueNumber = obj.optString("queueNumber", ""),
                    orderNumber = obj.optString("orderNumber", ""),
                    dateLabel = obj.optString("dateLabel", ""),
                    copies = obj.optInt("copies", 1).coerceIn(1, 5),
                )
            val result = printService.printQueueTickets(ticket)
            if (result.code != "1") {
                mainHandler.post {
                    Toast.makeText(activity, result.message, Toast.LENGTH_SHORT).show()
                }
            }
            result.toJson()
        } catch (e: Exception) {
            val fail =
                JSONObject()
                    .put("code", "-1")
                    .put("message", e.message ?: "print error")
                    .toString()
            mainHandler.post {
                Toast.makeText(activity, e.message ?: "พิมพ์ไม่สำเร็จ", Toast.LENGTH_SHORT).show()
            }
            fail
        }
    }
}
