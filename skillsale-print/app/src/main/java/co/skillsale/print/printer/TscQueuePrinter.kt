package co.skillsale.print.printer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.util.Log
import com.example.tscdll.TSCActivity

/** Zenpert / TSC label printers (e.g. 3R20) via Bluetooth. */
class TscQueuePrinter {
    private val tsc = TSCActivity()
    private var mac: String = ""

    fun connect(btlAddress: String): Boolean {
        if (mac != btlAddress && tsc.IsConnected) close()
        mac = btlAddress
        return try {
            if (!tsc.IsConnected) {
                if (tsc.openport(btlAddress) == "-1") {
                    Log.e(TAG, "openport failed")
                    return false
                }
            }
            tsc.IsConnected
        } catch (e: Exception) {
            Log.e(TAG, "connect failed", e)
            false
        }
    }

    fun close() {
        try {
            if (tsc.IsConnected) tsc.closeport()
        } catch (_: Exception) {
        }
        mac = ""
    }

    fun printTickets(ticket: QueueTicket, btlAddress: String): PrintResult {
        if (!tsc.IsConnected || mac != btlAddress) {
            if (!connect(btlAddress)) {
                return PrintResult.fail("เชื่อมต่อเครื่องพิมพ์ 3R20 ไม่สำเร็จ")
            }
        }
        return try {
            val total = ticket.copies.coerceIn(1, 5)
            for (i in 0 until total) {
                val role = QueueTicket.roleForIndex(i, total)
                val setup = tsc.setup(50, 40, 4, 8, 0, 0, 0)
                if (setup != "1") {
                    return PrintResult.fail("ตั้งค่าป้ายไม่สำเร็จ")
                }
                val bitmap = renderTicketBitmap(ticket, role, total > 1)
                tsc.sendcommand("CLS\r\n")
                tsc.sendbitmap(10, 8, bitmap)
                Thread.sleep(300)
                tsc.sendcommand("PRINT 1\r\n")
                bitmap.recycle()
                if (i < total - 1) Thread.sleep(400)
            }
            PrintResult.ok()
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            PrintResult.fail(e.message ?: "พิมพ์สติกเกอร์ไม่สำเร็จ")
        }
    }

    private fun renderTicketBitmap(
        ticket: QueueTicket,
        role: String,
        showRole: Boolean,
    ): Bitmap {
        val width = 360
        val height = 280
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        val center = width / 2f
        val small =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 22f
            }
        val medium =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 26f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }
        val huge =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 72f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }

        var y = 36f
        if (showRole && role.isNotBlank()) {
            canvas.drawText(role, center, y, medium)
            y += 36f
        }
        canvas.drawText("คิว ${ticket.queueNumber.trim()}", center, y + 50f, huge)
        y += 110f
        if (ticket.orderNumber.isNotBlank()) {
            canvas.drawText("บิล ${ticket.orderNumber.trim()}", center, y, medium)
            y += 32f
        }
        if (ticket.dateLabel.isNotBlank()) {
            canvas.drawText(ticket.dateLabel.trim(), center, y, small)
        }
        return bitmap
    }

    companion object {
        private const val TAG = "TscQueuePrinter"
    }
}
