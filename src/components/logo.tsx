import type { SVGProps } from "react";

/** Pulse waveform logo mark — violet → cyan gradient */
export function PulseLogo({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="pulse-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#06d6c7" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* Waveform path: flat → spike up → down → flat */}
      <path
        d="M2 16 L8 16 L10 8 L13 24 L16 11 L19 20 L21 16 L30 16"
        stroke="url(#pulse-logo-grad)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Compact wordmark: logo + "Pulse" text */
export function PulseWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <PulseLogo size={22} />
      <span
        className="text-[15px] font-bold tracking-tight text-white"
        style={{ letterSpacing: "-0.03em" }}
      >
        Pulse
      </span>
    </span>
  );
}
