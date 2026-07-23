package co.skillsale.print.printer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.util.Log
import co.skillsale.print.AppPrefs
import net.posprinter.IDeviceConnection
import net.posprinter.IPOSListener
import net.posprinter.POSConnect
import net.posprinter.POSConst
import net.posprinter.POSPrinter

/**
 * One / POS thermal printers (e.g. TPS-80161) via Bluetooth or Ethernet/IP.
 */
class OneQueuePrinter(private val context: Context) {
    private var connection: IDeviceConnection? = null
    private var connectedTarget: String? = null
    private var connectedTransport: String? = null

    @Volatile
    private var connected = false

    private val listener = IPOSListener { code, _ ->
        when (code) {
            POSConnect.CONNECT_SUCCESS -> connected = true
            POSConnect.CONNECT_FAIL, POSConnect.CONNECT_INTERRUPT -> connected = false
        }
    }

    fun ensureInit() {
        try {
            POSConnect.init(context.applicationContext)
        } catch (e: Exception) {
            Log.w(TAG, "POSConnect.init: ${e.message}")
        }
    }

    fun connect(transport: String, target: String): Boolean {
        val normalized = target.trim()
        if (
            connected &&
            connection != null &&
            connectedTarget == normalized &&
            connectedTransport == transport
        ) {
            return true
        }
        ensureInit()
        close()
        return try {
            connected = false
            val deviceType =
                if (transport == AppPrefs.TRANSPORT_NETWORK) {
                    POSConnect.DEVICE_TYPE_ETHERNET
                } else {
                    POSConnect.DEVICE_TYPE_BLUETOOTH
                }
            connection = POSConnect.createDevice(deviceType)
            connection!!.connect(normalized, listener)
            var waited = 0
            while (!connected && waited < 5000) {
                Thread.sleep(100)
                waited += 100
            }
            if (connected) {
                connectedTarget = normalized
                connectedTransport = transport
            }
            connected
        } catch (e: Exception) {
            Log.e(TAG, "connect failed ($transport $normalized)", e)
            false
        }
    }

    fun close() {
        try {
            connection?.close()
        } catch (_: Exception) {
        }
        connection = null
        connected = false
        connectedTarget = null
        connectedTransport = null
    }

    fun printQueueNumber(
        queueNumber: String,
        transport: String,
        target: String,
    ): PrintResult {
        if (!connect(transport, target)) {
            val via =
                if (transport == AppPrefs.TRANSPORT_NETWORK) "IP $target" else "Bluetooth"
            return PrintResult.fail("เชื่อมต่อเครื่องพิมพ์ One ไม่สำเร็จ ($via)")
        }
        return try {
            val printer = POSPrinter(connection)
            val bitmap = renderQueueBitmap(queueNumber)
            printer
                .printBitmap(bitmap, POSConst.ALIGNMENT_CENTER, PRINT_WIDTH)
                .cutHalfAndFeed(1)
            bitmap.recycle()
            PrintResult.ok()
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            close()
            PrintResult.fail(e.message ?: "พิมพ์ไม่สำเร็จ")
        }
    }

    private fun renderQueueBitmap(queueNumber: String): Bitmap {
        val width = PRINT_WIDTH
        val height = 280
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val labelPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 36f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }
        val numberPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 120f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

        canvas.drawText("QUEUE", width / 2f, 70f, labelPaint)
        canvas.drawText(queueNumber.trim(), width / 2f, 200f, numberPaint)
        return bitmap
    }

    companion object {
        private const val TAG = "OneQueuePrinter"
        private const val PRINT_WIDTH = 576
    }
}
