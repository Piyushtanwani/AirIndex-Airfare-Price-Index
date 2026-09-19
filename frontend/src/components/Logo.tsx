import { type SVGProps } from 'react'

interface LogoProps extends SVGProps<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeMap = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
  xl: 'h-14 w-14',
}

export function AirIndexIcon({ size = 'md', className = '', ...props }: LogoProps) {
  const sizeClass = sizeMap[size] || sizeMap.md

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-300 group-hover:scale-105 ${sizeClass} ${className}`}
      aria-hidden="true"
      {...props}
    >
      <defs>
        {/* Background gradient */}
        <linearGradient id="ai-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-accent, #0f5c58)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-accent, #0f5c58)" stopOpacity="0.05" />
        </linearGradient>

        {/* Wing Upper / Light Facet */}
        <linearGradient id="ai-wing-light" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0f5c58" />
          <stop offset="45%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#5eead4" />
        </linearGradient>

        {/* Wing Lower / Depth Facet */}
        <linearGradient id="ai-wing-dark" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#093836" />
          <stop offset="60%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>

        {/* Contrail / Ascent Curve */}
        <linearGradient id="ai-contrail-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity="0" />
          <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#5eead4" stopOpacity="0.95" />
        </linearGradient>

        {/* Statistical Bars Gradient */}
        <linearGradient id="ai-bars-grad" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="var(--color-accent, #0f5c58)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--color-accent, #0f5c58)" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Rounded Squircle Container with Accent Border */}
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="9.5"
        fill="url(#ai-bg-grad)"
        stroke="var(--color-accent, #0f5c58)"
        strokeWidth="1.2"
        strokeOpacity="0.3"
      />

      {/* Statistical Index Basket Bars (7d, 15d, 30d) */}
      <rect x="7" y="23" width="2.5" height="8" rx="1.25" fill="url(#ai-bars-grad)" />
      <rect x="11.5" y="19" width="2.5" height="12" rx="1.25" fill="url(#ai-bars-grad)" />
      <rect x="16" y="15" width="2.5" height="16" rx="1.25" fill="url(#ai-bars-grad)" />

      {/* Ascending Flight Contrail / Price Trend Arc */}
      <path
        d="M 6 31 C 12 31, 16 26, 21 19 C 24 15, 28 10.5, 33 7.5"
        stroke="url(#ai-contrail-grad)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Delta Wing Jet Airframe (Upper Facet) */}
      <path
        d="M 33.5 7 L 12 18 L 22 21 L 33.5 7 Z"
        fill="url(#ai-wing-light)"
      />

      {/* Delta Wing Jet Airframe (Lower Depth Facet) */}
      <path
        d="M 33.5 7 L 22 21 L 24.5 29.5 L 26.8 23.8 L 33.5 7 Z"
        fill="url(#ai-wing-dark)"
      />

      {/* Fuselage Dorsal Highlight */}
      <path
        d="M 33.5 7 L 22 21"
        stroke="#ffffff"
        strokeWidth="0.8"
        strokeOpacity="0.75"
        strokeLinecap="round"
      />

      {/* Apex Indicator Beacon */}
      <circle cx="33.5" cy="7" r="2.4" fill="#5eead4" fillOpacity="0.4" />
      <circle cx="33.5" cy="7" r="1.4" fill="#ffffff" />
    </svg>
  )
}

export function AirIndexLogo({
  size = 'md',
  showText = true,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <AirIndexIcon size={size} />
      {showText && (
        <div className="flex items-center gap-2">
          <span className="font-extrabold tracking-tight text-text">
            Air<span className="bg-gradient-to-r from-accent to-teal-400 bg-clip-text text-transparent">Index</span>
          </span>
          <span className="rounded bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/25">
            APIX
          </span>
        </div>
      )}
    </div>
  )
}
