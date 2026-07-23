import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function baseProps({ size = 20, className, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    overflow: "visible",
    xmlns: "http://www.w3.org/2000/svg",
    className: className ? `block shrink-0 ${className}` : "block shrink-0",
    "aria-hidden": props["aria-hidden"] ?? true,
    ...props,
  };
}

export function IconBack(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M5 12l4 4 10-10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconRefresh(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M20 12a8 8 0 10-2.3 5.7M20 12V7m0 5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return <IconChevronRight {...props} />;
}

export function IconUser(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      {/* Scale in slightly so stroke isn't clipped by the viewBox edges */}
      <g transform="translate(12 12) scale(0.86) translate(-12 -12)">
        <path
          d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

export function IconPin(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7v5l3 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconNote(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M6 4h12v16l-3-2-3 2-3-2-3 2V4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 8h6M9 12h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconStore(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M4 10h16l-1.2 9H5.2L4 10z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 10V7a4 4 0 018 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconDelivery(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <circle cx="7" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 17h6M5 17H3V9h12v8h-2M15 9l2-4h3v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconBag(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M7 8V6a5 5 0 0110 0v2M5 8h14l-1.2 12H6.2L5 8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconCash(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <rect
        x="3"
        y="6"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function IconBank(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path d="M4 10h16M6 10V18M10 10V18M14 10V18M18 10V18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 10l9-5 9 5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCard(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18M7 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path d="M4 7h16M9 7V5h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M7 7l1 12h8l1-12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 8l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M12 4a4 4 0 00-4 4v2.5L6 13h12l-2-2.5V8a4 4 0 00-4-4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 17a2 2 0 004 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconVolume(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M11 5L6 9H4v6h2l5 4V5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M15.5 9a4.5 4.5 0 010 6M17.5 7a7.5 7.5 0 010 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconVolumeOff(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M11 5L6 9H4v6h2l5 4V5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M18 9l-6 6M12 9l6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPrinter(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M6 9V4h12v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 14H4a2 2 0 01-2-2v-1a2 2 0 012-2h16a2 2 0 012 2v1a2 2 0 01-2 2h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M6 14h12v6H6v-6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMinus(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function IconHome(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconMoney(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.5v9M9.5 10a2.5 2.5 0 015 0c0 1.5-2.5 1.5-2.5 3a2.5 2.5 0 005 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPackage(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function IconReceipt(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M8 4h8v16l-2-1.5L12 20l-2-1.5L8 20V4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 8h4M10 11h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconImage(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="9" cy="10" r="1.75" fill="currentColor" />
      <path
        d="M4.5 16.5l4.5-4.5 3 3 2.5-2.5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconCamera(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M4 8.5A2.5 2.5 0 016.5 6h1.2l1.1-1.6A1.5 1.5 0 0110 3.5h4a1.5 1.5 0 011.2.9L16.3 6h1.2A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.25" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconUpload(props: IconProps) {
  const p = baseProps(props);
  return (
    <svg {...p}>
      <path
        d="M12 16V5m0 0l-4 4m4-4l4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 16.5V18a2 2 0 002 2h12a2 2 0 002-2v-1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** placeholder สำหรับรูปสาขา */
export function IconBranchPlaceholder({ size = 40, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="6" y="10" width="28" height="22" rx="4" fill="#fecaca" />
      <path d="M10 10c0-5 5-8 10-8s10 3 10 8" stroke="#ef4444" strokeWidth="2" fill="#fee2e2" />
      <circle cx="20" cy="22" r="6" fill="#f97316" opacity="0.85" />
      <path d="M14 30h12" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** placeholder สำหรับรูปเมนู */
export function IconSkewerPlaceholder({ size = 40, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden
    >
      <line x1="12" y1="34" x2="16" y2="8" stroke="#a16207" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="6" r="4" fill="#ef4444" />
      <line x1="22" y1="34" x2="24" y2="10" stroke="#a16207" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="8" r="4" fill="#f97316" />
      <line x1="28" y1="34" x2="30" y2="12" stroke="#a16207" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="10" r="3.5" fill="#dc2626" />
    </svg>
  );
}

/** ไอคอน + ข้อความแนวนอน */
export function IconLabel({
  icon: Icon,
  children,
  className = "",
  iconClassName = "text-gray-500",
  size = 16,
}: {
  icon: React.ComponentType<IconProps>;
  children: React.ReactNode;
  className?: string;
  iconClassName?: string;
  size?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon size={size} className={`shrink-0 ${iconClassName}`} />
      <span>{children}</span>
    </span>
  );
}
