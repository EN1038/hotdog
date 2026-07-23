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

    fun printQueueTickets(ticket: QueueTicket): PrintResult {
        val device = PrinterDevice.load(context)
            ?: return PrintResult.fail("ยังไม่ได้เลือกเครื่องพิมพ์")
        // Migrate away from legacy network saves
        if (device.transport == AppPrefs.TRANSPORT_NETWORK) {
            return PrintResult.fail("กรุณาเลือกเครื่องพิมพ์ Bluetooth ใหม่")
        }
        val q = ticket.queueNumber.trim()
        if (q.isEmpty()) return PrintResult.fail("ไม่มีเลขคิว")

        val normalized =
            ticket.copy(
                queueNumber = q,
                copies = ticket.copies.coerceIn(1, 5),
            )

        return when (PrinterRouter.resolveType(device.name)) {
            AppPrefs.DEVICE_TSC -> {
                onePrinter.close()
                tscPrinter.printTickets(normalized, device.address)
            }
            else -> {
                tscPrinter.close()
                onePrinter.printTickets(normalized, device.address)
            }
        }
    }

    fun printQueueNumber(queueNumber: String): PrintResult =
        printQueueTickets(QueueTicket(queueNumber = queueNumber, copies = 1))
}
