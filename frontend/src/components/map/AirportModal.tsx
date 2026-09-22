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
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
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
          className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface p-5 sm:p-6 text-text shadow-xl backdrop-blur-md"
        >
          {/* 1. Header with Airport code, badges & close button */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-alt text-accent">
                <MapPin size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-2xl font-semibold tracking-tight text-text">
                    {airport.code}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-text-muted">
                    {airport.region} Region
                  </span>
                  <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                    Active Hub
                  </span>
                </div>
                <h3 className="mt-0.5 text-sm font-semibold text-text">{airport.name}</h3>
                <p className="text-xs text-text-muted">{airport.city}, India</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          {/* 2. Key Aviation & Operational Metrics */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-lg border border-border bg-surface-raised p-3 shadow-xs">
              <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                <Plane size={12} className="text-accent" /> Flights Today
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tracking-tight text-text">
                {flightsToday.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[10px] text-text-muted">Daily departures</div>
            </div>

            <div className="rounded-lg border border-border bg-surface-raised p-3 shadow-xs">
              <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                <IndianRupee size={12} className="text-accent" /> Avg Fare
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tracking-tight text-text">
                {formatInr(avgFare)}
              </div>
              <div className="mt-0.5 text-[10px] text-text-muted">Weighted median</div>
            </div>

            <div className="rounded-lg border border-border bg-surface-raised p-3 shadow-xs">
              <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-text-muted">
                <Gauge size={12} className="text-accent" /> Base Index
              </div>
              <div className="mt-1 font-mono text-lg font-semibold tracking-tight text-accent">
                Idx {airport.inflationScore.toFixed(1)}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-muted">
                <CloudSun size={11} /> {weather}
              </div>
            </div>
          </div>

          {/* 3. Top Connected Corridors */}
          <div className="mt-5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-text-muted">
              <span>Top Connected Corridors</span>
              <span className="font-mono text-[10px] font-normal lowercase opacity-75">Click to inspect</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topDestinations.map((dest) => (
                <button
                  key={dest}
                  onClick={() => {
                    onSelectCorridor?.(airport.code, dest)
                    onClose()
                  }}
                  className="group flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text transition-all hover:border-accent hover:bg-surface-alt hover:text-accent shadow-xs"
                >
                  <span className="font-mono font-semibold">{airport.code}</span>
                  <ArrowRight size={12} className="text-text-muted group-hover:text-accent transition-colors" />
                  <span className="font-mono font-semibold">{dest}</span>
                  <span className="ml-1 rounded border border-border bg-surface-alt px-1.5 py-0.2 font-mono text-[10px] text-text-muted group-hover:text-accent">
                    {formatInr(Math.round(avgFare * (dest === 'DEL' ? 1.05 : dest === 'BOM' ? 1.15 : 0.92)))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Onward International Connections */}
          <div className="mt-4 border-t border-border pt-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
              <Globe size={13} className="text-accent" /> Onward International Hubs
            </div>
            <div className="flex flex-wrap gap-2">
              {onwardConnections.map((conn) => (
                <span
                  key={conn}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-alt px-2.5 py-0.5 font-mono text-xs font-medium text-text-muted"
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
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-xs font-medium text-on-accent shadow-sm transition-opacity hover:opacity-95"
          >
            <span>Inspect Primary Corridor ({airport.code} &rarr; {topDestinations[0]})</span>
            <ArrowRight size={14} />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
