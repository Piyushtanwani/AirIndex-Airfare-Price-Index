import { useMemo, useState } from 'react'
import type { HeatmapCell, HeatmapResponse } from '../lib/api'
import { formatDate, formatIndex, formatInr, formatPercent, formatShortDate } from '../lib/format'

export interface HeatmapViewProps {
  data: HeatmapResponse
  title?: string
  description?: string
  className?: string
}

type MetricMode = 'apix' | 'fare'
type DisplayMode = 'tiles' | 'values'

function getDayOfWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  } catch {
    return ''
  }
}

export function HeatmapView({ data, title, description, className = '' }: HeatmapViewProps) {
  const [metricMode, setMetricMode] = useState<MetricMode>('apix')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('tiles')
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null)
  const [pinnedCell, setPinnedCell] = useState<HeatmapCell | null>(null)

  const activeCell = hoveredCell || pinnedCell

  // Index cells by "date|lead_time"
  const cellIndex = useMemo(() => {
    const map = new Map<string, HeatmapCell>()
    data.cells.forEach((c) => {
      map.set(`${c.date}|${c.lead_time_days}`, c)
    })
    return map
  }, [data.cells])

  // Summary statistics
  const stats = useMemo(() => {
    if (!data.cells.length) {
      return {
        avgApix: 100,
        minFareCell: null as HeatmapCell | null,
        maxFareCell: null as HeatmapCell | null,
        minApixCell: null as HeatmapCell | null,
        maxApixCell: null as HeatmapCell | null,
        imputedCount: 0,
        totalCells: 0,
      }
    }

    let sumApix = 0
    let minFareCell = data.cells[0]
    let maxFareCell = data.cells[0]
    let minApixCell = data.cells[0]
    let maxApixCell = data.cells[0]
    let imputedCount = 0

    for (const c of data.cells) {
      sumApix += c.apix
      if (c.imputed) imputedCount++
      if (c.min_logical_fare < minFareCell.min_logical_fare) minFareCell = c
      if (c.min_logical_fare > maxFareCell.min_logical_fare) maxFareCell = c
      if (c.apix < minApixCell.apix) minApixCell = c
      if (c.apix > maxApixCell.apix) maxApixCell = c
    }

    return {
      avgApix: sumApix / data.cells.length,
      minFareCell,
      maxFareCell,
      minApixCell,
      maxApixCell,
      imputedCount,
      totalCells: data.cells.length,
    }
  }, [data.cells])

  // Dynamic cell color
  function getCellBg(cell: HeatmapCell): string {
    if (metricMode === 'apix') {
      const delta = cell.apix - 100
      if (delta > 15) return 'rgb(var(--color-rise-rgb) / 0.92)'
      if (delta > 8) return 'rgb(var(--color-rise-rgb) / 0.68)'
      if (delta > 2.5) return 'rgb(var(--color-rise-rgb) / 0.35)'
      if (delta >= -2.5) return 'var(--color-surface-alt)'
      if (delta >= -8) return 'rgb(var(--color-fall-rgb) / 0.35)'
      if (delta >= -15) return 'rgb(var(--color-fall-rgb) / 0.68)'
      return 'rgb(var(--color-fall-rgb) / 0.92)'
    }

    // Fare mode: relative to min/max fare
    if (!stats.minFareCell || !stats.maxFareCell || stats.minFareCell === stats.maxFareCell) {
      return 'var(--color-surface-alt)'
    }
    const range = stats.maxFareCell.min_logical_fare - stats.minFareCell.min_logical_fare
    if (range <= 0) return 'var(--color-surface-alt)'

    const ratio = (cell.min_logical_fare - stats.minFareCell.min_logical_fare) / range
    if (ratio > 0.8) return 'rgb(var(--color-rise-rgb) / 0.92)'
    if (ratio > 0.6) return 'rgb(var(--color-rise-rgb) / 0.62)'
    if (ratio > 0.45) return 'rgb(var(--color-rise-rgb) / 0.32)'
    if (ratio > 0.35) return 'var(--color-surface-alt)'
    if (ratio > 0.2) return 'rgb(var(--color-fall-rgb) / 0.35)'
    if (ratio > 0.08) return 'rgb(var(--color-fall-rgb) / 0.65)'
    return 'rgb(var(--color-fall-rgb) / 0.92)'
  }

  function getCellTextColor(cell: HeatmapCell): string {
    if (metricMode === 'apix') {
      const delta = Math.abs(cell.apix - 100)
      return delta > 8 ? '#ffffff' : 'var(--color-text)'
    }
    if (!stats.minFareCell || !stats.maxFareCell) return 'var(--color-text)'
    const range = stats.maxFareCell.min_logical_fare - stats.minFareCell.min_logical_fare
    const ratio = range > 0 ? (cell.min_logical_fare - stats.minFareCell.min_logical_fare) / range : 0.5
    return ratio > 0.65 || ratio < 0.12 ? '#ffffff' : 'var(--color-text)'
  }

  const startDate = data.dates[0] ? formatShortDate(data.dates[0]) : ''
  const endDate = data.dates[data.dates.length - 1] ? formatShortDate(data.dates[data.dates.length - 1]) : ''

  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-accent">
              {data.route}
            </span>
            <h2 className="text-base font-semibold tracking-tight text-text">
              {title || `${data.route} Lead-Time Heatmap`}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {description ||
              `Interactive matrix across ${data.dates.length} observation days (${startDate} — ${endDate}) and ${data.lead_times.length} lead times.`}
          </p>
        </div>

        {/* View toggles */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric toggle */}
          <div className="inline-flex rounded-md border border-border bg-surface-alt p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMetricMode('apix')}
              className={`rounded-sm px-2.5 py-1 font-medium transition-colors ${
                metricMode === 'apix'
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Price Index (APIx)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('fare')}
              className={`rounded-sm px-2.5 py-1 font-medium transition-colors ${
                metricMode === 'fare'
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              Min Fare (₹)
            </button>
          </div>

          {/* Tiles vs Values toggle */}
          <div className="inline-flex rounded-md border border-border bg-surface-alt p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDisplayMode('tiles')}
              className={`rounded-sm px-2 py-1 font-medium transition-colors ${
                displayMode === 'tiles'
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
              title="Compact colored heat tiles"
            >
              Tiles
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('values')}
              className={`rounded-sm px-2 py-1 font-medium transition-colors ${
                displayMode === 'values'
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
              }`}
              title="Display values inside cells"
            >
              Numbers
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-surface-alt/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Average APIx</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-text">
              {formatIndex(stats.avgApix)}
            </span>
            <span
              className={`text-xs font-semibold ${
                stats.avgApix > 100 ? 'text-rise' : stats.avgApix < 100 ? 'text-fall' : 'text-text-muted'
              }`}
            >
              {formatPercent(stats.avgApix - 100)}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-alt/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Lowest Fare Observed</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-fall">
            {stats.minFareCell ? formatInr(stats.minFareCell.min_logical_fare) : '—'}
          </p>
          {stats.minFareCell && (
            <p className="mt-0.5 truncate text-[10px] text-text-muted">
              T+{stats.minFareCell.lead_time_days} on {formatShortDate(stats.minFareCell.date)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface-alt/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Highest Fare Observed</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-rise">
            {stats.maxFareCell ? formatInr(stats.maxFareCell.min_logical_fare) : '—'}
          </p>
          {stats.maxFareCell && (
            <p className="mt-0.5 truncate text-[10px] text-text-muted">
              T+{stats.maxFareCell.lead_time_days} on {formatShortDate(stats.maxFareCell.date)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface-alt/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Grid Matrix Size</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-text">
            {stats.totalCells} <span className="text-xs font-normal text-text-muted">cells</span>
          </p>
          <p className="mt-0.5 text-[10px] text-text-muted">
            {data.lead_times.length} lead times &times; {data.dates.length} days
          </p>
        </div>

        <div className="col-span-2 rounded-lg border border-border bg-surface-alt/60 p-3 sm:col-span-4 lg:col-span-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Data Quality</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold tracking-tight text-text">
              {stats.totalCells > 0
                ? `${(((stats.totalCells - stats.imputedCount) / stats.totalCells) * 100).toFixed(0)}%`
                : '100%'}
            </span>
            <span className="text-xs text-text-muted">observed</span>
          </div>
          <p className="mt-0.5 text-[10px] text-text-muted">
            {stats.imputedCount} imputed / {stats.totalCells} cells
          </p>
        </div>
      </div>

      {/* Heatmap Grid container */}
      <div className="relative rounded-lg border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto p-4">
          <div
            className="grid gap-1.5 min-w-fit"
            style={{
              gridTemplateColumns: `84px repeat(${data.dates.length}, minmax(${displayMode === 'values' ? '46px' : '26px'}, 1fr))`,
            }}
          >
            {/* Top-left corner */}
            <div className="sticky left-0 z-10 bg-surface pr-2 text-right text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Lead Time
            </div>

            {/* Date column headers */}
            {data.dates.map((date) => {
              const day = getDayOfWeek(date)
              const isWeekend = day === 'Sat' || day === 'Sun'
              return (
                <div
                  key={date}
                  className={`flex flex-col items-center justify-end pb-1 text-center select-none ${
                    isWeekend ? 'text-accent font-medium' : 'text-text-muted'
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wider opacity-80">{day}</span>
                  <span className="text-[10px] font-medium leading-none">{date.slice(8)}</span>
                  <span className="text-[8px] opacity-70 leading-none">{date.slice(5, 7)}</span>
                </div>
              )
            })}

            {/* Matrix Rows */}
            {data.lead_times.map((lt) => (
              <div key={lt} className="contents">
                {/* Row label (sticky) */}
                <div className="sticky left-0 z-10 flex items-center justify-end bg-surface pr-3 text-xs font-semibold text-text">
                  <span className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-[11px] text-text-muted">
                    {`T+${lt}`}
                  </span>
                </div>

                {/* Heat cells */}
                {data.dates.map((date) => {
                  const cell = cellIndex.get(`${date}|${lt}`)
                  const isHovered = activeCell?.date === date && activeCell?.lead_time_days === lt
                  const isPinned = pinnedCell?.date === date && pinnedCell?.lead_time_days === lt

                  if (!cell) {
                    return (
                      <div
                        key={`${date}-${lt}`}
                        className="aspect-square min-h-[26px] rounded border border-border/30 bg-surface-alt/40"
                        title={`${date} T+${lt}: No observations`}
                      />
                    )
                  }

                  const bg = getCellBg(cell)
                  const textColor = getCellTextColor(cell)
                  const displayValue =
                    metricMode === 'apix' ? formatIndex(cell.apix) : `${Math.round(cell.min_logical_fare / 1000)}k`

                  return (
                    <button
                      type="button"
                      key={`${date}-${lt}`}
                      onClick={() => setPinnedCell((prev) => (prev === cell ? null : cell))}
                      onMouseEnter={() => setHoveredCell(cell)}
                      onFocus={() => setHoveredCell(cell)}
                      onMouseLeave={() => setHoveredCell(null)}
                      aria-label={`${date}, T+${lt}: Index ${formatIndex(cell.apix)}, Fare ${formatInr(cell.min_logical_fare)}`}
                      className={`relative flex aspect-square min-h-[26px] items-center justify-center rounded transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                        isPinned
                          ? 'ring-2 ring-accent scale-105 z-20 shadow-md'
                          : isHovered
                          ? 'ring-2 ring-text/50 scale-105 z-10 shadow-sm'
                          : 'hover:opacity-90'
                      }`}
                      style={{
                        backgroundColor: bg,
                        border: cell.imputed ? '1px dashed rgba(20, 24, 31, 0.35)' : '1px solid rgba(221, 225, 230, 0.5)',
                        opacity: cell.imputed ? 0.75 : 1,
                      }}
                    >
                      {displayMode === 'values' ? (
                        <span
                          className="font-mono text-[10px] font-semibold leading-none tracking-tighter"
                          style={{ color: textColor }}
                        >
                          {displayValue}
                        </span>
                      ) : null}

                      {/* Imputed dot badge */}
                      {cell.imputed && displayMode === 'tiles' && (
                        <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-warn" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-alt/40 px-4 py-3 text-xs text-text-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-text">Color Scale:</span>
            {metricMode === 'apix' ? (
              <>
                <LegendItem color="rgb(var(--color-fall-rgb) / 0.92)" label="APIx < 85 (Cheaper)" />
                <LegendItem color="rgb(var(--color-fall-rgb) / 0.68)" label="85 – 92" />
                <LegendItem color="rgb(var(--color-fall-rgb) / 0.35)" label="92 – 97.5" />
                <LegendItem color="var(--color-surface-alt)" label="97.5 – 102.5 (Base 100)" />
                <LegendItem color="rgb(var(--color-rise-rgb) / 0.35)" label="102.5 – 108" />
                <LegendItem color="rgb(var(--color-rise-rgb) / 0.68)" label="108 – 115" />
                <LegendItem color="rgb(var(--color-rise-rgb) / 0.92)" label="> 115 (Costlier)" />
              </>
            ) : (
              <>
                <LegendItem color="rgb(var(--color-fall-rgb) / 0.92)" label="Lowest Fare Tier" />
                <LegendItem color="rgb(var(--color-fall-rgb) / 0.5)" label="Below Median" />
                <LegendItem color="var(--color-surface-alt)" label="Median Fare" />
                <LegendItem color="rgb(var(--color-rise-rgb) / 0.5)" label="Above Median" />
                <LegendItem color="rgb(var(--color-rise-rgb) / 0.92)" label="Highest Fare Tier" />
              </>
            )}
            <div className="flex items-center gap-1.5 pl-2 border-l border-border">
              <span className="h-3 w-3 rounded border border-dashed border-text/40 bg-surface-alt opacity-75" />
              <span>Dashed = Imputed (Carried)</span>
            </div>
          </div>

          <div className="text-[11px] text-text-muted">
            Click any cell to pin inspector &bull; Hover to explore
          </div>
        </div>
      </div>

      {/* Interactive Inspector Card */}
      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {pinnedCell ? '📌 Pinned Cell Details' : '🔍 Cell Inspector (Hover a cell)'}
          </p>
          {pinnedCell && (
            <button
              type="button"
              onClick={() => setPinnedCell(null)}
              className="text-xs font-medium text-accent hover:underline"
            >
              Unpin
            </button>
          )}
        </div>

        {activeCell ? (
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            <div>
              <p className="text-[11px] text-text-muted">Departure Date</p>
              <p className="font-semibold text-text">{formatDate(activeCell.date)}</p>
              <p className="text-[10px] text-text-muted">{getDayOfWeek(activeCell.date)}</p>
            </div>

            <div>
              <p className="text-[11px] text-text-muted">Booking Window</p>
              <p className="font-mono font-semibold text-text">T+{activeCell.lead_time_days}</p>
              <p className="text-[10px] text-text-muted">{activeCell.lead_time_days} days before flight</p>
            </div>

            <div>
              <p className="text-[11px] text-text-muted">Price Index (APIx)</p>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base font-bold text-text">{formatIndex(activeCell.apix)}</span>
                <span
                  className={`text-xs font-semibold ${
                    activeCell.apix > 100 ? 'text-rise' : activeCell.apix < 100 ? 'text-fall' : 'text-text-muted'
                  }`}
                >
                  {formatPercent(activeCell.apix - 100)}
                </span>
              </div>
            </div>

            <div>
              <p className="text-[11px] text-text-muted">Min Logical Fare</p>
              <p className="font-mono text-base font-bold text-text">{formatInr(activeCell.min_logical_fare)}</p>
              <p className="text-[10px] text-text-muted">Lowest valid price</p>
            </div>

            <div>
              <p className="text-[11px] text-text-muted">Observations Sampled</p>
              <p className="font-mono font-semibold text-text">{activeCell.obs_count}</p>
              <p className="text-[10px] text-text-muted">Collected flights</p>
            </div>

            <div>
              <p className="text-[11px] text-text-muted">Quality Flag</p>
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                  activeCell.imputed ? 'bg-warn/10 text-warn' : 'bg-fall/10 text-fall'
                }`}
              >
                {activeCell.imputed ? 'Imputed (Carried)' : 'Directly Observed'}
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-text-muted">
            Hover over or focus on any cell in the matrix above to inspect exact fare, index value, observation count, and imputation details.
          </p>
        )}
      </div>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-[2px] border border-border/40 shadow-xs" style={{ background: color }} />
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  )
}
