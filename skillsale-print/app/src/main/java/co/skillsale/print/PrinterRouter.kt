package co.skillsale.print

object PrinterRouter {
  /** Zenpert TSC label printers — not receipt printers such as TPS-80161. */
  fun isTscLabelPrinter(bluetoothName: String?): Boolean {
    val name = bluetoothName.orEmpty().uppercase()
    if (name.contains("80161")) return false
    return name.contains("3R20") ||
      name.contains("ZENPERT") ||
      name.contains("TSC") ||
      name.contains("80160")
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
