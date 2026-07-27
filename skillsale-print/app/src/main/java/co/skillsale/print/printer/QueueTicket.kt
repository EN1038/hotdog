package co.skillsale.print.printer

data class QueueTicket(
    val queueNumber: String,
    val orderNumber: String = "",
    val dateLabel: String = "",
    val roleLabel: String = "",
    val copies: Int = 1,
    val staffName: String = "",
    val orderType: String = "",
    val items: List<QueueTicketItem> = emptyList(),
    val subtotal: Double = 0.0,
    val discount: Double = 0.0,
    val paymentMethod: String = "",
    val amountReceived: Double = 0.0,
    val change: Double = 0.0,
    val totalAmount: Double = 0.0,
    val brandName: String = "",
    val branchName: String = "",
    val branchAddress: String = "",
) {
    companion object {
        fun roleForIndex(index: Int, total: Int): String {
            if (total <= 1) return ""
            return when (index) {
                0 -> "ร้าน"
                1 -> "ลูกค้า"
                else -> "สำเนา ${index + 1}"
            }
        }
    }
}

data class QueueTicketItem(
    val name: String,
    val qty: Int,
    val price: Double,
    val total: Double
)
