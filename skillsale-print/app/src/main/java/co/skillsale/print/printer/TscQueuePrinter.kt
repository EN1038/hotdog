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
                val bitmap = renderTicketBitmap(ticket, role, total > 1)
                
                val mmHeight = Math.ceil(bitmap.height / 8.0).toInt() + 2
                val setup = tsc.setup(50, mmHeight, 4, 8, 0, 0, 0)
                if (setup != "1") {
                    return PrintResult.fail("ตั้งค่าป้ายไม่สำเร็จ")
                }
                
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
        
        var height = 250
        if (ticket.brandName.isNotBlank() || ticket.branchName.isNotBlank()) height += 36
        if (ticket.branchAddress.isNotBlank()) height += 26
        if (ticket.staffName.isNotBlank()) height += 36
        if (ticket.orderNumber.isNotBlank()) height += 32
        if (ticket.dateLabel.isNotBlank()) height += 26
        if (ticket.orderType.isNotBlank()) height += 26
        if (ticket.items.isNotEmpty()) {
            height += ticket.items.size * 30 + 30
        }
        height += 120
        if (ticket.discount > 0) height += 26
        if (ticket.paymentMethod.isNotBlank()) height += 30
        height += 60 // space for footer

        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        
        val center = width / 2f
        val small = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.CENTER; textSize = 20f }
        val smallLeft = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.LEFT; textSize = 20f }
        val smallRight = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.RIGHT; textSize = 20f }
        val medium = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.CENTER; textSize = 26f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val mediumLeft = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.LEFT; textSize = 22f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val mediumRight = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.RIGHT; textSize = 22f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val huge = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textAlign = Paint.Align.CENTER; textSize = 72f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; strokeWidth = 2f }

        var y = 36f
        
        val headerTitle = if (ticket.brandName.isNotBlank() && ticket.branchName.isNotBlank()) {
            "${ticket.brandName} - สาขา ${ticket.branchName}"
        } else if (ticket.brandName.isNotBlank()) {
            ticket.brandName
        } else {
            ticket.branchName
        }
        
        if (headerTitle.isNotBlank()) {
            canvas.drawText(headerTitle, center, y, medium)
            y += 36f
        }
        if (ticket.branchAddress.isNotBlank()) {
            canvas.drawText(ticket.branchAddress.trim(), center, y, small)
            y += 26f
        }
        if (ticket.staffName.isNotBlank()) {
            canvas.drawText("พนักงาน: ${ticket.staffName.trim()}", center, y, small)
            y += 36f
        }
        
        canvas.drawText("คิว ${ticket.queueNumber.trim()}", center, y + 40f, huge)
        y += 90f
        
        if (ticket.orderNumber.isNotBlank()) {
            canvas.drawText("บิล: ${ticket.orderNumber.trim()}", center, y, medium)
            y += 32f
        }
        if (ticket.orderType.isNotBlank()) {
            canvas.drawText(ticket.orderType.trim(), center, y, small)
            y += 26f
        }
        if (ticket.dateLabel.isNotBlank()) {
            canvas.drawText(ticket.dateLabel.trim(), center, y, small)
            y += 26f
        }

        if (ticket.items.isNotEmpty()) {
            y += 10f
            canvas.drawLine(10f, y, width - 10f, y, linePaint)
            y += 30f
            for (item in ticket.items) {
                var itemName = item.name
                if (itemName.length > 20) itemName = itemName.take(19) + ".."
                canvas.drawText(itemName, 10f, y, smallLeft)
                canvas.drawText("${item.qty}x${item.price.toInt()}", width - 100f, y, smallRight)
                canvas.drawText(String.format("%.2f", item.total), width - 10f, y, smallRight)
                y += 30f
            }
            y -= 5f
            canvas.drawLine(10f, y, width - 10f, y, linePaint)
            y += 30f
        } else {
            y += 15f
        }
        
        canvas.drawText("ยอดรวม:", 10f, y, smallLeft)
        canvas.drawText(String.format("%.2f", ticket.subtotal), width - 10f, y, smallRight)
        y += 26f
        
        if (ticket.discount > 0) {
            canvas.drawText("ส่วนลด:", 10f, y, smallLeft)
            canvas.drawText("-${String.format("%.2f", ticket.discount)}", width - 10f, y, smallRight)
            y += 26f
        }
        
        canvas.drawText("ยอดสุทธิ:", 10f, y, mediumLeft)
        canvas.drawText(String.format("%.2f", ticket.totalAmount), width - 10f, y, mediumRight)
        y += 40f
        
        if (ticket.paymentMethod.isNotBlank()) {
            canvas.drawText("ชำระโดย: ${ticket.paymentMethod}", center, y, small)
            y += 30f
        }
        
        y += 15f
        canvas.drawText("ขอบคุณที่ใช้บริการ", center, y, small)
        y += 30f

        return bitmap
    }

    companion object {
        private const val TAG = "TscQueuePrinter"
    }
}
