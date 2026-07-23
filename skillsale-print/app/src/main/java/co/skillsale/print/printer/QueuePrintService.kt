package co.skillsale.print.printer

import android.content.Context
import co.skillsale.print.AppPrefs
import co.skillsale.print.PrinterDevice
import co.skillsale.print.PrinterRouter

class QueuePrintService(private val context: Context) {
    private val onePrinter = OneQueuePrinter(context)
    private val tscPrinter = TscQueuePrinter()

    fun closeAll() {
        onePrinter.close()
        tscPrinter.close()
    }

    fun printQueueNumber(queueNumber: String): PrintResult {
        val device = PrinterDevice.load(context)
            ?: return PrintResult.fail("ยังไม่ได้เลือกเครื่องพิมพ์")
        val q = queueNumber.trim()
        if (q.isEmpty()) {
            return PrintResult.fail("ไม่มีเลขคิว")
        }

        if (device.transport == AppPrefs.TRANSPORT_NETWORK) {
            tscPrinter.close()
            return onePrinter.printQueueNumber(
                q,
                AppPrefs.TRANSPORT_NETWORK,
                device.address,
            )
        }

        return when (PrinterRouter.resolveType(device.name)) {
            AppPrefs.DEVICE_TSC -> {
                onePrinter.close()
                tscPrinter.printQueueNumber(q, device.address)
            }
            else -> {
                tscPrinter.close()
                onePrinter.printQueueNumber(
                    q,
                    AppPrefs.TRANSPORT_BLUETOOTH,
                    device.address,
                )
            }
        }
    }
}
