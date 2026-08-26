"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconMic, IconPlus } from "@/components/icons";
import {
  adminInputClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import {
  describeQuickAddCommand,
  parseQuickAddMenuCommand,
  QUICK_ADD_MENU_EXAMPLES,
} from "@/lib/quick-add-menu-parse";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: {
    results: ArrayLike<ArrayLike<{ transcript: string }>>;
  }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Props = {
  branchId: string;
  branchName: string;
  onDone?: () => void;
  open: boolean;
  onClose: () => void;
  compact?: boolean;
};

export function QuickAddMenuBar({
  branchId,
  branchName,
  onDone,
  open,
  onClose,
  compact = false,
}: Props) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!open) {
      stopListeningInner();
      return;
    }
    setSpeechSupported(Boolean(getSpeechRecognitionCtor()));
  }, [open]);

  function stopListeningInner() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const preview = useMemo(() => {
    const cmd = parseQuickAddMenuCommand(text);
    if (!cmd) return null;
    return describeQuickAddCommand(cmd, { currentBranchName: branchName });
  }, [text, branchName]);

  function stopListening() {
    stopListeningInner();
  }

  function startListening() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error("เบราว์เซอร์นี้ไม่รองรับเสียง", "พิมพ์แทนได้");
      return;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = "th-TH";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const alt = ev.results[i]?.[0]?.transcript;
        if (alt) parts.push(alt);
      }
      const joined = parts.join(" ").trim();
      if (joined) setText(joined);
    };
    rec.onerror = (ev) => {
      setListening(false);
      if (ev.error === "not-allowed") {
        toast.error("ไม่อนุญาตใช้ไมค์", "เปิดสิทธิ์ไมโครโฟนแล้วลองใหม่");
      } else if (ev.error && ev.error !== "aborted" && ev.error !== "no-speech") {
        toast.error("ฟังเสียงไม่สำเร็จ", "ลองพิมพ์แทน");
      }
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      toast.error("เริ่มฟังเสียงไม่ได้", "ลองพิมพ์แทน");
    }
  }

  async function submit() {
    const raw = text.trim();
    if (!raw) {
      toast.error("พิมพ์หรือพูดคำสั่งก่อน");
      return;
    }
    const cmd = parseQuickAddMenuCommand(raw);
    if (!cmd) {
      toast.error(
        "อ่านคำสั่งไม่รู้เรื่อง",
        'ลองแบบ "ชื่อ ลูกชิ้นปลาย เพิ่มทุกสาขา"',
      );
      return;
    }
    stopListening();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/menu/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: raw, branchId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      const created = data.created ?? 0;
      const skipped = data.skipped ?? 0;
      toast.success(
        `เพิ่ม “${data.name ?? cmd.name}” แล้ว`,
        `สร้าง ${created} สาขา · มีอยู่แล้ว ${skipped}`,
      );
      setText("");
      onDone?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className={`rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white ${
        compact ? "p-3" : "p-3.5"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-extrabold text-slate-900">
            เพิ่มเมนูด่วน
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-slate-500">
            พิมพ์หรือพูด เช่น “ชื่อ ลูกชิ้นปลาย เพิ่มทุกสาขา”
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-600"
          aria-label="ปิดเพิ่มเมนูด่วน"
        >
          <IconClose size={18} />
        </button>
      </div>

      <div className="mt-2.5 flex items-stretch gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="ชื่อ … ราคา 10 เพิ่มทุกสาขา"
          className={`${adminInputClass} flex-1`}
          disabled={busy}
          aria-label="คำสั่งเพิ่มเมนูด่วน"
        />
        {speechSupported ? (
          <button
            type="button"
            onClick={() => (listening ? stopListening() : startListening())}
            disabled={busy}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
              listening
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
            aria-label={listening ? "หยุดฟัง" : "พูดคำสั่ง"}
            title={listening ? "หยุดฟัง" : "พูดคำสั่ง"}
          >
            <IconMic size={18} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
          className={`inline-flex shrink-0 items-center gap-1.5 px-3.5 ${btnPrimary}`}
        >
          <IconPlus size={16} />
          {busy ? "…" : "เพิ่ม"}
        </button>
      </div>

      {preview ? (
        <p className="mt-2 text-[12px] font-semibold text-amber-900">
          จะทำ: {preview}
        </p>
      ) : text.trim() ? (
        <p className="mt-2 text-[12px] font-medium text-rose-600">
          ยังอ่านไม่รู้เรื่อง — ใส่ “ชื่อ …” และ “ทุกสาขา” หรือ “สาขานี้”
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_ADD_MENU_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className={`${btnOutline} !rounded-full !px-2.5 !py-1 !text-[11px]`}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {listening ? (
        <p className="mt-2 text-[12px] font-bold text-rose-700">
          กำลังฟัง… พูดแล้วหยุดเอง หรือกดไมค์อีกครั้ง
        </p>
      ) : null}
    </div>
  );
}
