import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FlightData } from '../../types/flight'
import { formatInr, formatIndex } from '../../lib/format'
import {
  X,
  Plane,
  ArrowRight,
  TrendingUp,
  Clock,
  Calendar,
  AlertCircle,
  ArrowUpDown,
} from 'lucide-react'

interface AlternativeFlightsDrawerProps {
  isOpen: boolean
  selectedFlight: FlightData | null
  allFlights: FlightData[]
  darkMode?: boolean
  onSelectFlight: (flight: FlightData) => void
  onClose: () => void
}

export const AlternativeFlightsDrawer: React.FC<AlternativeFlightsDrawerProps> = ({
  isOpen,
  selectedFlight,
  allFlights,
  onSelectFlight,
  onClose,
}) => {
  const [sortBy, setSortBy] = useState<'departure' | 'fare'>('departure')

  const origin = selectedFlight?.origin || 'AMD'
  const destination = selectedFlight?.destination || 'DEL'

  // Filter alternative flights for the same corridor
  const alternatives = useMemo(() => {
    if (!selectedFlight) return []

    const orig = selectedFlight.origin
    const dest = selectedFlight.destination
    const currentFlightNo = selectedFlight.flightNo || selectedFlight.flightNumber

    const matched = allFlights.filter(
      (f) =>
        f.origin === orig &&
        f.destination === dest &&
        (f.flightNo || f.flightNumber) !== currentFlightNo &&
        f.status !== 'cancelled',
    )

    return matched.sort((a, b) => {
      if (sortBy === 'fare') {
        return a.cheapestFare - b.cheapestFare
      }
      return a.departureTime.localeCompare(b.departureTime)
    })
  }, [selectedFlight, allFlights, sortBy])

  if (!isOpen || !selectedFlight) return null

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-xs"
      />

      {/* Right Drawer (420px on desktop, full-width on mobile) */}
      <motion.aside
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        aria-label="Alternative Flights Drawer"
        className="fixed right-0 top-0 sm:top-20 z-[60] sm:z-50 flex h-full sm:h-[calc(100vh-5rem)] w-full max-w-full sm:max-w-[420px] flex-col overflow-y-auto border-l border-border bg-surface p-4 sm:p-6 text-text shadow-2xl backdrop-blur-md sm:w-[420px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-text-muted">
                Corridor Rebooking
              </span>
            </div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-text">Alternative Flights</h3>
            <p className="mt-0.5 text-xs font-medium text-text-muted">
              {origin} &rarr; {destination} &middot; {alternatives.length} available today
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sort Controls */}
        {alternatives.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
            <span className="font-medium text-text">Available Options</span>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown size={12} className="text-text-muted" />
              <button
                onClick={() => setSortBy('departure')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === 'departure'
                    ? 'border border-accent/40 bg-accent/10 text-accent'
                    : 'border border-border bg-surface-alt text-text-muted hover:text-text'
                }`}
              >
                Earliest
              </button>
              <button
                onClick={() => setSortBy('fare')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  sortBy === 'fare'
                    ? 'border border-accent/40 bg-accent/10 text-accent'
                    : 'border border-border bg-surface-alt text-text-muted hover:text-text'
                }`}
              >
                Cheapest
              </button>
            </div>
          </div>
        )}

        {/* Flight Cards List */}
        <div className="mt-4 space-y-3">
          {alternatives.length > 0 ? (
            alternatives.map((flight, idx) => {
              const flNo = flight.flightNo || flight.flightNumber || flight.id
              return (
                <motion.div
                  key={flight.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  onClick={() => {
                    onSelectFlight(flight)
                    onClose()
                  }}
                  className="group relative cursor-pointer overflow-hidden rounded-lg border border-border bg-surface-raised p-4 transition-all duration-150 hover:border-accent/40 hover:bg-surface-alt/60 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-accent shadow-xs group-hover:border-accent/40 transition-colors">
                        <Plane size={14} className="rotate-45 text-accent" />
                      </div>
                      <div>
                        <div className="font-mono text-sm font-semibold tracking-tight text-text group-hover:text-accent transition-colors">
                          {flNo}
                        </div>
                        <div className="text-xs font-medium text-text-muted">
                          {flight.airline}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {flight.status === 'enroute' && (
                        <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                          En Route
                        </span>
                      )}
                      {flight.status === 'scheduled' && (
                        <span className="inline-flex items-center rounded-full bg-surface-alt border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
                          Scheduled
                        </span>
                      )}
                      {flight.status === 'delayed' && (
                        <span className="inline-flex items-center rounded-full bg-rise/10 px-2 py-0.5 text-xs font-medium text-rise">
                          Delayed
                        </span>
                      )}
                      {flight.status === 'landed' && (
                        <span className="inline-flex items-center rounded-full bg-fall/10 px-2 py-0.5 text-xs font-medium text-fall">
                          Landed
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Departure -> Arrival Times */}
                  <div className="mt-3 flex items-center justify-between rounded-md border border-border/80 bg-surface px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold tabular-nums text-text">
                        {flight.departureTime}
                      </span>
                      <ArrowRight size={12} className="text-text-muted" />
                      <span className="font-mono font-semibold tabular-nums text-text">
                        {flight.arrivalTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] tabular-nums text-text-muted">
                      <Clock size={11} /> 1h 30m
                    </div>
                  </div>

                  {/* Fare & APIx Footer */}
                  <div className="mt-3 flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={12} className="text-accent" />
                      <span className="text-[11px] text-text-muted">APIx:</span>
                      <span className="font-mono font-semibold text-text tabular-nums">
                        {flight.apix ? formatIndex(flight.apix) : '102.5'}
                      </span>
                    </div>

                    <div className="tabular-nums font-mono text-sm font-semibold text-fall">
                      {formatInr(flight.cheapestFare)}
                    </div>
                  </div>
                </motion.div>
              )
            })
          ) : (
            /* EMPTY STATE */
            <div className="mt-8 flex flex-col items-center justify-center text-center p-6 rounded-lg border border-dashed border-border bg-surface-alt/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-warn/30 bg-warn/10 text-warn mb-3">
                <AlertCircle size={22} />
              </div>
              <h4 className="text-sm font-semibold text-text">No alternative flights available</h4>
              <p className="mt-1 text-xs text-text-muted max-w-[240px]">
                There are no active scheduled flights remaining on the {origin} &rarr; {destination} corridor for today.
              </p>

              <button
                onClick={() => alert('Date selector opened')}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-on-accent shadow-xs transition-opacity hover:opacity-95"
              >
                <Calendar size={13} /> Change Date
              </button>
            </div>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
