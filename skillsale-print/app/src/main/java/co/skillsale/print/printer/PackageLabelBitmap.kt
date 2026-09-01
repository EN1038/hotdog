package co.skillsale.print.printer

import android.content.Context
import android.graphics.Bitmap
import org.json.JSONObject

object PackageLabelBitmap {
    fun render(
        context: Context,
        label: PackageLabel,
        layout: JSONObject? = null,
    ): Bitmap {
        val doc = layout ?: PackageLabelLayoutDefaults.defaultLayout()
        return PackageLabelLayoutRenderer.render(context, label, doc)
    }

    fun trimVerticalWhitespace(source: Bitmap, paddingPx: Int = 2): Bitmap {
        val width = source.width
        val height = source.height
        var top = height
        var bottom = 0
        for (y in 0 until height) {
            for (x in 0 until width) {
                if (source.getPixel(x, y) != android.graphics.Color.WHITE) {
                    if (y < top) top = y
                    if (y > bottom) bottom = y
                }
            }
        }
        if (bottom < top) return source
        val cropTop = (top - paddingPx).coerceAtLeast(0)
        val cropBottom = (bottom + paddingPx).coerceAtMost(height - 1)
        val cropHeight = cropBottom - cropTop + 1
        if (cropTop == 0 && cropHeight == height) return source
        val cropped =
            Bitmap.createBitmap(source, 0, cropTop, width, cropHeight)
        if (cropped !== source) source.recycle()
        return cropped
    }
}
