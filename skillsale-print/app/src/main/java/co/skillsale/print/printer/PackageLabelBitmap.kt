package co.skillsale.print.printer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.common.BitMatrix

object PackageLabelBitmap {
    private const val LABEL_WIDTH = 400

    fun render(context: Context, label: PackageLabel): Bitmap {
        val regular =
            Typeface.createFromAsset(context.assets, "fonts/Kanit-Regular.ttf")
        val bold = Typeface.create(regular, Typeface.BOLD)

        val headerPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 20f
                typeface = bold
            }
        val namePaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.LEFT
                textSize = 22f
                typeface = bold
            }
        val rowPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.LEFT
                textSize = 18f
                typeface = regular
            }
        val codePaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textAlign = Paint.Align.CENTER
                textSize = 16f
                typeface = regular
            }
        val borderPaint =
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                style = Paint.Style.STROKE
                strokeWidth = 2f
            }

        val paddingH = 18f
        val contentWidth = LABEL_WIDTH - paddingH * 2
        val productCode = label.productCode.trim().ifBlank { "—" }
        val productName = label.productName.trim().ifBlank { "—" }
        val nameLines = wrapLines(productName, namePaint, contentWidth, maxLines = 2)

        val barcodeBitmap = encodeBarcode(productCode, 260, 52)
        val qrBitmap = encodeQr(label.qrPayload.trim().ifBlank { label.labelCode }, 136)

        var height = 16f
        height += 26f // header
        height += nameLines.size * 26f
        height += 4 * 22f // detail rows
        height += 12f + barcodeBitmap.height + 20f + qrBitmap.height + 20f

        val bitmap = Bitmap.createBitmap(LABEL_WIDTH, height.toInt(), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        val center = LABEL_WIDTH / 2f
        var y = 22f

        val header = label.brandName.trim().ifBlank { "SKILL SALE" }.uppercase()
        canvas.drawText(header, center, y, headerPaint)
        y += 28f

        for (line in nameLines) {
            canvas.drawText(line, paddingH, y, namePaint)
            y += 26f
        }
        y += 4f

        val rows =
            listOf(
                "รหัส: $productCode",
                "จำนวน: ${label.quantity} ${label.unit.trim().ifBlank { "ชิ้น" }}",
                "วันที่ผลิต: ${label.producedAtLabel.ifBlank { "—" }}",
                "Lot: ${label.lotNumber.trim().ifBlank { "—" }}",
            )
        for (row in rows) {
            canvas.drawText(truncate(row, 32), paddingH, y, rowPaint)
            y += 22f
        }

        y += 10f
        val barcodeLeft = (LABEL_WIDTH - barcodeBitmap.width) / 2f
        canvas.drawBitmap(barcodeBitmap, barcodeLeft, y, null)
        y += barcodeBitmap.height + 18f
        canvas.drawText(productCode, center, y, codePaint)
        y += 14f

        val qrLeft = (LABEL_WIDTH - qrBitmap.width) / 2f
        canvas.drawBitmap(qrBitmap, qrLeft, y + 6f, null)

        canvas.drawRoundRect(
            RectF(8f, 8f, LABEL_WIDTH - 8f, bitmap.height - 8f),
            4f,
            4f,
            borderPaint,
        )

        barcodeBitmap.recycle()
        qrBitmap.recycle()

        return bitmap
    }

    private fun wrapLines(
        text: String,
        paint: Paint,
        maxWidth: Float,
        maxLines: Int,
    ): List<String> {
        if (text.isBlank()) return listOf("—")
        val words = text.split(Regex("\\s+"))
        val lines = mutableListOf<String>()
        var current = ""
        for (word in words) {
            val candidate = if (current.isEmpty()) word else "$current $word"
            if (paint.measureText(candidate) <= maxWidth) {
                current = candidate
            } else {
                if (current.isNotEmpty()) lines.add(current)
                current =
                    if (paint.measureText(word) <= maxWidth) {
                        word
                    } else {
                        breakLongToken(word, paint, maxWidth, lines, maxLines)
                        ""
                    }
                if (lines.size >= maxLines) return finalizeLines(lines, maxLines)
            }
        }
        if (current.isNotEmpty() && lines.size < maxLines) lines.add(current)
        if (lines.isEmpty()) lines.add(truncate(text, 24))
        return finalizeLines(lines, maxLines)
    }

    private fun breakLongToken(
        token: String,
        paint: Paint,
        maxWidth: Float,
        lines: MutableList<String>,
        maxLines: Int,
    ) {
        var chunk = ""
        for (ch in token) {
            val candidate = chunk + ch
            if (paint.measureText(candidate) <= maxWidth) {
                chunk = candidate
            } else {
                if (chunk.isNotEmpty()) {
                    lines.add(chunk)
                    if (lines.size >= maxLines) return
                }
                chunk = ch.toString()
            }
        }
        if (chunk.isNotEmpty() && lines.size < maxLines) lines.add(chunk)
    }

    private fun finalizeLines(lines: List<String>, maxLines: Int): List<String> {
        if (lines.isEmpty()) return listOf("—")
        if (lines.size <= maxLines) return lines
        val trimmed = lines.take(maxLines).toMutableList()
        val last = trimmed.last()
        trimmed[trimmed.lastIndex] =
            if (last.length > 1) last.dropLast(1) + "…" else "…"
        return trimmed
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
