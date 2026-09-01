package co.skillsale.print

object PrinterRouter {
  /** TSPL sticker printers (e.g. 3R20) — not TPS-80160/80161 POS printers. */
  fun isTscLabelPrinter(bluetoothName: String?): Boolean {
    val name = bluetoothName.orEmpty().uppercase()
    if (name.contains("80160") || name.contains("80161")) return false
    return name.contains("3R20") ||
      name.contains("ZENPERT") ||
      name.contains("TSC")
  }

  fun resolveType(bluetoothName: String?): String {
    val name = bluetoothName.orEmpty().uppercase()
    return when {
      isTscLabelPrinter(name) -> AppPrefs.DEVICE_TSC
      name.contains("TPS") || name.contains("8016") || name.contains("ONE") ->
        AppPrefs.DEVICE_ONE
      else -> AppPrefs.DEVICE_ONE
    }
  }
}
