package co.skillsale.print

import android.content.Context
import org.json.JSONObject
import java.io.Serializable

data class PrinterDevice(
    val name: String,
    /** Bluetooth MAC or network IP (legacy field kept as address mirror). */
    val mac: String,
    val transport: String = AppPrefs.TRANSPORT_BLUETOOTH,
    /** Preferred connection target: MAC for BT, IP for network. */
    val address: String = mac,
) : Serializable {
    fun type(): String =
        if (transport == AppPrefs.TRANSPORT_NETWORK) {
            AppPrefs.DEVICE_ONE
        } else {
            PrinterRouter.resolveType(name)
        }

    fun toJson(): String =
        JSONObject()
            .put("name", name)
            .put("mac", mac)
            .put("address", address)
            .put("transport", transport)
            .put("type", type())
            .toString()

    companion object {
        fun bluetooth(name: String, mac: String) =
            PrinterDevice(
                name = name,
                mac = mac,
                transport = AppPrefs.TRANSPORT_BLUETOOTH,
                address = mac,
            )

        fun network(ip: String, name: String = "One TPS (Network)") =
            PrinterDevice(
                name = name,
                mac = ip,
                transport = AppPrefs.TRANSPORT_NETWORK,
                address = ip.trim(),
            )

        fun load(context: Context): PrinterDevice? {
            val prefs = context.getSharedPreferences(AppPrefs.PREFS, Context.MODE_PRIVATE)
            val name = prefs.getString(AppPrefs.KEY_PRINTER_NAME, null) ?: return null
            val mac = prefs.getString(AppPrefs.KEY_PRINTER_MAC, null) ?: return null
            if (name.isBlank() || mac.isBlank()) return null
            val transport =
                prefs.getString(AppPrefs.KEY_PRINTER_TRANSPORT, AppPrefs.TRANSPORT_BLUETOOTH)
                    ?: AppPrefs.TRANSPORT_BLUETOOTH
            val address =
                prefs.getString(AppPrefs.KEY_PRINTER_ADDRESS, null)?.takeIf { it.isNotBlank() }
                    ?: mac
            return PrinterDevice(name, mac, transport, address)
        }

        fun save(context: Context, device: PrinterDevice) {
            context.getSharedPreferences(AppPrefs.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(AppPrefs.KEY_PRINTER_NAME, device.name)
                .putString(AppPrefs.KEY_PRINTER_MAC, device.mac)
                .putString(AppPrefs.KEY_PRINTER_TRANSPORT, device.transport)
                .putString(AppPrefs.KEY_PRINTER_ADDRESS, device.address)
                .apply()
        }
    }
}
