"use client";

import { CustomerLoginScreen } from "./CustomerLoginScreen";
import { IconClose } from "@/components/icons";

type LoginSheetProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function LoginSheet({ open, onClose, onSuccess }: LoginSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#f5f5f6]">
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-gray-500 shadow-sm hover:bg-white"
          aria-label="ปิด"
        >
          <IconClose size={18} />
        </button>
        <CustomerLoginScreen
          showBackButton={false}
          showBrowseOption={false}
          onSuccess={() => {
            onSuccess?.();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
