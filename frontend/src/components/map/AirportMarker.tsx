import React from 'react'
import type { SourcedAirport } from '../../data/airports'

export const createCreativeAirportMarker = (
  airport: SourcedAirport,
  isSelected: boolean,
  _darkMode?: boolean,
  onClick: (airport: SourcedAirport) => void = () => {},
): HTMLElement => {
  const container = document.createElement('div')
  container.className = 'group relative flex flex-col items-center cursor-pointer select-none'
  container.style.width = '26px'
  container.style.height = '32px'

  const pinColor = isSelected
    ? '#EA580C' // Radiant orange when selected
    : '#0F766E' // Exact deep pine teal requested by user (consistent across themes)

  const pinStroke = isSelected
    ? '#FFFFFF'
    : '#FFFFFF' // Always clean white border (light mode only for map icons)

  const innerCircleFill = isSelected
    ? '#C2410C'
    : '#E6F4F1'

  const planeColor = isSelected
    ? '#FFFFFF'
    : '#0F766E'

  container.innerHTML = `
    <!-- Radar Pulse Ring when Airport Selected -->
    ${
      isSelected
        ? `<div class="absolute top-[26px] left-1/2 -translate-x-1/2 h-7 w-7 rounded-full pointer-events-none animate-ping bg-orange-500/50"></div>
           <div class="absolute top-[29px] left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full pointer-events-none bg-orange-500 ring-4 ring-orange-400/40"></div>`
        : ''
    }

    <!-- Creative Teardrop Airport Location Pin -->
    <div class="relative flex items-center justify-center transition-all duration-200 ${
      isSelected
        ? 'scale-115 -translate-y-1 drop-shadow-[0_4px_8px_rgba(234,88,12,0.45)]'
        : 'group-hover:scale-120 group-hover:-translate-y-1 drop-shadow-md'
    }">
      <svg width="26" height="32" viewBox="0 0 26 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Outer Teardrop Pin Body -->
        <path d="M13 1C7.477 1 3 5.477 3 11C3 18.2 12.1 29.8 12.6 30.5C12.8 30.8 13.2 30.8 13.4 30.5C13.9 29.8 23 18.2 23 11C23 5.477 18.523 1 13 1Z" 
              fill="${pinColor}" 
              stroke="${pinStroke}" 
              stroke-width="1.8"
              stroke-linejoin="round"/>
        
        <!-- Inner Circular Core -->
        <circle cx="13" cy="11" r="6.2" fill="${innerCircleFill}" />
        
        <!-- Ascending Takeoff Airplane Silhouette -->
        <g transform="translate(13, 11) rotate(-35) translate(-12, -12)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="${planeColor}">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
          </svg>
        </g>
      </svg>
    </div>

    <!-- Attached IATA Code Badge (Always Light Mode) -->
    <div class="absolute top-[32px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-tight shadow-sm border transition-all pointer-events-none ${
      isSelected
        ? 'bg-orange-600 text-white border-orange-400 ring-2 ring-orange-400/40 z-20 scale-105'
        : 'bg-white text-slate-900 border-slate-200 shadow-xs group-hover:bg-teal-50 group-hover:text-teal-900 group-hover:border-teal-300'
    }">
      ${airport.code}
    </div>

    <!-- Floating Hover Tooltip (City + IATA + Airport Name - Always Light Mode) -->
    <div class="pointer-events-none absolute bottom-[35px] left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center rounded-xl border px-3 py-1.5 text-xs shadow-xl whitespace-nowrap z-50 backdrop-blur-md transition-all border-slate-200/90 bg-white/95 text-slate-900 shadow-lg">
      <div class="flex items-center gap-1.5 font-extrabold text-[12px]">
        <span class="text-teal-700">${airport.city}</span>
        <span class="font-mono text-[10px] px-1 py-0.2 rounded bg-teal-500/15 text-teal-500">${airport.code}</span>
      </div>
      <div class="text-[10px] text-text-muted font-medium mt-0.5">${airport.name}</div>
      <div class="text-[9px] opacity-75 mt-0.5">APIx Base: <span class="font-mono font-bold">${airport.inflationScore.toFixed(1)}</span> &middot; ${airport.region}</div>
    </div>
  `

  container.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick(airport)
  })

  return container
}

export const AirportMarker: React.FC = () => {
  return null
}


