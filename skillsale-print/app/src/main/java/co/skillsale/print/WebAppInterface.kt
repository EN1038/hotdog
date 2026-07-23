package co.skillsale.print

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Patterns
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import co.skillsale.print.printer.QueuePrintService
import co.skillsale.print.ui.SelectPrinterActivity
import org.json.JSONObject

class WebAppInterface(
    private val activity: AppCompatActivity,
    private val printService: QueuePrintService,
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
                    val label =
                        if (device.transport == AppPrefs.TRANSPORT_NETWORK) {
                            "${device.name} @ ${device.address}"
                        } else {
                            device.name
                        }
                    Toast.makeText(activity, "เลือกเครื่อง: $label", Toast.LENGTH_SHORT).show()
                }
            }
        }

    @JavascriptInterface
    fun isPrintBridge(): Boolean = true

    @JavascriptInterface
    fun getSelectedPrinter(): String {
        val device = PrinterDevice.load(activity) ?: return "null"
        return device.toJson()
    }

    @JavascriptInterface
    fun selectPrinter() {
        mainHandler.post {
            printService.closeAll()
            selectLauncher.launch(Intent(activity, SelectPrinterActivity::class.java))
        }
    }

    /** Quick-save One network printer, e.g. setNetworkPrinter("192.168.8.20") */
    @JavascriptInterface
    fun setNetworkPrinter(ip: String): String {
        val normalized = ip.trim()
        if (!Patterns.IP_ADDRESS.matcher(normalized).matches()) {
            return JSONObject()
                .put("code", "-1")
                .put("message", "รูปแบบ IP ไม่ถูกต้อง")
                .toString()
        }
        val device = PrinterDevice.network(normalized)
        PrinterDevice.save(activity, device)
        printService.closeAll()
        mainHandler.post {
            Toast.makeText(activity, "ตั้งค่า IP: $normalized", Toast.LENGTH_SHORT).show()
        }
        return JSONObject()
            .put("code", "1")
            .put("message", "OK")
            .put("printer", JSONObject(device.toJson()))
            .toString()
    }

    @JavascriptInterface
    fun printQueueNumber(queueNumber: String): String {
        return try {
            val result = printService.printQueueNumber(queueNumber)
            if (result.code != "1") {
                mainHandler.post {
                    Toast.makeText(activity, result.message, Toast.LENGTH_SHORT).show()
                }
            }
            result.toJson()
        } catch (e: Exception) {
            val fail = JSONObject()
                .put("code", "-1")
                .put("message", e.message ?: "print error")
                .toString()
            mainHandler.post {
                Toast.makeText(activity, e.message ?: "พิมพ์ไม่สำเร็จ", Toast.LENGTH_SHORT).show()
            }
            fail
        }
    }

    fun openSelectIfNeeded() {
        if (PrinterDevice.load(activity) == null) {
            selectPrinter()
        }
    }
}
