"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BranchDetailPage from "@/app/admin/branches/[id]/page";
import MenuItemEditorPage from "@/app/admin/branches/[id]/menu/[itemId]/page";
import { AdminBranchShellProvider } from "@/components/admin/AdminBranchShellContext";
import { IconBack, IconClose } from "@/components/icons";
import {
  OwnerBranchEmbedProvider,
  type OwnerBranchSettingsSection,
  type OwnerMenuEditorDone,
} from "@/components/owner/OwnerBranchEmbedContext";
import type { OwnerBranchTask } from "@/components/owner/OwnerShopHub";

const TASK_META: Record<
  OwnerBranchTask,
  { title: string; tab: string; section?: OwnerBranchSettingsSection }
> = {
  menu: {
    title: "เมนู",
    tab: "menu",
  },
  staff: {
    title: "พนักงาน",
    tab: "staff",
  },
  hours: {
    title: "เวลาเปิด–ปิด",
    tab: "settings",
    section: "hours",
  },
  branchSettings: {
    title: "ตั้งค่าสาขา",
    tab: "settings",
    section: "branch",
  },
};

type Props = {
  open: boolean;
  branchId: string;
  branchName: string;
  task: OwnerBranchTask;
  onClose: () => void;
};

export function OwnerBranchTaskModal({
  open,
  branchId,
  branchName,
  task,
  onClose,
}: Props) {
  const meta = TASK_META[task];
  const [tab, setTab] = useState(meta.tab);
  const [menuEditorItemId, setMenuEditorItemId] = useState<string | null>(null);
  const [menuReloadToken, setMenuReloadToken] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef(0);

  useEffect(() => {
    if (!open) return;
    setTab(TASK_META[task].tab);
    setMenuEditorItemId(null);
  }, [open, task, branchId]);

  const restoreListScroll = useCallback(() => {
    const top = savedScrollTop.current;
    const apply = () => {
      if (scrollRef.current) scrollRef.current.scrollTop = top;
    };
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
    window.setTimeout(apply, 80);
    window.setTimeout(apply, 280);
  }, []);

  const openMenuEditor = useCallback((itemId: string) => {
    savedScrollTop.current = scrollRef.current?.scrollTop ?? 0;
    setMenuEditorItemId(itemId);
  }, []);

  const closeMenuEditor = useCallback(
    (result?: OwnerMenuEditorDone) => {
      if (result?.saved) {
        setMenuReloadToken((n) => n + 1);
      }
      if (result?.nextTab) {
        setTab(result.nextTab);
      }
      setMenuEditorItemId(null);
      restoreListScroll();
    },
    [restoreListScroll],
  );

  const embedValue = useMemo(
    () => ({
      branchId,
      tab,
      setTab,
      settingsSection: meta.section ?? null,
      hideOuterChrome: true,
      menuEditorItemId,
      openMenuEditor,
      closeMenuEditor,
      menuReloadToken,
    }),
    [
      branchId,
      tab,
      meta.section,
      menuEditorItemId,
      openMenuEditor,
      closeMenuEditor,
      menuReloadToken,
    ],
  );

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const editorOpen = Boolean(menuEditorItemId);
  const editorIsCreate = menuEditorItemId === "new";

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[#eef3f8]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-branch-task-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm">
        <div className="flex min-w-0 items-start gap-2">
          {editorOpen ? (
            <button
              type="button"
              onClick={() => closeMenuEditor()}
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
              aria-label="กลับรายการเมนู"
            >
              <IconBack size={18} />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-slate-500">
              {editorOpen
                ? editorIsCreate
                  ? "เพิ่มเมนู"
                  : "แก้ไขเมนู"
                : meta.title}
            </p>
            <p
              id="owner-branch-task-title"
              className="truncate text-[17px] font-extrabold text-slate-900"
            >
              {branchName}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (editorOpen) {
              closeMenuEditor();
              return;
            }
            onClose();
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 active:bg-slate-200"
          aria-label={editorOpen ? "กลับรายการเมนู" : "ปิด"}
        >
          <IconClose size={16} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <OwnerBranchEmbedProvider value={embedValue}>
          <AdminBranchShellProvider embeddedInOwnerShell>
            <div
              ref={scrollRef}
              className={`h-full overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 ${
                editorOpen ? "invisible pointer-events-none" : ""
              }`}
              aria-hidden={editorOpen}
            >
              <BranchDetailPage />
            </div>

            {editorOpen && menuEditorItemId ? (
              <div className="absolute inset-0 overflow-y-auto bg-[#eef3f8] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
                <MenuItemEditorPage key={menuEditorItemId} />
              </div>
            ) : null}
          </AdminBranchShellProvider>
        </OwnerBranchEmbedProvider>
      </div>
    </div>
  );
}
