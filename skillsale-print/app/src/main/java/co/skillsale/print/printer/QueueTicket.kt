package co.skillsale.print.printer

data class QueueTicket(
    val queueNumber: String,
    val orderNumber: String = "",
    val dateLabel: String = "",
    val roleLabel: String = "",
    val copies: Int = 1,
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
