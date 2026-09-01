package co.skillsale.print.printer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.common.BitMatrix

object PackageLabelBitmap {
    fun render(context: Context, label: PackageLabel): Bitmap {
        val width = 400
        val height = 300
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val regular =
            Typeface.createFromAsset(context.assets, "fonts/Kanit-Regular.ttf")
        val bold = Typeface.create(regular, Typeface.BOLD)
        val center = width / 2f

        val tiny =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 16f
                typeface = regular
            }
        val small =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 18f
                typeface = regular
            }
        val namePaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 22f
                typeface = bold
            }

        var y = 18f
        if (label.brandName.isNotBlank()) {
            canvas.drawText(label.brandName.trim(), center, y, tiny)
            y += 22f
        }

        val name = label.productName.trim().ifBlank { "—" }
        canvas.drawText(truncate(name, 22), center, y, namePaint)
        y += 24f
        if (name.length > 22) {
            canvas.drawText(truncate(name.substring(22), 22), center, y, namePaint)
            y += 24f
        }

        val meta =
            "SKU ${label.productCode.trim()} · ${label.quantity} ${label.unit.trim()}"
        canvas.drawText(truncate(meta, 34), center, y, small)
        y += 22f

        val dates =
            "ผลิต ${label.producedAtLabel.ifBlank { "—" }} · LOT ${label.lotNumber.trim()}"
        canvas.drawText(truncate(dates, 34), center, y, small)
        y += 22f

        if (label.sourceBranchName.isNotBlank()) {
            canvas.drawText(
                truncate("จาก ${label.sourceBranchName.trim()}", 30),
                center,
                y,
                tiny,
            )
            y += 20f
        }

        val barcodeBitmap =
            encodeBarcode(label.labelCode.trim().ifBlank { label.productCode }, 250, 56)
        val qrBitmap = encodeQr(label.qrPayload.trim().ifBlank { label.labelCode }, 88)

        val codesTop = y + 6f
        canvas.drawBitmap(barcodeBitmap, 24f, codesTop, null)
        canvas.drawBitmap(qrBitmap, width - qrBitmap.width - 20f, codesTop, null)

        barcodeBitmap.recycle()
        qrBitmap.recycle()

        return bitmap
    }

    private fun truncate(value: String, max: Int): String {
        val trimmed = value.trim()
        if (trimmed.length <= max) return trimmed
        return trimmed.substring(0, max - 1) + "…"
    }

    private fun encodeQr(content: String, size: Int): Bitmap {
        val matrix =
            MultiFormatWriter().encode(
                content,
                BarcodeFormat.QR_CODE,
                size,
                size,
                mapOf(EncodeHintType.MARGIN to 0),
            )
        return toBitmap(matrix)
    }

    private fun encodeBarcode(content: String, width: Int, height: Int): Bitmap {
        val matrix =
            MultiFormatWriter().encode(
                content,
                BarcodeFormat.CODE_128,
                width,
                height,
                mapOf(EncodeHintType.MARGIN to 1),
            )
        return toBitmap(matrix)
    }

    private fun toBitmap(matrix: BitMatrix): Bitmap {
        val width = matrix.width
        val height = matrix.height
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        for (x in 0 until width) {
            for (y in 0 until height) {
                bitmap.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }
        return bitmap
    }
}
