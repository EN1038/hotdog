package co.skillsale.print.ui

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import co.skillsale.print.AppPrefs
import co.skillsale.print.PrinterDevice
import co.skillsale.print.R

class SelectPrinterActivity : AppCompatActivity() {
    private lateinit var currentTv: TextView
    private lateinit var ipInput: EditText

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
                        Intent().putExtra(EXTRA_DEVICE, PrinterDevice.bluetooth(device.name, device.mac)),
                    )
                    finish()
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_select_printer)

        currentTv = findViewById(R.id.currentTv)
        ipInput = findViewById(R.id.ipInput)

        val current = PrinterDevice.load(this)
        currentTv.text =
            if (current == null) {
                getString(R.string.no_printer_selected)
            } else {
                getString(
                    R.string.current_printer,
                    current.name,
                    current.transport,
                    current.address,
                )
            }

        ipInput.setText(
            when {
                current?.transport == AppPrefs.TRANSPORT_NETWORK -> current.address
                else -> AppPrefs.DEFAULT_ONE_IP
            },
        )

        findViewById<Button>(R.id.bluetoothBtn).setOnClickListener {
            bluetoothLauncher.launch(Intent(this, SelectBluetoothActivity::class.java))
        }

        findViewById<Button>(R.id.saveIpBtn).setOnClickListener {
            val ip = ipInput.text?.toString()?.trim().orEmpty()
            if (!isValidIpv4(ip)) {
                Toast.makeText(this, R.string.invalid_ip, Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            val device = PrinterDevice.network(ip)
            setResult(RESULT_OK, Intent().putExtra(EXTRA_DEVICE, device))
            finish()
        }
    }

    private fun isValidIpv4(ip: String): Boolean {
        if (!Patterns.IP_ADDRESS.matcher(ip).matches()) return false
        val parts = ip.split(".")
        if (parts.size != 4) return false
        return parts.all { p ->
            val n = p.toIntOrNull() ?: return@all false
            n in 0..255
        }
    }

    companion object {
        const val EXTRA_DEVICE = "EXTRA_DEVICE"
    }
}
