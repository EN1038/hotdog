package co.skillsale.print.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import co.skillsale.print.AppPrefs
import co.skillsale.print.PrinterDevice
import co.skillsale.print.R

/** Bluetooth printer picker only (no network/IP). */
class SelectPrinterActivity : AppCompatActivity() {
    private val bluetoothLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == RESULT_OK) {
                @Suppress("DEPRECATION")
                val device =
                    result.data?.getSerializableExtra(SelectBluetoothActivity.EXTRA_DEVICE)
                        as? PrinterDevice
                if (device != null) {
                    setResult(
                        RESULT_OK,
                        Intent().putExtra(
                            EXTRA_DEVICE,
                            PrinterDevice.bluetooth(device.name, device.mac),
                        ),
                    )
                    finish()
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_select_printer)

        val currentTv = findViewById<TextView>(R.id.currentTv)
        val current = PrinterDevice.load(this)
        currentTv.text =
            when {
                current == null || current.transport == AppPrefs.TRANSPORT_NETWORK ->
                    getString(R.string.no_printer_selected)
                else ->
                    getString(
                        R.string.current_printer,
                        current.name,
                        "bluetooth",
                        current.address,
                    )
            }

        findViewById<Button>(R.id.bluetoothBtn).setOnClickListener {
            bluetoothLauncher.launch(Intent(this, SelectBluetoothActivity::class.java))
        }

        // Jump straight into scan when nothing configured
        if (current == null || current.transport == AppPrefs.TRANSPORT_NETWORK) {
            bluetoothLauncher.launch(Intent(this, SelectBluetoothActivity::class.java))
        }
    }

    companion object {
        const val EXTRA_DEVICE = "EXTRA_DEVICE"
    }
}
