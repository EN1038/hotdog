package co.skillsale.print.ui

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import co.skillsale.print.PrinterDevice
import co.skillsale.print.R

@SuppressLint("MissingPermission")
class SelectBluetoothActivity : AppCompatActivity() {
    private lateinit var recyclerView: RecyclerView
    private lateinit var adapter: BtAdapter
    private val devices = mutableListOf<BtAdapter.Item>()

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter
    }

    private val enableBtLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            if (it.resultCode == RESULT_OK) startScan()
        }

    private val receiver =
        object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (BluetoothDevice.ACTION_FOUND != intent.action) return
                val device: BluetoothDevice =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    } ?: return
                val name = device.name ?: return
                val mac = device.address ?: return
                if (devices.any { it.mac == mac }) return
                devices.add(BtAdapter.Item(name, mac, paired = false))
                adapter.notifyItemInserted(devices.lastIndex)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_select_bluetooth)

        recyclerView = findViewById(R.id.recyclerView)
        adapter =
            BtAdapter(devices) { item ->
                val result =
                    Intent().putExtra(
                        EXTRA_DEVICE,
                        PrinterDevice.bluetooth(item.name, item.mac),
                    )
                setResult(RESULT_OK, result)
                finish()
            }
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = adapter

        findViewById<TextView>(R.id.refreshTv).setOnClickListener { ensurePermissionsAndScan() }

        registerReceiver(receiver, IntentFilter(BluetoothDevice.ACTION_FOUND))
        ensurePermissionsAndScan()
    }

    private fun ensurePermissionsAndScan() {
        val needed = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            needed += Manifest.permission.BLUETOOTH_SCAN
            needed += Manifest.permission.BLUETOOTH_CONNECT
        }
        val missing =
            needed.filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ)
            return
        }
        if (!isLocationEnabled() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Toast.makeText(this, "เปิด Location เพื่อสแกน Bluetooth", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
            return
        }
        startScan()
    }

    private fun startScan() {
        val adapterBt = bluetoothAdapter
        if (adapterBt == null) {
            Toast.makeText(this, "อุปกรณ์ไม่รองรับ Bluetooth", Toast.LENGTH_SHORT).show()
            return
        }
        if (!adapterBt.isEnabled) {
            enableBtLauncher.launch(Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE))
            return
        }

        devices.clear()
        adapterBt.bondedDevices.orEmpty().forEach { d ->
            val name = d.name ?: return@forEach
            devices.add(BtAdapter.Item(name, d.address, paired = true))
        }
        adapter.notifyDataSetChanged()

        if (adapterBt.isDiscovering) adapterBt.cancelDiscovery()
        adapterBt.startDiscovery()
    }

    private fun isLocationEnabled(): Boolean {
        val lm = getSystemService(LOCATION_SERVICE) as LocationManager
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            startScan()
        } else if (requestCode == REQ) {
            Toast.makeText(this, R.string.permission_denied, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroy() {
        bluetoothAdapter?.let {
            if (it.isDiscovering) it.cancelDiscovery()
        }
        unregisterReceiver(receiver)
        super.onDestroy()
    }

    companion object {
        const val EXTRA_DEVICE = "EXTRA_DEVICE"
        private const val REQ = 42
    }
}
