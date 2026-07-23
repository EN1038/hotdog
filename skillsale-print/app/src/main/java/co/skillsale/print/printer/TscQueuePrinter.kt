package co.skillsale.print.printer

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.util.Log
import com.example.tscdll.TSCActivity

/**
 * Zenpert / TSC label printers (e.g. 3R20) via tscsdk.
 * Prints a simple bitmap label with a large queue number.
 */
class TscQueuePrinter {
    private val tsc = TSCActivity()
    private var mac: String = ""

    fun connect(btlAddress: String): Boolean {
        if (mac != btlAddress && tsc.IsConnected) {
            close()
        }
        mac = btlAddress
        return try {
            if (!tsc.IsConnected) {
                val result = tsc.openport(btlAddress)
                if (result == "-1") {
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
            if (tsc.IsConnected) {
                tsc.closeport()
            }
        } catch (_: Exception) {
        }
        mac = ""
    }

    fun printQueueNumber(queueNumber: String, btlAddress: String): PrintResult {
        if (!tsc.IsConnected || mac != btlAddress) {
            if (!connect(btlAddress)) {
                return PrintResult.fail("เชื่อมต่อเครื่องพิมพ์ 3R20 ไม่สำเร็จ")
            }
        }
        return try {
            // Width/height in mm (40x30 sticker)
            val setup = tsc.setup(40, 30, 4, 8, 0, 0, 0)
            if (setup != "1") {
                return PrintResult.fail("ตั้งค่าป้ายไม่สำเร็จ")
            }
            val bitmap = renderQueueBitmap(queueNumber)
            tsc.sendcommand("CLS\r\n")
            tsc.sendbitmap(20, 10, bitmap)
            Thread.sleep(300)
            tsc.sendcommand("PRINT 1\r\n")
            bitmap.recycle()
            PrintResult.ok()
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            PrintResult.fail(e.message ?: "พิมพ์สติกเกอร์ไม่สำเร็จ")
        }
    }

    private fun renderQueueBitmap(queueNumber: String): Bitmap {
        val width = 320
        val height = 200
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        val paint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 96f
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            }
        canvas.drawText(queueNumber.trim(), width / 2f, height / 2f + 32f, paint)
        return bitmap
    }

    companion object {
        private const val TAG = "TscQueuePrinter"
    }
}
