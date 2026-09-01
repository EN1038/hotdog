package co.skillsale.print.printer

data class PackageLabel(
    val labelCode: String,
    val qrPayload: String,
    val productName: String,
    val productCode: String,
    val brandName: String = "",
    val sourceBranchName: String = "",
    val quantity: Int = 1,
    val unit: String = "ชิ้น",
    val producedAtLabel: String = "",
    val lotNumber: String = "",
    val copies: Int = 1,
)
