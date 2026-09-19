import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Caveats } from '../components/Caveats'
import { ChartCard } from '../components/ChartCard'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { StatTile } from '../components/StatTile'
import { useAnomalies, useBacktest } from '../hooks/useApi'
import type { AnomalyItem, BacktestKind, BacktestLeaveOneOutRow, BacktestStabilityRow } from '../lib/api'
import { formatIndianNumber, formatPercent } from '../lib/format'

const KINDS: { value: BacktestKind; label: string }[] = [
  { value: 'stability', label: 'Stability' },
  { value: 'leave_one_out', label: 'Leave-one-out' },
]

const stabilityColumns: DataTableColumn<BacktestStabilityRow>[] = [
  { key: 'date', header: 'Date', accessor: (r) => r.date, sortable: true },
  { key: 'first_published', header: 'First published', accessor: (r) => r.first_published, sortable: true, align: 'right', render: (r) => r.first_published.toFixed(4) },
  { key: 'final', header: 'Final', accessor: (r) => r.final, sortable: true, align: 'right', render: (r) => r.final.toFixed(4) },
  { key: 'revision', header: 'Revision', accessor: (r) => r.revision, sortable: true, align: 'right', render: (r) => r.revision.toFixed(4) },
  { key: 'coverage', header: 'Coverage', accessor: (r) => r.coverage, sortable: true, align: 'right', render: (r) => `${(r.coverage * 100).toFixed(0)}%` },
]

const DEFAULT_THRESHOLD = 3.0
const DEFAULT_ANOMALY_DAYS = 90

function DirectionBadge({ direction }: { direction: AnomalyItem['direction'] }) {
  const isRise = direction === 'rise'
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${isRise ? 'text-rise bg-rise/10' : 'text-fall bg-fall/10'}`}
      aria-label={isRise ? 'Rise (fares costlier)' : 'Fall (fares cheaper)'}
    >
      {isRise ? 'Rise' : 'Fall'}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: AnomalyItem['severity'] }) {
  const isHigh = severity === 'high'
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${
        isHigh ? 'border border-warn/50 bg-warn/10 text-warn' : 'bg-surface-alt text-text-muted'
      }`}
    >
      {isHigh ? 'High' : 'Moderate'}
    </span>
  )
}

const anomalyColumns: DataTableColumn<AnomalyItem>[] = [
  { key: 'date', header: 'Date', accessor: (r) => r.date, sortable: true },
  { key: 'value', header: 'Value', accessor: (r) => r.value, sortable: true, align: 'right', render: (r) => r.value.toFixed(4) },
  { key: 'previous', header: 'Previous', accessor: (r) => r.previous, sortable: true, align: 'right', render: (r) => r.previous.toFixed(4) },
  { key: 'change_pct', header: 'Change', accessor: (r) => r.change_pct, sortable: true, align: 'right', render: (r) => formatPercent(r.change_pct) },
  { key: 'z_score', header: 'Z score', accessor: (r) => r.z_score, sortable: true, align: 'right', render: (r) => r.z_score.toFixed(3) },
  {
    key: 'direction',
    header: 'Direction',
    accessor: (r) => r.direction,
    sortable: true,
    render: (r) => <DirectionBadge direction={r.direction} />,
  },
  {
    key: 'severity',
    header: 'Severity',
    accessor: (r) => r.severity,
    sortable: true,
    render: (r) => <SeverityBadge severity={r.severity} />,
  },
]

function formatMetricLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatMetricValue(value: number | string): string {
  if (typeof value === 'string') return value
  return formatIndianNumber(Number(value.toFixed(4)))
}

