import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useHeatmap, useIndex } from '../hooks/useApi'
import { formatIndex, formatInr, formatShortDate } from '../lib/format'
import type { HeatmapCell } from '../lib/api'

function heatColor(apix: number): string {
  // Cool = fares below base (100), warm = fares above base — same rise/fall
  // semantics used across the dashboard.
  const delta = apix - 100
  if (delta > 15) return 'rgb(var(--color-rise-rgb) / 0.9)'
  if (delta > 7) return 'rgb(var(--color-rise-rgb) / 0.55)'
  if (delta > 2) return 'rgb(var(--color-rise-rgb) / 0.25)'
  if (delta < -15) return 'rgb(var(--color-fall-rgb) / 0.9)'
  if (delta < -7) return 'rgb(var(--color-fall-rgb) / 0.55)'
  if (delta < -2) return 'rgb(var(--color-fall-rgb) / 0.25)'
  return 'var(--color-surface-alt)'
}

export default function RouteDetail() {
  const { code = '' } = useParams<{ code: string }>()
  const [hovered, setHovered] = useState<HeatmapCell | null>(null)

  const seriesQuery = useIndex({ scope: 'route', route: code, window: 'all' })
  const heatmapQuery = useHeatmap(code, 30)

  const cellIndex = useMemo(() => {
    const map = new Map<string, HeatmapCell>()
    heatmapQuery.data?.cells.forEach((cell) => {
      map.set(`${cell.date}|${cell.lead_time_days}`, cell)
    })
    return map
  }, [heatmapQuery.data])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-text-muted">
          <Link to="/routes" className="hover:text-accent">Routes</Link> / {code}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-text">{code}</h1>
        <p className="text-sm text-text-muted">Route-level index history and lead-time heatmap.</p>
      </div>

      <ChartCard title={`${code} index history`}>
        {seriesQuery.isLoading ? (
          <LoadingSkeleton rows={4} height={20} label="Loading route index history" />
        ) : seriesQuery.isError ? (
          <ErrorState error={seriesQuery.error} onRetry={() => seriesQuery.refetch()} />
        ) : !seriesQuery.data || seriesQuery.data.items.length === 0 ? (
          <EmptyState title="No index history for this route" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesQuery.data.items} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDate}
                  tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                  axisLine={{ stroke: 'var(--color-border)' }}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  formatter={(value) => formatIndex(Number(value))}
                  labelFormatter={(label) => formatShortDate(String(label))}
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-md)',
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="apix" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <ChartCard
        title="Lead-time heatmap"
        description="Index value by lead time (rows) and date (columns). Warm = fares above base period, cool = below."
      >
        {heatmapQuery.isLoading ? (
          <LoadingSkeleton rows={5} height={20} label="Loading heatmap" />
        ) : heatmapQuery.isError ? (
          <ErrorState error={heatmapQuery.error} onRetry={() => heatmapQuery.refetch()} />
        ) : !heatmapQuery.data || heatmapQuery.data.dates.length === 0 ? (
          <EmptyState title="No heatmap data for this route" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <div
                className="grid gap-0.5"
                style={{ gridTemplateColumns: `88px repeat(${heatmapQuery.data.dates.length}, minmax(20px, 1fr))` }}
              >
                <div />
                {heatmapQuery.data.dates.map((date) => (
                  <div key={date} className="text-center text-[10px] text-text-muted" style={{ writingMode: 'vertical-rl' }}>
                    {formatShortDate(date)}
                  </div>
                ))}
                {heatmapQuery.data.lead_times.map((lt) => (
                  <div key={lt} className="contents">
                    <div className="flex items-center py-0.5 text-xs font-medium text-text-muted">{`T+${lt}`}</div>
                    {heatmapQuery.data!.dates.map((date) => {
                      const cell = cellIndex.get(`${date}|${lt}`)
                      return (
                        <button
                          type="button"
                          key={`${date}-${lt}`}
                          onMouseEnter={() => cell && setHovered(cell)}
                          onFocus={() => cell && setHovered(cell)}
                          onMouseLeave={() => setHovered(null)}
                          disabled={!cell}
                          aria-label={
                            cell
                              ? `${date}, lead time T+${lt}: index ${formatIndex(cell.apix)}${cell.imputed ? ', imputed' : ''}`
                              : `${date}, lead time T+${lt}: no data`
                          }
                          className="aspect-square min-h-[18px] rounded-[2px] border border-border/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          style={{ background: cell ? heatColor(cell.apix) : 'var(--color-surface-alt)', opacity: cell?.imputed ? 0.55 : 1 }}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span className="font-medium text-text">Legend:</span>
              <LegendSwatch color="rgb(var(--color-fall-rgb) / 0.9)" label="Well below base (cheaper)" />
              <LegendSwatch color="rgb(var(--color-fall-rgb) / 0.25)" label="Below base" />
              <LegendSwatch color="var(--color-surface-alt)" label="Near base" />
              <LegendSwatch color="rgb(var(--color-rise-rgb) / 0.25)" label="Above base" />
              <LegendSwatch color="rgb(var(--color-rise-rgb) / 0.9)" label="Well above base (costlier)" />
              <span>Faded cells are imputed (carried forward).</span>
            </div>

            <div aria-live="polite" className="min-h-[20px] text-xs text-text-muted">
              {hovered ? (
                <span>
                  {formatShortDate(hovered.date)}, T+{hovered.lead_time_days}: index {formatIndex(hovered.apix)}, min logical fare{' '}
                  {formatInr(hovered.min_logical_fare)}, {hovered.obs_count} observations{hovered.imputed ? ' (imputed)' : ''}
                </span>
              ) : (
                <span>Hover or focus a cell to inspect it.</span>
              )}
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-3 w-3 rounded-[2px] border border-border/40" style={{ background: color }} />
      {label}
    </span>
  )
}
