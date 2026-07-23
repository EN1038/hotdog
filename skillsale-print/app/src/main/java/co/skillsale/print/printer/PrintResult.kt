package co.skillsale.print.printer

data class PrintResult(
    val code: String,
    val message: String,
) {
    fun toJson(): String =
        """{"code":"$code","message":${org.json.JSONObject.quote(message)}}"""

    companion object {
        fun ok(message: String = "SUCCESS") = PrintResult("1", message)
        fun fail(message: String) = PrintResult("-1", message)
    }
}
