import { useId } from "react";

export type Icon3DName =
  | "home"
  | "shield"
  | "card"
  | "coin"
  | "contract"
  | "face"
  | "compass"
  | "sun"
  | "moon"
  | "textSize"
  | "sparkle"
  | "trophy"
  | "key"
  | "chat"
  | "check"
  | "back"
  | "building"
  | "calendar"
  | "heart"
  | "user";

export type Icon3DSize = "sm" | "md" | "lg";

interface Icon3DProps {
  name: Icon3DName;
  size?: Icon3DSize;
  className?: string;
  label?: string;
}

interface PaletteStops {
  top: string;
  mid: string;
  bottom: string;
  glow: string;
}

const ICON_PALETTES: Record<Icon3DName, PaletteStops> = {
  home: { top: "#ff6b85", mid: "#e01442", bottom: "#9b0426", glow: "rgba(217,11,56,0.34)" },
  shield: { top: "#34d399", mid: "#059669", bottom: "#065f46", glow: "rgba(5,150,105,0.34)" },
  card: { top: "#60a5fa", mid: "#2563eb", bottom: "#1e40af", glow: "rgba(37,99,235,0.34)" },
  coin: { top: "#2dd4bf", mid: "#0d9488", bottom: "#115e59", glow: "rgba(13,148,136,0.34)" },
  contract: { top: "#fbbf24", mid: "#d97706", bottom: "#92400e", glow: "rgba(217,119,6,0.34)" },
  face: { top: "#6ee7b7", mid: "#10b981", bottom: "#047857", glow: "rgba(16,185,129,0.34)" },
  compass: { top: "#fb7185", mid: "#e11d48", bottom: "#9f1239", glow: "rgba(225,29,72,0.32)" },
  sun: { top: "#fde047", mid: "#f59e0b", bottom: "#b45309", glow: "rgba(245,158,11,0.34)" },
  moon: { top: "#818cf8", mid: "#4f46e5", bottom: "#312e81", glow: "rgba(79,70,229,0.34)" },
  textSize: { top: "#c084fc", mid: "#9333ea", bottom: "#6b21a8", glow: "rgba(147,51,234,0.34)" },
  sparkle: { top: "#f472b6", mid: "#db2777", bottom: "#9d174d", glow: "rgba(219,39,119,0.34)" },
  trophy: { top: "#fcd34d", mid: "#eab308", bottom: "#a16207", glow: "rgba(234,179,8,0.36)" },
  key: { top: "#38bdf8", mid: "#0284c7", bottom: "#075985", glow: "rgba(2,132,199,0.34)" },
  chat: { top: "#a78bfa", mid: "#7c3aed", bottom: "#5b21b6", glow: "rgba(124,58,237,0.34)" },
  check: { top: "#4ade80", mid: "#16a34a", bottom: "#166534", glow: "rgba(22,163,74,0.36)" },
  back: { top: "#94a3b8", mid: "#475569", bottom: "#1e293b", glow: "rgba(71,85,105,0.30)" },
  building: { top: "#f87171", mid: "#dc2626", bottom: "#991b1b", glow: "rgba(220,38,38,0.32)" },
  calendar: { top: "#38bdf8", mid: "#0369a1", bottom: "#0c4a6e", glow: "rgba(3,105,161,0.32)" },
  heart: { top: "#fb7185", mid: "#e11d48", bottom: "#881337", glow: "rgba(225,29,72,0.35)" },
  user: { top: "#818cf8", mid: "#4f46e5", bottom: "#3730a3", glow: "rgba(79,70,229,0.32)" },
};

const SIZE_PX: Record<Icon3DSize, number> = {
  sm: 28,
  md: 40,
  lg: 52,
};

