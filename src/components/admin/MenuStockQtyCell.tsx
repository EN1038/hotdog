"use client";

type Props = {
  quantity: number;
  stockTracked: boolean;
  className?: string;
};

/** Same qty as จัดการสต๊อก tab — BranchMenuItemStock.quantity */
export function MenuStockQtyCell({
  quantity,
  stockTracked,
  className = "px-3 py-2.5 text-right tabular-nums align-top",
}: Props) {
  return (
    <td className={className}>
      {quantity.toLocaleString("th-TH")}
      {!stockTracked ? (
        <span
          className="mt-0.5 block text-[10px] font-normal text-gray-400"
          title="ยังไม่เคยรับเข้า/ปรับยอดในระบบ — แสดง 0"
        >
          ยังไม่รับเข้า
        </span>
      ) : null}
    </td>
  );
}
