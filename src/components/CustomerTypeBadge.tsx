type CustomerTypeBadgeProps = {
  isNewCustomer: boolean;
  className?: string;
};

export function CustomerTypeBadge({
  isNewCustomer,
  className = "",
}: CustomerTypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${
        isNewCustomer
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      } ${className}`}
    >
      {isNewCustomer ? "ลูกค้าใหม่" : "ลูกค้าเก่า"}
    </span>
  );
}
