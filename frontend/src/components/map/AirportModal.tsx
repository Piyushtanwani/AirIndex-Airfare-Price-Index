import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, Plane, IndianRupee, CloudSun, Globe, ArrowRight, Gauge } from 'lucide-react'
import type { SourcedAirport } from '../../data/airports'
import { formatInr } from '../../lib/format'

interface AirportModalProps {
  airport: SourcedAirport | null
  darkMode?: boolean
  onClose: () => void
  onSelectCorridor?: (origin: string, dest: string) => void
}

export const AirportModal: React.FC<AirportModalProps> = ({
  airport,
  onClose,
  onSelectCorridor,
}) => {
  if (!airport) return null

  const flightsToday = airport.code === 'DEL' ? 1420 : airport.code === 'BOM' ? 1180 : 420
  const avgFare = airport.code === 'DEL' ? 6850 : airport.code === 'BOM' ? 7120 : 5400
  const defaultDestinations = ['DEL', 'BOM', 'BLR', 'HYD', 'CCU', 'MAA']
  const topDestinations = (
    airport.code === 'DEL'
      ? ['BOM', 'BLR', 'CCU', 'HYD', 'GAU']
      : airport.code === 'BOM'
        ? ['DEL', 'BLR', 'HYD', 'MAA', 'GOI']
        : defaultDestinations.filter((c) => c !== airport.code)
  ).slice(0, 4)
  const onwardConnections = ['DXB', 'LHR', 'SIN', 'JFK']
  const weather = '28°C Clear'

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        {/* Soft Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        />

        {/* Modal Window Centered via Flexbox */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 14 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="relative z-10 w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-surface p-4 sm:p-6 text-text shadow-xl backdrop-blur-md"
        >
          {/* 1. Header with Airport code, badges & close button */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-alt text-accent">
                <MapPin size={18} className="sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-semibold tracking-tight text-text">
                    {airport.code}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-alt px-2 py-0.2 sm:px-2.5 sm:py-0.5 text-[10px] sm:text-xs font-medium text-text-muted">
                    {airport.region} Region
                  </span>
                  <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.2 sm:px-2.5 sm:py-0.5 text-[10px] sm:text-xs font-medium text-accent">
                    Active Hub
                  </span>
                </div>
                <h3 className="mt-0.5 text-xs sm:text-sm font-semibold text-text truncate">{airport.name}</h3>
                <p className="text-[11px] sm:text-xs text-text-muted">{airport.city}, India</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-alt hover:text-text cursor-pointer shrink-0"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          {/* 2. Key Aviation & Operational Metrics */}
          <div className="mt-4 grid grid-cols-3 gap-1.5 sm:gap-2.5">
            <div className="rounded-lg border border-border bg-surface-raised p-2 sm:p-3 shadow-xs min-w-0">
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
                <Plane size={11} className="text-accent shrink-0" /> <span className="truncate">Flights</span>
              </div>
              <div className="mt-1 font-mono text-sm sm:text-lg font-semibold tracking-tight text-text truncate">
                {flightsToday.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[9px] sm:text-[10px] text-text-muted truncate">Departures</div>
            </div>

            <div className="rounded-lg border border-border bg-surface-raised p-2 sm:p-3 shadow-xs min-w-0">
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
                <IndianRupee size={11} className="text-accent shrink-0" /> <span className="truncate">Avg Fare</span>
              </div>
              <div className="mt-1 font-mono text-sm sm:text-lg font-semibold tracking-tight text-text truncate">
                {formatInr(avgFare)}
              </div>
              <div className="mt-0.5 text-[9px] sm:text-[10px] text-text-muted truncate">Weighted median</div>
            </div>

            <div className="rounded-lg border border-border bg-surface-raised p-2 sm:p-3 shadow-xs min-w-0">
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
                <Gauge size={11} className="text-accent shrink-0" /> <span className="truncate">Base Index</span>
              </div>
              <div className="mt-1 font-mono text-sm sm:text-lg font-semibold tracking-tight text-accent truncate">
                Idx {airport.inflationScore.toFixed(1)}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[9px] sm:text-[10px] text-text-muted truncate">
                <CloudSun size={10} className="shrink-0" /> <span className="truncate">{weather}</span>
              </div>
            </div>
          </div>

          {/* 3. Top Connected Corridors */}
          <div className="mt-4 sm:mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-muted">
              <span>Top Connected Corridors</span>
              <span className="font-mono text-[10px] font-normal lowercase opacity-75">Click to inspect</span>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {topDestinations.map((dest) => (
                <button
                  key={dest}
                  onClick={() => {
                    onSelectCorridor?.(airport.code, dest)
                    onClose()
                  }}
                  className="group flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 sm:px-3 text-xs font-medium text-text transition-all hover:border-accent hover:bg-surface-alt hover:text-accent shadow-xs cursor-pointer"
                >
                  <span className="font-mono font-semibold">{airport.code}</span>
                  <ArrowRight size={11} className="text-text-muted group-hover:text-accent transition-colors" />
                  <span className="font-mono font-semibold">{dest}</span>
                  <span className="ml-0.5 rounded border border-border bg-surface-alt px-1.5 py-0.2 font-mono text-[10px] text-text-muted group-hover:text-accent">
                    {formatInr(Math.round(avgFare * (dest === 'DEL' ? 1.05 : dest === 'BOM' ? 1.15 : 0.92)))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Onward International Connections */}
          <div className="mt-3.5 border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <Globe size={13} className="text-accent" /> Onward International Hubs
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {onwardConnections.map((conn) => (
                <span
                  key={conn}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-2.5 py-0.5 font-mono text-[11px] sm:text-xs font-medium text-text-muted"
                >
                  <Plane size={11} className="text-accent rotate-45" /> {conn}
                </span>
              ))}
            </div>
          </div>

          {/* 5. Direct View Action */}
          <button
            onClick={() => {
              onSelectCorridor?.(airport.code, topDestinations[0])
              onClose()
            }}
            className="mt-4 sm:mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 px-3 text-xs font-medium text-on-accent shadow-sm transition-opacity hover:opacity-95 cursor-pointer text-center"
          >
            <span className="truncate">Inspect Primary Corridor ({airport.code} &rarr; {topDestinations[0]})</span>
            <ArrowRight size={14} className="shrink-0" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