function renderGlyph(name: Icon3DName) {
  switch (name) {
    case "home":
      return (
        <>
          <path
            d="M17 31.5 32 19l15 12.5V45a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3V31.5Z"
            fill="#ffffff"
          />
          <rect x="28" y="34" width="8" height="14" rx="2" fill="#e01442" fillOpacity="0.88" />
        </>
      );
    case "shield":
      return (
        <>
          <path
            d="M32 16 46 21.5v10.7c0 8.5-5.9 15.1-14 17.8-8.1-2.7-14-9.3-14-17.8V21.5L32 16Z"
            fill="#ffffff"
          />
          <path
            d="m26.5 32.5 3.8 3.8 7.6-8"
            stroke="#059669"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "card":
      return (
        <>
          <rect x="16" y="21" width="32" height="22" rx="4.5" fill="#ffffff" />
          <rect x="16" y="26.5" width="32" height="4.5" fill="#1e40af" fillOpacity="0.85" />
          <rect x="20.5" y="34.5" width="9" height="4" rx="1.5" fill="#60a5fa" />
        </>
      );
    case "coin":
      return (
        <>
          <circle cx="32" cy="32" r="14.5" fill="#ffffff" />
          <circle cx="32" cy="32" r="11" stroke="#0d9488" strokeOpacity="0.32" strokeWidth="2" />
          <path
            d="M25.5 26.5h13M32 26.5v13.5M26.5 32c0-1.6 11-1.6 11 0"
            stroke="#0d9488"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      );
    case "contract":
      return (
        <>
          <rect x="20" y="17" width="24" height="30" rx="4" fill="#ffffff" />
          <path
            d="M25.5 24.5h13M25.5 30.5h13M25.5 36.5h8"
            stroke="#b45309"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <circle cx="40.5" cy="40.5" r="5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
        </>
      );
    case "face":
      return (
        <>
          <circle cx="32" cy="32" r="12.5" fill="#ffffff" />
          <circle cx="27.5" cy="29.5" r="2" fill="#047857" />
          <circle cx="36.5" cy="29.5" r="2" fill="#047857" />
          <path
            d="M27.5 36c1.2 1.8 2.8 2.6 4.5 2.6s3.3-.8 4.5-2.6"
            stroke="#047857"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </>
      );
    case "compass":
      return (
        <>
          <circle cx="32" cy="32" r="14" fill="#ffffff" />
          <path d="m38.5 25.5-4.3 9.7-9.7 4.3 4.3-9.7 9.7-4.3Z" fill="#e11d48" />
          <circle cx="32" cy="32" r="2.2" fill="#ffffff" />
        </>
      );
    case "sun":
      return (
        <>
          <circle cx="32" cy="32" r="8.5" fill="#ffffff" />
          <path
            d="M32 16.5v3.5M32 44v3.5M16.5 32H20M44 32h3.5M21 21l2.5 2.5M40.5 40.5 43 43M43 21l-2.5 2.5M23.5 40.5 21 43"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      );
    case "moon":
      return (
        <path
          d="M38.5 42.5A12.5 12.5 0 0 1 25 22a11.8 11.8 0 0 0 15.8 15.8c.6-.2 1.1.4.8 1a12.5 12.5 0 0 1-3.1 3.7Z"
          fill="#ffffff"
        />
      );
    case "textSize":
      return (
        <>
          <path
            d="M19 42 25.5 22h3L35 42M21.2 35.8h11.6"
            stroke="#ffffff"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M39.5 27v11M34 32.5h11"
            stroke="#f3e8ff"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </>
      );
    case "sparkle":
      return (
        <>
          <path
            d="m32 16 3.5 10.5L46 30l-10.5 3.5L32 44l-3.5-10.5L18 30l10.5-3.5L32 16Z"
            fill="#ffffff"
          />
          <circle cx="44.5" cy="19.5" r="2.6" fill="#fce7f3" />
        </>
      );
    case "trophy":
      return (
        <>
          <path
            d="M23 19h18v9a9 9 0 0 1-18 0v-9Z"
            fill="#ffffff"
          />
          <path
            d="M23 21.5h-4a3 3 0 0 0 0 6h4M41 21.5h4a3 3 0 0 1 0 6h-4M32 37v6M25.5 44.5h13"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      );
    case "key":
      return (
        <>
          <circle cx="25.5" cy="32" r="7" fill="#ffffff" />
          <circle cx="25.5" cy="32" r="2.7" fill="#0284c7" />
          <path
            d="M32 32h13.5M40.5 32v5M44.5 32v3.5"
            stroke="#ffffff"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </>
      );
    case "chat":
      return (
        <>
          <path
            d="M18 23a5 5 0 0 1 5-5h18a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H28l-7.5 5.5V40H23a5 5 0 0 1-5-5V23Z"
            fill="#ffffff"
          />
          <circle cx="26.5" cy="29" r="2" fill="#7c3aed" />
          <circle cx="32" cy="29" r="2" fill="#7c3aed" />
          <circle cx="37.5" cy="29" r="2" fill="#7c3aed" />
        </>
      );
    case "check":
      return (
        <>
          <circle cx="32" cy="32" r="14" fill="#ffffff" />
          <path
            d="m25.5 32.5 4.4 4.4 8.6-9.2"
            stroke="#16a34a"
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "back":
      return (
        <path
          d="M42 32H22m0 0 7.5-7.5M22 32l7.5 7.5"
          stroke="#ffffff"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "building":
      return (
        <>
          <rect x="20" y="17" width="24" height="29" rx="3.5" fill="#ffffff" />
          <rect x="25" y="22" width="4.5" height="4.5" rx="1" fill="#dc2626" />
          <rect x="34.5" y="22" width="4.5" height="4.5" rx="1" fill="#dc2626" />
          <rect x="25" y="30" width="4.5" height="4.5" rx="1" fill="#dc2626" />
          <rect x="34.5" y="30" width="4.5" height="4.5" rx="1" fill="#dc2626" />
          <rect x="29" y="38.5" width="6" height="7.5" rx="1" fill="#991b1b" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="18" y="20" width="28" height="26" rx="4.5" fill="#ffffff" />
          <rect x="18" y="20" width="28" height="8" rx="4" fill="#075985" fillOpacity="0.45" />
          <path
            d="M25 16.5v5M39 16.5v5"
            stroke="#ffffff"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="27" cy="35" r="2.2" fill="#0369a1" />
          <circle cx="32" cy="35" r="2.2" fill="#0369a1" />
          <circle cx="37" cy="35" r="2.2" fill="#0369a1" />
        </>
      );
    case "heart":
      return (
        <path
          d="M32 45.5s-13-7.8-13-17.2a7.5 7.5 0 0 1 13-5 7.5 7.5 0 0 1 13 5c0 9.4-13 17.2-13 17.2Z"
          fill="#ffffff"
        />
      );
    case "user":
      return (
        <>
          <circle cx="32" cy="24.5" r="6.5" fill="#ffffff" />
          <path
            d="M20.5 45a11.5 11.5 0 0 1 23 0"
            fill="#ffffff"
          />
        </>
      );
  }
}

/**
 * Icono táctil moderno en formato 3D (SVG puro con reflejo especular y sombra de profundidad).
 * Garantiza CLS = 0 e IDs de gradiente únicos por instancia mediante React useId().
 */
export function Icon3D({ name, size = "md", className = "", label }: Icon3DProps) {
  const uid = useId().replace(/:/g, "");
  const px = SIZE_PX[size];
  const palette = ICON_PALETTES[name];

  const bgGradId = `i3d-bg-${uid}`;
  const glossGradId = `i3d-gloss-${uid}`;
  const shadowFilterId = `i3d-shadow-${uid}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
      style={{ width: px, height: px }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        className="overflow-visible"
        style={{ filter: `drop-shadow(0 6px 10px ${palette.glow})` }}
      >
        <defs>
          <linearGradient id={bgGradId} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={palette.top} />
            <stop offset="52%" stopColor={palette.mid} />
            <stop offset="100%" stopColor={palette.bottom} />
          </linearGradient>
          <linearGradient id={glossGradId} x1="32" y1="4" x2="32" y2="30" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.52" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id={shadowFilterId} x="-10%" y="-10%" width="120%" height="125%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.4" floodColor="#000000" floodOpacity="0.24" />
          </filter>
        </defs>

        {/* Base clay/glass 3D squircle */}
        <rect x="4" y="4" width="56" height="56" rx="18" fill={`url(#${bgGradId})`} />
        {/* Borde interior luminoso superior */}
        <rect
          x="5.2"
          y="5.2"
          width="53.6"
          height="53.6"
          rx="16.8"
          stroke="#ffffff"
          strokeOpacity="0.34"
          strokeWidth="1.4"
        />
        {/* Brillo especular 3D superior */}
        <path
          d="M18 7.5h28c6.5 0 10.5 4 10.5 10.5v5.5c-15 5.2-34 5.2-49 0V18c0-6.5 4-10.5 10.5-10.5Z"
          fill={`url(#${glossGradId})`}
        />
        {/* Símbolo en relieve frontal */}
        <g filter={`url(#${shadowFilterId})`}>{renderGlyph(name)}</g>
      </svg>
    </span>
  );
}
