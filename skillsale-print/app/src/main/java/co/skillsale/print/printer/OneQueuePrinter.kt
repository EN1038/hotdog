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
        
        var height = 350
        if (showRole && role.isNotBlank()) height += 48
        if (ticket.orderNumber.isNotBlank()) height += 42
        if (ticket.dateLabel.isNotBlank()) height += 36
        if (ticket.orderType.isNotBlank()) height += 36
        if (ticket.items.isNotEmpty()) {
            height += ticket.items.size * 40 + 40
        }
        height += 150
        if (ticket.discount > 0) height += 36
        if (ticket.paymentMethod.isNotBlank()) height += 40

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val center = width / 2f
        val small = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.CENTER; textSize = 26f }
        val smallLeft = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.LEFT; textSize = 26f }
        val smallRight = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.RIGHT; textSize = 26f }
        val medium = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.CENTER; textSize = 34f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val mediumLeft = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.LEFT; textSize = 30f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val mediumRight = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.RIGHT; textSize = 30f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val huge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.CENTER; textSize = 110f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; strokeWidth = 2f }

        var y = 50f
        if (showRole && role.isNotBlank()) {
            canvas.drawText(role, center, y, medium)
            y += 48f
        }
        canvas.drawText("คิว", center, y, small)
        y += 100f
        canvas.drawText(ticket.queueNumber.trim(), center, y, huge)
        y += 60f
        
        if (ticket.orderNumber.isNotBlank()) {
            canvas.drawText("บิล: ${ticket.orderNumber.trim()}", center, y, medium)
            y += 42f
        }
        if (ticket.orderType.isNotBlank()) {
            canvas.drawText(ticket.orderType.trim(), center, y, small)
            y += 36f
        }
        if (ticket.dateLabel.isNotBlank()) {
            canvas.drawText(ticket.dateLabel.trim(), center, y, small)
            y += 36f
        }
        
        if (ticket.items.isNotEmpty()) {
            y += 10f
            canvas.drawLine(10f, y, width - 10f, y, linePaint)
            y += 40f
            for (item in ticket.items) {
                var itemName = item.name
                if (itemName.length > 20) itemName = itemName.take(19) + ".."
                canvas.drawText(itemName, 20f, y, smallLeft)
                canvas.drawText("${item.qty}x${item.price.toInt()}", width - 120f, y, smallRight)
                canvas.drawText(String.format("%.2f", item.total), width - 20f, y, smallRight)
                y += 40f
            }
            y -= 10f
            canvas.drawLine(10f, y, width - 10f, y, linePaint)
            y += 40f
        } else {
            y += 20f
        }
        
        canvas.drawText("ยอดรวม:", 20f, y, smallLeft)
        canvas.drawText(String.format("%.2f", ticket.subtotal), width - 20f, y, smallRight)
        y += 36f
        
        if (ticket.discount > 0) {
            canvas.drawText("ส่วนลด:", 20f, y, smallLeft)
            canvas.drawText("-${String.format("%.2f", ticket.discount)}", width - 20f, y, smallRight)
            y += 36f
        }
        
        canvas.drawText("ยอดสุทธิ:", 20f, y, mediumLeft)
        canvas.drawText(String.format("%.2f", ticket.totalAmount), width - 20f, y, mediumRight)
        y += 50f
        
        if (ticket.paymentMethod.isNotBlank()) {
            canvas.drawText("ชำระโดย: ${ticket.paymentMethod}", center, y, small)
            y += 40f
        }

        return bitmap
    }

    companion object {
        private const val TAG = "OneQueuePrinter"
        private const val PRINT_WIDTH = 576
    }
}
