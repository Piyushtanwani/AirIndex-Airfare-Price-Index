import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { FlightData } from '../../types/flight'
import type { TrendPoint } from '../../types/map'
import type { LiveFlightStatusData } from '../../services/liveFlightStatus'
import { formatInr, formatIndex } from '../../lib/format'
import {
  X,
  Plane,
  Clock,
  Navigation,
  Gauge,
  AlertTriangle,
  RefreshCw,
  FileText,
  Sparkles,
} from 'lucide-react'

interface FlightDrawerProps {
  flight: FlightData | null
  liveStatus?: LiveFlightStatusData | null
  isLoadingStatus?: boolean
  selectedDate?: string
  trendData?: TrendPoint[]
  darkMode?: boolean
  onClose: () => void
  onViewAlternatives?: () => void
}

export const FlightDrawer: React.FC<FlightDrawerProps> = ({
  flight,
  liveStatus,
  isLoadingStatus = false,
  selectedDate,
  trendData = [],
  onClose,
  onViewAlternatives,
}) => {
  if (!flight) return null

  // Active operational status prioritize liveStatus data
  const currentStatus = liveStatus?.status || flight.status
  const isCancelled = currentStatus === 'cancelled'
  const isEnroute = currentStatus === 'enroute'
  const isDelayed = currentStatus === 'delayed'
  const isScheduled = currentStatus === 'scheduled'
  const isBoarding = currentStatus === 'boarding'
  const isLanded = currentStatus === 'landed'
  const isUnknown = currentStatus === 'unknown' || (!liveStatus && !flight.status)

  // Progress computation: ONLY show progress if status === 'enroute'
  const displayProgress = isEnroute ? (flight.progress || 50) : isLanded ? 100 : 0

  // Telemetry visibility: Hide if scheduled, boarding, or cancelled
  const showTelemetry = isEnroute || isLanded || isDelayed

  const flightDisplayNo = liveStatus?.flightNo || flight.flightNo || flight.flightNumber || flight.id
  const displayAirline = liveStatus?.airline || flight.airline
  const displayAircraft = liveStatus?.aircraft || flight.aircraft
  const displayOrigin = liveStatus?.origin || flight.origin
  const displayDestination = liveStatus?.destination || flight.destination
  const displayDeparture = liveStatus?.departureTime || flight.departureTime
  const displayArrival = liveStatus?.arrivalTime || flight.arrivalTime
  const displayUpdatedAt = liveStatus?.updatedAt || 'Just now'

  // Lead-time price index breakdown
  const leadTimes = [
    { label: 'T+1', value: Math.min(100, Math.round(flight.apix * 0.95)), fare: Math.round(flight.cheapestFare * 1.18) },
    { label: 'T+7', value: Math.min(100, Math.round(flight.apix * 0.90)), fare: Math.round(flight.cheapestFare * 1.10) },
    { label: 'T+15', value: Math.min(100, Math.round(flight.apix * 0.82)), fare: flight.cheapestFare },
    { label: 'T+30', value: Math.min(100, Math.round(flight.apix * 0.74)), fare: Math.round(flight.cheapestFare * 0.92) },
    { label: 'T+45', value: Math.min(100, Math.round(flight.apix * 0.68)), fare: Math.round(flight.cheapestFare * 0.86) },
  ]

  // Chart data for 30-day trend sparkline
  const chartData = (trendData.length > 0 ? trendData : [
    { date: 'Sep 01', apix: flight.apix * 0.92 },
    { date: 'Sep 07', apix: flight.apix * 0.96 },
    { date: 'Sep 14', apix: flight.apix * 1.02 },
    { date: 'Sep 21', apix: flight.apix },
  ]).map((pt) => ({
    date: pt.date,
    apix: Number(pt.apix.toFixed(1)),
  }))

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ x: '-100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '-100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
        aria-label="Flight Intelligence Drawer"
        className="fixed left-0 top-16 sm:top-20 z-40 flex h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)] w-full max-w-[430px] flex-col overflow-y-auto border-r border-border bg-surface text-text shadow-xl backdrop-blur-md [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent sm:w-[430px]"
      >
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          {/* 1. HEADER (Flight code, Airline pill, Status & Close) */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-2xl font-semibold tracking-tight text-text">
                  {flightDisplayNo}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-text-muted">
                  {displayAirline}
                </span>

                {/* Status Badges conforming to DeltaBadge/CoverageBadge system */}
                {isScheduled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-text-muted border border-border">
                    Scheduled
                  </span>
                )}
                {isBoarding && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rise/10 px-2.5 py-0.5 text-xs font-medium text-rise">
                    Boarding
                  </span>
                )}
                {isEnroute && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                    En Route
                  </span>
                )}
                {isDelayed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rise/10 px-2.5 py-0.5 text-xs font-medium text-rise">
                    Delayed {liveStatus?.delayMinutes ? `(+${liveStatus.delayMinutes}m)` : ''}
                  </span>
                )}
                {isLanded && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fall/10 px-2.5 py-0.5 text-xs font-medium text-fall">
                    Landed
                  </span>
                )}
                {isCancelled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2.5 py-0.5 text-xs font-medium text-warn">
                    Cancelled
                  </span>
                )}
                {isUnknown && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-text-muted border border-border">
                    Status Unknown
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <span>{displayAircraft}</span>
                <span>&middot;</span>
                {selectedDate && (
                  <>
                    <span className="font-mono">{selectedDate}</span>
                    <span>&middot;</span>
                  </>
                )}
                <span>Domestic corridor</span>
                <span>&middot;</span>
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {displayUpdatedAt}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-text-muted transition-colors hover:bg-surface-alt hover:text-text"
              aria-label="Close drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* 2. OPERATIONAL SCHEDULE & ROUTE SEGMENT */}
          <div className="rounded-lg border border-border bg-surface-raised p-4 sm:p-5 shadow-sm">
            {isLoadingStatus ? (
              <div className="space-y-3 animate-pulse">
                <div className="flex justify-between items-center">
                  <div className="h-6 w-16 bg-surface-alt rounded" />
                  <div className="h-4 w-24 bg-surface-alt rounded" />
                  <div className="h-6 w-16 bg-surface-alt rounded" />
                </div>
                <div className="h-2 w-full bg-surface-alt rounded" />
                <div className="h-4 w-3/4 bg-surface-alt rounded mx-auto" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 text-center">
                  {/* Origin */}
                  <div className="text-left">
                    <div className="font-mono text-2xl font-semibold tracking-tight text-text">{displayOrigin}</div>
                    <div className="text-xs font-medium text-text-muted">{flight.originCity}</div>
                    <div className="mt-1 flex items-center gap-1 text-xs tabular-nums text-text-muted">
                      <Clock size={11} /> {displayDeparture}
                    </div>
                    {liveStatus?.terminal && (
                      <div className="mt-0.5 text-[11px] font-medium text-accent">
                        Term {liveStatus.terminal} {liveStatus.gate ? `&middot; Gate ${liveStatus.gate}` : ''}
                      </div>
                    )}
                  </div>

                  {/* Flight Path Graphic */}
                  <div className="flex flex-1 flex-col items-center px-3">
                    <span className="text-[11px] tabular-nums font-medium text-text-muted mb-1.5">
                      {flight.distanceKm ? `${flight.distanceKm.toLocaleString('en-IN')} km` : '750 km'}
                    </span>
                    <div className="relative flex w-full items-center justify-center">
                      <div className={`h-[1px] w-full ${isCancelled ? 'border-b border-dashed border-warn' : 'bg-border'}`} />
                      <div className="absolute rounded-full border border-border bg-surface p-1 text-text-muted shadow-xs">
                        {isCancelled ? (
                          <span className="text-xs font-bold text-warn leading-none">✕</span>
                        ) : (
                          <Plane size={12} className="rotate-45 text-accent" />
                        )}
                      </div>
                    </div>
                    <span className="mt-2 text-[10px] font-mono text-text-muted uppercase">
                      {isEnroute ? 'En Route' : isLanded ? 'Completed' : 'Non-stop'}
                    </span>
                  </div>

                  {/* Destination */}
                  <div className="text-right">
                    <div className="font-mono text-2xl font-semibold tracking-tight text-text">{displayDestination}</div>
                    <div className="text-xs font-medium text-text-muted">{flight.destCity}</div>
                    <div className="mt-1 flex items-center justify-end gap-1 text-xs tabular-nums text-text-muted">
                      <Clock size={11} /> {isLanded ? `Arrived ${displayArrival}` : displayArrival}
                    </div>
                    <div className="mt-0.5 text-[11px] text-text-muted font-medium">
                      Scheduled
                    </div>
                  </div>
                </div>

                {/* CANCELLED NOTIFICATION */}
                {isCancelled && (
                  <div className="mt-4 rounded-md border border-warn/20 bg-warn/10 p-3.5 text-xs text-text space-y-2">
                    <div className="flex items-center gap-2 font-medium text-warn">
                      <AlertTriangle size={15} />
                      <span>This scheduled flight has been cancelled.</span>
                    </div>
                    <p className="text-xs text-text-muted">
                      Reason: <span className="font-medium text-text">{flight.cancelReason || 'Operational constraint'}</span>
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={onViewAlternatives}
                        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent shadow-sm hover:opacity-95 transition-opacity"
                      >
                        <RefreshCw size={12} /> View alternative flights
                      </button>
                      <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-alt transition-colors">
                        <FileText size={12} /> Export report
                      </button>
                    </div>
                  </div>
                )}

                {/* EN ROUTE PROGRESS BAR */}
                {isEnroute && (
                  <div className="mt-4 pt-3 border-t border-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-text-muted">Flight Progress</span>
                      <span className="font-mono text-accent font-medium tabular-nums">{displayProgress}% completed</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${displayProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3. AIRFARE ANALYTICS (APIX) METRICS GRID */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-text">Airfare Analytics</h3>
                <p className="text-xs text-text-muted">APIx index and tariff observations</p>
              </div>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-medium text-accent">
                Corridor scope
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* APIx Index */}
              <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-medium text-text-muted">APIx Index</span>
                <div className="mt-1">
                  <div className="tabular-nums font-mono text-2xl font-semibold tracking-tight text-text">
                    {formatIndex(flight.apix)}
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-text-muted">
                    Base: 100.0
                  </p>
                </div>
              </div>

              {/* Volatility */}
              <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-medium text-text-muted">Volatility</span>
                <div className="mt-1">
                  <div className="tabular-nums font-mono text-2xl font-semibold tracking-tight text-text">
                    {flight.volatility}%
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    30-day index variance
                  </p>
                </div>
              </div>

              {/* Cheapest Fare */}
              <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-medium text-text-muted">Lowest Published</span>
                <div className="mt-1">
                  <div className="tabular-nums text-2xl font-semibold tracking-tight text-fall">
                    {formatInr(flight.cheapestFare)}
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Best available fare
                  </p>
                </div>
              </div>

              {/* Highest Fare */}
              <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-medium text-text-muted">Highest Published</span>
                <div className="mt-1">
                  <div className="tabular-nums text-2xl font-semibold tracking-tight text-text">
                    {formatInr(flight.highestFare)}
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Peak surge ceiling
                  </p>
                </div>
              </div>

              {/* Average Fare */}
              <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-medium text-text-muted">Average Fare</span>
                <div className="mt-1">
                  <div className="tabular-nums text-2xl font-semibold tracking-tight text-text">
                    {formatInr(flight.averageFare)}
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Weighted corridor mean
                  </p>
                </div>
              </div>

              {/* Trust Score */}
              <div className="rounded-lg border border-border bg-surface p-3.5 shadow-sm flex flex-col justify-between">
                <span className="text-xs font-medium text-text-muted">Data Reliability</span>
                <div className="mt-1">
                  <div className="tabular-nums font-mono text-2xl font-semibold tracking-tight text-text">
                    {flight.trust ? `${flight.trust}%` : '98.4%'}
                  </div>
                  <p className="mt-0.5 text-[11px] text-fall font-medium">
                    MoSPI audited
                  </p>
                </div>
              </div>

              {/* Telemetry (Only for en route or landed flights) */}
              {showTelemetry && !isCancelled && (
                <>
                  <div className="rounded-lg border border-border bg-surface-raised p-3.5 shadow-sm flex flex-col justify-between">
                    <span className="flex items-center gap-1 text-xs font-medium text-text-muted">
                      <Navigation size={12} /> Altitude
                    </span>
                    <div className="mt-1">
                      <div className="tabular-nums font-mono text-lg font-semibold tracking-tight text-text">
                        {flight.altitude || '32,000 ft'}
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-muted">Cruising flight level</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-surface-raised p-3.5 shadow-sm flex flex-col justify-between">
                    <span className="flex items-center gap-1 text-xs font-medium text-text-muted">
                      <Gauge size={12} /> Ground Speed
                    </span>
                    <div className="mt-1">
                      <div className="tabular-nums font-mono text-lg font-semibold tracking-tight text-text">
                        {flight.speed || '810 km/h'}
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-muted">Active telemetry</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 4. 30-DAY APIx INDEX HISTORY CHART */}
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3">
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  30-Day APIx History
                </h4>
                <p className="text-[11px] text-text-muted">Daily published index values</p>
              </div>
              <span className="font-mono text-xs font-semibold text-text">
                {formatIndex(flight.apix)} pts
              </span>
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 12, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-md)',
                      fontSize: 12,
                      color: 'var(--color-text)',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="apix"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. LEAD-TIME FARE BREAKDOWN */}
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm space-y-3">
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Lead-Time Index Breakdown
              </h4>
              <p className="text-[11px] text-text-muted">Pricing curve across advance booking horizons</p>
            </div>
            <div className="space-y-2.5 pt-1">
              {leadTimes.map((item) => (
                <div key={item.label} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium text-text-muted">{item.label} departure</span>
                    <span className="tabular-nums font-semibold text-text">{formatInr(item.fare)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. METHODOLOGICAL INSIGHT */}
          <div className="rounded-lg border border-border bg-surface-alt/60 p-3.5 text-xs text-text-muted">
            <div className="flex items-center gap-1.5 font-medium text-text mb-1">
              <Sparkles size={13} className="text-accent" />
              <span>Statistical Note</span>
            </div>
            <p className="leading-relaxed">
              {isCancelled
                ? `Flight ${flightDisplayNo} on ${displayOrigin} → ${displayDestination} has been marked cancelled. Volatility is recorded at ${flight.volatility}%. Statutory passenger protection and rebooking safeguards apply.`
                : `${displayOrigin} → ${displayDestination} status: ${currentStatus.toUpperCase()}. APIx index is ${formatIndex(flight.apix)} with volatility calibrated at ${flight.volatility}%. Calculations follow MoSPI / DGCA airfare index guidelines.`}
            </p>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}

