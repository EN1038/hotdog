/** Subtle curved-line decoration for the owner dashboard header */
export function OwnerDashboardHeaderDecor() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]"
      viewBox="0 0 400 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <path
        d="M-20 80 Q80 20 180 60 T380 40"
        fill="none"
        stroke="#34d399"
        strokeWidth="1.5"
      />
      <path
        d="M-10 100 Q100 50 200 85 T390 65"
        fill="none"
        stroke="#6ee7b7"
        strokeWidth="1"
      />
      <path
        d="M320 10 Q360 50 400 30"
        fill="none"
        stroke="#34d399"
        strokeWidth="1"
        opacity="0.6"
      />
      <circle cx="340" cy="85" r="28" fill="#34d399" opacity="0.06" />
      <circle cx="60" cy="30" r="18" fill="#6ee7b7" opacity="0.08" />
    </svg>
  );
}
