package co.skillsale.print.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import co.skillsale.print.R

class BtAdapter(
    private val items: List<Item>,
    private val onClick: (Item) -> Unit,
) : RecyclerView.Adapter<BtAdapter.Holder>() {
    data class Item(
        val name: String,
        val mac: String,
        val paired: Boolean,
    )

    class Holder(view: View) : RecyclerView.ViewHolder(view) {
        val nameTv: TextView = view.findViewById(R.id.nameTv)
        val macTv: TextView = view.findViewById(R.id.macTv)
        val pairedTv: TextView = view.findViewById(R.id.pairedTv)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view =
            LayoutInflater.from(parent.context)
                .inflate(R.layout.item_select_bluetooth, parent, false)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        val item = items[position]
        holder.nameTv.text = item.name
        holder.macTv.text = item.mac
        holder.pairedTv.visibility = if (item.paired) View.VISIBLE else View.GONE
        holder.itemView.setOnClickListener { onClick(item) }
    }

    override fun getItemCount(): Int = items.size
}
