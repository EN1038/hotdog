package co.skillsale.print.printer

import android.content.Context
import org.json.JSONObject

object LabelLayoutCache {
    private const val PREFS = "label_layout_cache"

    fun get(
        context: Context,
        brandId: String,
        version: Int,
    ): JSONObject? {
        if (brandId.isBlank()) return null
        val key = cacheKey(brandId, version)
        val raw =
            context
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(key, null)
                ?: return null
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun put(
        context: Context,
        brandId: String,
        version: Int,
        layout: JSONObject,
    ) {
        if (brandId.isBlank()) return
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(cacheKey(brandId, version), layout.toString())
            .apply()
    }

    private fun cacheKey(brandId: String, version: Int): String = "$brandId:v$version"
}
