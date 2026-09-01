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
import org.json.JSONArray
import org.json.JSONObject

object PackageLabelLayoutRenderer {
    fun render(
        context: Context,
        label: PackageLabel,
        layout: JSONObject,
    ): Bitmap {
        val regular =
            Typeface.createFromAsset(context.assets, "fonts/Kanit-Regular.ttf")
        val bold = Typeface.create(regular, Typeface.BOLD)

        val widthPx = layout.optInt("widthPx", 400)
        val paddingH = layout.optDouble("paddingH", 14.0).toFloat()
        val contentWidth = widthPx - paddingH * 2
        val fields = fieldMap(label)
        val blocks = layout.optJSONArray("blocks") ?: JSONArray()

        val paints =
            mapOf(
                "header" to
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.BLACK
                        textAlign = Paint.Align.CENTER
                        textSize = 20f
                        typeface = bold
                    },
                "title" to
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.BLACK
                        textAlign = Paint.Align.LEFT
                        textSize = 22f
                        typeface = bold
                    },
                "row" to
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.BLACK
                        textAlign = Paint.Align.LEFT
                        textSize = 18f
                        typeface = regular
                    },
                "caption" to
                    Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        color = Color.BLACK
                        textAlign = Paint.Align.CENTER
                        textSize = 16f
                        typeface = regular
                    },
            )

        var height = 12f
        val elements = mutableListOf<RenderElement>()

        for (i in 0 until blocks.length()) {
            val block = blocks.optJSONObject(i) ?: continue
            when (block.optString("type")) {
                "text" -> {
                    val style = block.optString("style", "row")
                    val paint = paints[style] ?: paints["row"]!!
                    val align = block.optString("align", "left")
                    val maxLines = block.optInt("maxLines", 1).coerceIn(1, 4)
                    var text =
                        if (block.has("template")) {
                            applyTemplate(block.optString("template"), fields)
                        } else {
                            fieldValue(
                                block.optString("field"),
                                fields,
                                block.optString("fallback", "—"),
                            )
                        }
                    if (block.optBoolean("uppercase", false)) {
                        text = text.uppercase()
                    }
                    val lines =
                        if (style == "title") {
                            wrapLines(text, paint, contentWidth, maxLines)
                        } else {
                            listOf(truncate(text, 40))
                        }
                    val lineHeight = if (style == "title") 24f else 20f
                    lines.forEach { line ->
                        elements.add(TextElement(line, paint, align, paddingH, lineHeight))
                        height += lineHeight
                    }
                }
                "barcode" -> {
                    val field = block.optString("field", "barcodeValue")
                    val value = fieldValue(field, fields, "0")
                    val bw = block.optInt("width", 260)
                    val bh = block.optInt("height", 50)
                    val barcodeBitmap = encodeBarcode(value, bw, bh)
                    val caption =
                        if (block.optBoolean("showCaption", false)) {
                            fieldValue(
                                block.optString("captionField", field),
                                fields,
                                value,
                            )
                        } else {
                            null
                        }
                    elements.add(
                        BarcodeElement(
                            barcodeBitmap,
                            caption,
                            paints["caption"]!!,
                        ),
                    )
                    height += 6f + barcodeBitmap.height + if (caption != null) 24f else 0f
                }
                "qr" -> {
                    val field = block.optString("field", "qrPayload")
                    val size = block.optInt("size", 140)
                    val payload =
                        fieldValue(field, fields, label.labelCode).ifBlank {
                            label.labelCode
                        }
                    val qrBitmap = encodeQr(payload, size)
                    elements.add(QrElement(qrBitmap))
                    height += qrBitmap.height + 8f
                }
                "spacer" -> {
                    val spacer = block.optDouble("height", 4.0).toFloat()
                    elements.add(SpacerElement(spacer))
                    height += spacer
                }
            }
        }

        val bitmap =
            Bitmap.createBitmap(widthPx, height.toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        val center = widthPx / 2f
        var y = 12f

        for (element in elements) {
            when (element) {
                is TextElement -> {
                    val x =
                        when (element.align) {
                            "center" -> center
                            else -> element.paddingH
                        }
                    element.paint.textAlign =
                        if (element.align == "center") Paint.Align.CENTER else Paint.Align.LEFT
                    canvas.drawText(element.text, x, y, element.paint)
                    y += element.lineHeight
                }
                is BarcodeElement -> {
                    y += 6f
                    val left = (widthPx - element.bitmap.width) / 2f
                    canvas.drawBitmap(element.bitmap, left, y, null)
                    y += element.bitmap.height + 14f
                    if (element.caption != null) {
                        canvas.drawText(element.caption, center, y, element.captionPaint)
                        y += 10f
                    }
                    element.bitmap.recycle()
                }
                is QrElement -> {
                    val left = (widthPx - element.bitmap.width) / 2f
                    canvas.drawBitmap(element.bitmap, left, y, null)
                    y += element.bitmap.height.toFloat()
                    element.bitmap.recycle()
                }
                is SpacerElement -> y += element.height
            }
        }

        return PackageLabelBitmap.trimVerticalWhitespace(bitmap, paddingPx = 2)
    }

    private sealed class RenderElement

    private class TextElement(
        val text: String,
        val paint: Paint,
        val align: String,
        val paddingH: Float,
        val lineHeight: Float,
    ) : RenderElement()

    private class BarcodeElement(
        val bitmap: Bitmap,
        val caption: String?,
        val captionPaint: Paint,
    ) : RenderElement()

    private class QrElement(val bitmap: Bitmap) : RenderElement()

    private class SpacerElement(val height: Float) : RenderElement()

    private fun fieldMap(label: PackageLabel): Map<String, String> {
        val productCode = label.productCode.trim().ifBlank { "—" }
        val barcodeValue = productCode.filter { it.isDigit() }.ifBlank { productCode }
        return mapOf(
            "labelCode" to label.labelCode.trim().ifBlank { "—" },
            "qrPayload" to label.qrPayload.trim().ifBlank { label.labelCode },
            "productName" to label.productName.trim().ifBlank { "—" },
            "productCode" to productCode,
            "brandName" to label.brandName.trim().ifBlank { "SKILL SALE" },
            "sourceBranchName" to label.sourceBranchName.trim(),
            "quantity" to label.quantity.toString(),
            "unit" to label.unit.trim().ifBlank { "ชิ้น" },
            "producedAtLabel" to label.producedAtLabel.trim().ifBlank { "—" },
            "lotNumber" to label.lotNumber.trim().ifBlank { "—" },
            "barcodeValue" to barcodeValue,
        )
    }

    private fun fieldValue(
        field: String,
        fields: Map<String, String>,
        fallback: String,
    ): String {
        val value = fields[field]?.trim()
        return if (value.isNullOrEmpty()) fallback else value
    }

    private fun applyTemplate(
        template: String,
        fields: Map<String, String>,
    ): String {
        var out = template
        for ((key, value) in fields) {
            out = out.replace("{{$key}}", value)
        }
        return out
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
                current = word
                if (lines.size >= maxLines) break
            }
        }
        if (current.isNotEmpty() && lines.size < maxLines) lines.add(current)
        if (lines.isEmpty()) lines.add(truncate(text, 24))
        return lines.take(maxLines)
    }

    private fun truncate(
        value: String,
        max: Int,
    ): String {
        val trimmed = value.trim()
        if (trimmed.length <= max) return trimmed
        return trimmed.substring(0, max - 1) + "…"
    }

    private fun encodeQr(
        content: String,
        size: Int,
    ): Bitmap {
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

    private fun encodeBarcode(
        content: String,
        width: Int,
        height: Int,
    ): Bitmap {
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