export default function Diagnostics() {
  const [kind, setKind] = useState<BacktestKind>('stability')
  const query = useBacktest({ kind })

  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [anomalyDays, setAnomalyDays] = useState(DEFAULT_ANOMALY_DAYS)
  const anomaliesQuery = useAnomalies({ threshold, days: anomalyDays })

  const leaveOneOutData =
    kind === 'leave_one_out' && query.data ? [...(query.data.series as BacktestLeaveOneOutRow[])].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) : []

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Back-test diagnostics</h1>
        <p className="max-w-3xl text-sm text-text-muted">
          Internal stability and sensitivity checks on the published methodology. These are not a comparison
          against an external reference series — no such series exists for this index.
        </p>
      </div>

      <fieldset className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">Kind</legend>
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => setKind(k.value)}
            className={`rounded-sm px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
              kind === k.value ? 'bg-accent-muted text-accent' : 'border border-border text-text-muted hover:bg-surface-alt hover:text-text'
            }`}
          >
            {k.label}
          </button>
        ))}
      </fieldset>

      {query.isLoading ? (
        <LoadingSkeleton rows={5} height={20} label="Loading back-test" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <EmptyState title="No back-test data available" />
      ) : (
        <>
          <div className="rounded-md border-2 border-warn/50 bg-warn/10 p-4">
            <p className="text-sm font-medium text-warn">No external reference series exists</p>
            <p className="mt-1 text-sm text-text">
              These diagnostics compare the methodology against itself, not against an independent measurement of
              Indian airfares.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Diagnostic run"
              value={query.data.kind}
              sublabel="Kind echoed by the backend response for the requested diagnostic."
            />
            {Object.entries(query.data.metrics).map(([key, value]) => (
              <StatTile key={key} label={formatMetricLabel(key)} value={formatMetricValue(value)} />
            ))}
          </div>

          {kind === 'stability' ? (
            <ChartCard title="Revision series" description="First published vs. final value for each date, with coverage.">
              {query.data.series.length === 0 ? (
                <EmptyState title="No stability series available" />
              ) : (
                <DataTable
                  columns={stabilityColumns}
                  rows={query.data.series as BacktestStabilityRow[]}
                  getRowKey={(r) => r.date}
                  initialSortKey="date"
                  initialSortDir="asc"
                  caption="Stability replay series"
                />
              )}
            </ChartCard>
          ) : (
            <ChartCard title="Route influence" description="Change in the national index when each route is excluded, largest absolute effect first.">
              {leaveOneOutData.length === 0 ? (
                <EmptyState title="No leave-one-out data available" />
              ) : (
                <div className="w-full" style={{ height: Math.max(240, leaveOneOutData.length * 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={leaveOneOutData}
                      layout="vertical"
                      margin={{ top: 8, right: 24, bottom: 0, left: 8 }}
                    >
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="route_excluded"
                        width={90}
                        tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value) => Number(value).toFixed(4)}
                        contentStyle={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-md)',
                          boxShadow: 'var(--shadow-md)',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="delta" radius={[0, 3, 3, 0]}>
                        {leaveOneOutData.map((row) => (
                          <Cell key={row.route_excluded} fill={row.delta >= 0 ? 'var(--color-rise)' : 'var(--color-fall)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          )}

          <Caveats title="Notes" items={query.data.notes} variant="note" />
        </>
      )}

      <div>
        <h2 className="text-lg font-semibold text-text">Series anomalies</h2>
        <p className="max-w-3xl text-sm text-text-muted">
          Days where the national index moved by an unusual amount relative to its own recent volatility. A flag
          means the movement is unusual for this series, not that it is wrong.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="anomaly-threshold" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Threshold (z score)
          </label>
          <div className="flex items-center gap-3">
            <input
              id="anomaly-threshold"
              type="range"
              min={1.5}
              max={10}
              step={0.5}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-40 accent-[var(--color-accent)]"
            />
            <input
              type="number"
              aria-label="Threshold value"
              min={1.5}
              max={10}
              step={0.5}
              value={threshold}
              onChange={(e) => setThreshold(Math.min(10, Math.max(1.5, Number(e.target.value) || DEFAULT_THRESHOLD)))}
              className="tabular-nums w-20 rounded-sm border border-border bg-surface px-2 py-1 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="anomaly-days" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Days
          </label>
          <input
            id="anomaly-days"
            type="number"
            min={1}
            value={anomalyDays}
            onChange={(e) => setAnomalyDays(Number(e.target.value) || DEFAULT_ANOMALY_DAYS)}
            className="tabular-nums w-28 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      {anomaliesQuery.isLoading ? (
        <LoadingSkeleton rows={4} height={20} label="Loading anomalies" />
      ) : anomaliesQuery.isError ? (
        <ErrorState error={anomaliesQuery.error} onRetry={() => anomaliesQuery.refetch()} />
      ) : !anomaliesQuery.data ? (
        <EmptyState title="No anomaly data available" />
      ) : (
        <>
          <StatTile
            label="Flagged days"
            value={anomaliesQuery.data.count}
            sublabel={`Out of the last ${anomalyDays} days, at a threshold of ${threshold.toFixed(1)} z.`}
          />

          <ChartCard title="Flagged days" description="Each day whose move exceeded the threshold, most recent first.">
            {anomaliesQuery.data.count === 0 ? (
              <EmptyState
                title="No unusual movements detected"
                message={`At a threshold of ${threshold.toFixed(1)} z over the last ${anomalyDays} days, every daily move stayed within normal range for this series. For a stable series, that is the expected and good outcome.`}
              />
            ) : (
              <DataTable
                columns={anomalyColumns}
                rows={anomaliesQuery.data.items}
                getRowKey={(r) => r.date}
                initialSortKey="date"
                initialSortDir="desc"
                caption="Flagged anomalous days"
              />
            )}
          </ChartCard>

          <Caveats title="Notes" items={[anomaliesQuery.data.note]} variant="note" />
        </>
      )}
    </div>
  )
}
