"use client";

type AdminToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
};

export function AdminToggle({
  checked,
  onChange,
  label,
  disabled = false,
  size = "sm",
}: AdminToggleProps) {
  const track = size === "md" ? "h-6 w-11" : "h-5 w-9";
  const knob = size === "md" ? "h-5 w-5" : "h-4 w-4";
  const knobOn = size === "md" ? "translate-x-5" : "translate-x-4";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-site-primary-soft bg-site-primary-soft text-site-primary"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      <span
        className={`relative inline-flex shrink-0 items-center rounded-full transition ${track} ${
          checked ? "bg-site-primary" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block rounded-full bg-white shadow transition ${knob} ${
            checked ? knobOn : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
