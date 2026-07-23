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

/** One / POS thermal printers (e.g. TPS-80161) via Bluetooth only. */
class OneQueuePrinter(private val context: Context) {
    private var connection: IDeviceConnection? = null
    private var connectedMac: String? = null

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

    fun connect(mac: String): Boolean {
        val normalized = mac.trim()
        if (connected && connection != null && connectedMac == normalized) return true
        ensureInit()
        close()
        return try {
            connected = false
            connection = POSConnect.createDevice(POSConnect.DEVICE_TYPE_BLUETOOTH)
            connection!!.connect(normalized, listener)
            var waited = 0
            while (!connected && waited < 5000) {
                Thread.sleep(100)
                waited += 100
            }
            if (connected) connectedMac = normalized
            connected
        } catch (e: Exception) {
            Log.e(TAG, "connect failed $normalized", e)
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
        connectedMac = null
    }

    fun printTickets(ticket: QueueTicket, mac: String): PrintResult {
        if (!connect(mac)) {
            return PrintResult.fail("เชื่อมต่อเครื่องพิมพ์ One ไม่สำเร็จ (Bluetooth)")
        }
        return try {
            val printer = POSPrinter(connection)
            val total = ticket.copies.coerceIn(1, 5)
            for (i in 0 until total) {
                val role = QueueTicket.roleForIndex(i, total)
                val bitmap = renderTicketBitmap(ticket, role, total > 1)
                printer
                    .printBitmap(bitmap, POSConst.ALIGNMENT_CENTER, PRINT_WIDTH)
                    .cutHalfAndFeed(1)
                bitmap.recycle()
                if (i < total - 1) Thread.sleep(250)
            }
            PrintResult.ok()
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            close()
            PrintResult.fail(e.message ?: "พิมพ์ไม่สำเร็จ")
        }
    }

    private fun renderTicketBitmap(
        ticket: QueueTicket,
        role: String,
        showRole: Boolean,
    ): Bitmap {
        val width = PRINT_WIDTH
        val height = if (showRole) 420 else 380
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val center = width / 2f
        val small =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 28f
            }
        val medium =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 34f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }
        val huge =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 110f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

        var y = 50f
        if (showRole && role.isNotBlank()) {
            canvas.drawText(role, center, y, medium)
            y += 48f
        }
        canvas.drawText("คิว", center, y, small)
        y += 100f
        canvas.drawText(ticket.queueNumber.trim(), center, y, huge)
        y += 56f
        if (ticket.orderNumber.isNotBlank()) {
            canvas.drawText("บิล ${ticket.orderNumber.trim()}", center, y, medium)
            y += 42f
        }
        if (ticket.dateLabel.isNotBlank()) {
            canvas.drawText(ticket.dateLabel.trim(), center, y, small)
        }
        return bitmap
    }

    companion object {
        private const val TAG = "OneQueuePrinter"
        private const val PRINT_WIDTH = 576
    }
}
