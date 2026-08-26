"use client";

import { useEffect, useMemo, useState } from "react";

export type AdminBranchTabGroup = {
  id: string;
  label: string;
  tabIds: string[];
};

export type AdminBranchTab = {
  id: string;
  label: string;
};

type TabAttention = {
  tone?: "warn" | "info";
  title?: string;
  badge?: string | number;
};

type Props = {
  groups: AdminBranchTabGroup[];
  tabsById: Record<string, AdminBranchTab>;
  activeTab: string;
  hiddenTabIds: Set<string>;
  onTabChange: (tabId: string) => void;
  getTabAttention?: (tabId: string) => TabAttention | null;
};

function groupForTab(groups: AdminBranchTabGroup[], tabId: string): string {
  for (const group of groups) {
    if (group.tabIds.includes(tabId)) return group.id;
  }
  return groups[0]?.id ?? "sales";
}

export function AdminBranchMobileTabNav({
  groups,
  tabsById,
  activeTab,
  hiddenTabIds,
  onTabChange,
  getTabAttention,
}: Props) {
  const [mobileGroup, setMobileGroup] = useState(() =>
    groupForTab(groups, activeTab),
  );

  useEffect(() => {
    setMobileGroup(groupForTab(groups, activeTab));
  }, [activeTab, groups]);

  const visibleTabs = useMemo(() => {
    const group = groups.find((g) => g.id === mobileGroup) ?? groups[0];
    if (!group) return [];
    return group.tabIds
      .filter((tabId) => !hiddenTabIds.has(tabId))
      .map((tabId) => tabsById[tabId])
      .filter(Boolean);
  }, [groups, hiddenTabIds, mobileGroup, tabsById]);

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-200/80 p-1"
        role="tablist"
        aria-label="กลุ่มเมนูสาขา"
      >
        {groups.map((group) => {
          const hasVisible = group.tabIds.some((id) => !hiddenTabIds.has(id));
          if (!hasVisible) return null;
          const selected = mobileGroup === group.id;
          return (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMobileGroup(group.id)}
              className={`rounded-xl px-1 py-2.5 text-[12px] font-extrabold transition active:scale-[0.98] ${
                selected
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600"
              }`}
            >
              {group.label}
            </button>
          );
        })}
      </div>

      <div className="-mx-1 overflow-x-auto filter-scroll-row px-1">
        <div className="flex min-w-max items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            const attention = getTabAttention?.(tab.id) ?? null;
            const warn = attention?.tone === "warn";
            const info = attention?.tone === "info";
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                title={attention?.title}
                aria-label={
                  attention ? `${tab.label} — ${attention.title}` : tab.label
                }
                className={`relative inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[13px] transition ${
                  active
                    ? "bg-site-primary font-semibold text-white shadow-sm"
                    : warn
                      ? "font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
                      : info
                        ? "font-medium text-sky-800 ring-1 ring-inset ring-sky-200"
                        : "font-medium text-slate-600"
                }`}
              >
                <span>{tab.label}</span>
                {attention?.badge ? (
                  <span
                    className={`inline-flex min-w-[1.1rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                      active
                        ? "bg-white/95 text-site-primary"
                        : warn
                          ? "bg-amber-500 text-white"
                          : "bg-sky-500 text-white"
                    }`}
                  >
                    {attention.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
