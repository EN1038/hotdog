"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  generating?: boolean;
  label?: string;
  required?: boolean;
};

export function StockDocumentNoField({
  value,
  onChange,
  onGenerate,
  generating = false,
  label = "เลขที่เอกสาร",
  required = true,
}: Props) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-600">
        <span>
          {label}
          {required ? " *" : ""}
        </span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 shadow-sm ring-1 ring-emerald-200 disabled:opacity-60"
        >
          {generating ? "…" : "Gen"}
        </button>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="IN-สาขา-202608171400-001"
        required={required}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-[13px] font-bold tracking-tight text-slate-900"
      />
    </label>
  );
}
