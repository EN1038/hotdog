"use client";

import { useEffect, useRef } from "react";
import { adminLabelClass } from "@/components/admin/AdminShell";

/** Lightweight rich text for brand blurbs — stores HTML string. */
export function SimpleRichTextEditor({
  label = "รายละเอียด",
  hint,
  value,
  onChange,
  placeholder = "แนะนำร้าน สั้นๆ…",
}: {
  label?: string;
  hint?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function run(cmd: string) {
    document.execCommand(cmd, false);
    onChange(ref.current?.innerHTML ?? "");
    ref.current?.focus();
  }

  return (
    <div>
      <label className={adminLabelClass}>{label}</label>
      {hint ? (
        <p className="mb-2 text-[11px] leading-snug text-slate-500">{hint}</p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
          {(
            [
              ["bold", "ตัวหนา"],
              ["italic", "ตัวเอียง"],
              ["insertUnorderedList", "หัวข้อย่อย"],
            ] as const
          ).map(([cmd, title]) => (
            <button
              key={cmd}
              type="button"
              title={title}
              onMouseDown={(e) => {
                e.preventDefault();
                run(cmd);
              }}
              className="rounded-md px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-white"
            >
              {cmd === "bold" ? "B" : cmd === "italic" ? "I" : "• รายการ"}
            </button>
          ))}
        </div>
        <div
          ref={ref}
          contentEditable
          role="textbox"
          aria-label={label}
          data-placeholder={placeholder}
          className="min-h-[7.5rem] px-3 py-2.5 text-sm leading-relaxed text-slate-900 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]"
          onInput={() => onChange(ref.current?.innerHTML ?? "")}
          onBlur={() => onChange(ref.current?.innerHTML ?? "")}
        />
      </div>
    </div>
  );
}
