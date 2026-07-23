package co.skillsale.print

object PrinterRouter {
    fun resolveType(bluetoothName: String?): String {
        val name = bluetoothName.orEmpty().uppercase()
        return when {
            name.contains("3R20") || name.contains("ZENPERT") || name.contains("TSC") ->
                AppPrefs.DEVICE_TSC
            name.contains("TPS") || name.contains("8016") || name.contains("ONE") ->
                AppPrefs.DEVICE_ONE
            else -> AppPrefs.DEVICE_ONE
        }
    }
}
