import React from 'react'
import type { SourcedAirport } from '../../data/airports'

export const createAirportMarkerElement = (
  airport: SourcedAirport,
  onClick: (airport: SourcedAirport) => void,
): HTMLElement => {
  const el = document.createElement('div')
  el.className = 'group relative flex cursor-pointer items-center justify-center'
  el.style.width = '24px'
  el.style.height = '24px'

  el.innerHTML = `
    <!-- Crisp Black Dot with White Outline -->
    <div class="relative h-3 w-3 rounded-full border-2 border-white bg-[#1A202C] shadow-md transition-transform duration-200 group-hover:scale-125"></div>
    
    <!-- IATA Code Label -->
    <div class="absolute -bottom-4 whitespace-nowrap font-mono text-[10px] font-bold text-[#2D3748] bg-white/80 px-1 py-0.2 rounded shadow-sm transition group-hover:text-black group-hover:scale-105">
      ${airport.code}
    </div>

    <!-- Hover Floating Tooltip (City + APIx) -->
    <div class="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:-translate-y-1 z-50">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-800 shadow-lg min-w-[120px]">
        <div class="text-[11px] font-bold text-slate-900">${airport.city} (${airport.code})</div>
        <div class="flex items-center justify-between mt-1 text-[10px]">
          <span class="text-slate-500 font-medium">Index APIx:</span>
          <span class="font-mono text-slate-900 font-bold">${airport.inflationScore}</span>
        </div>
      </div>
    </div>
  `

  el.addEventListener('click', () => onClick(airport))

  return el
}

export const AirportMarker: React.FC = () => {
  return null
}
