import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Caveats } from '../components/Caveats'
import { ChartCard } from '../components/ChartCard'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useForecast } from '../hooks/useApi'
import { ApiError, type ForecastScore } from '../lib/api'
import { formatIndex, formatShortDate } from '../lib/format'

const MODEL_COLORS: Record<string, string> = {
  seasonal_naive: '#6b7fd7',
  drift: '#c77dbb',
  ets: '#5bab8a',
  autoregressive: '#c9973b',
}

interface ChartRow {
  date: string
  history?: number
  forecast?: number
  lower?: number
  upper?: number
  bandBase?: number
  bandHeight?: number
  [model: string]: string | number | undefined
}

export default function Forecast() {
  const [horizon, setHorizon] = useState(14)
  const [confidence, setConfidence] = useState(0.95)
  const [showPerModel, setShowPerModel] = useState(false)
  const query = useForecast({ horizon, confidence })

  const chartData = useMemo<ChartRow[]>(() => {
    if (!query.data) return []
    const rows: ChartRow[] = query.data.history.map((h) => ({ date: h.date, history: h.value }))
    const lastHistory = query.data.history[query.data.history.length - 1]
    if (lastHistory) {
      // Seed the forecast series at the last history point so the dashed
      // continuation visually joins the solid line with no gap.
      const bridgeIndex = rows.length - 1
      rows[bridgeIndex] = { ...rows[bridgeIndex], forecast: lastHistory.value, lower: lastHistory.value, upper: lastHistory.value }
      Object.keys(query.data.per_model).forEach((model) => {
        rows[bridgeIndex] = { ...rows[bridgeIndex], [model]: lastHistory.value }
      })
    }
    query.data.points.forEach((p, i) => {
      const row: ChartRow = {
        date: p.date,
        forecast: p.value,
        lower: p.lower,
        upper: p.upper,
        bandBase: p.lower,
        bandHeight: p.upper - p.lower,
      }
      Object.entries(query.data!.per_model).forEach(([model, values]) => {
        row[model] = values[i]
      })
      rows.push(row)
    })
    return rows
  }, [query.data])

  // The confidence band is drawn as a stacked area whose invisible base starts at zero,
  // so Recharts would otherwise extend the axis down to zero and squash a series that
  // only ever moves between about 95 and 115 into the top fifth of the chart. An index
  // has no meaningful zero, so the domain is computed from the data instead.
  const yDomain = useMemo<[number, number]>(() => {
    const values = chartData.flatMap((row) =>
      [row.history, row.forecast, row.lower, row.upper].filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v),
      ),
    )
    if (values.length === 0) return [90, 110]
    const min = Math.min(...values)
    const max = Math.max(...values)
    const padding = Math.max((max - min) * 0.12, 1)
    return [Math.floor(min - padding), Math.ceil(max + padding)]
  }, [chartData])

  const scoreColumns: DataTableColumn<ForecastScore>[] = [
    { key: 'model', header: 'Model', accessor: (r) => r.model, sortable: true },
    { key: 'mae', header: 'MAE', accessor: (r) => r.mae, sortable: true, align: 'right', render: (r) => r.mae.toFixed(4) },
    { key: 'rmse', header: 'RMSE', accessor: (r) => r.rmse, sortable: true, align: 'right', render: (r) => r.rmse.toFixed(4) },
    { key: 'mape', header: 'MAPE', accessor: (r) => r.mape, sortable: true, align: 'right', render: (r) => `${r.mape.toFixed(2)}%` },
    {
      key: 'ensemble_weight',
      header: 'Ensemble weight',
      accessor: (r) => r.ensemble_weight,
      sortable: true,
      align: 'right',
      render: (r) => r.ensemble_weight.toFixed(4),
    },
  ]

  const is404 = query.isError && query.error instanceof ApiError && query.error.status === 404

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Forecast</h1>
        <p className="max-w-3xl text-sm text-text-muted">
          An ensemble projection of the national index, scored against a holdout it did not see. Treat the shaded
          interval as an approximation, not a guarantee.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="horizon" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Horizon (days)
          </label>
          <input
            id="horizon"
            type="number"
            min={1}
            max={60}
            value={horizon}
            onChange={(e) => setHorizon(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
            className="tabular-nums w-28 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="confidence" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Confidence
          </label>
          <select
            id="confidence"
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value={0.8}>80%</option>
            <option value={0.9}>90%</option>
            <option value={0.95}>95%</option>
            <option value={0.99}>99%</option>
          </select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-text">
          <input
            type="checkbox"
            checked={showPerModel}
            onChange={(e) => setShowPerModel(e.target.checked)}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
          Overlay per-model lines
        </label>
      </div>

      {query.isLoading ? (
        <LoadingSkeleton rows={5} height={20} label="Loading forecast" />
      ) : is404 ? (
        <EmptyState
          title="Not enough history to forecast"
          message={query.error instanceof ApiError ? query.error.message : 'Fewer than 16 index values exist.'}
        />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <EmptyState title="No forecast available" />
      ) : (
        <>
          <ChartCard
            title="History and projection"
            description={`Solid line is published history; dashed line is the ${query.data.horizon_days}-day ensemble forecast; the shaded band is the ${(query.data.confidence * 100).toFixed(0)}% interval over the forecast portion only.`}
          >
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
                    domain={yDomain}
                    allowDataOverflow
                    tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    formatter={(value, name) => [typeof value === 'number' ? formatIndex(value) : value, name]}
                    labelFormatter={(label) => formatShortDate(String(label))}
                    contentStyle={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-md)',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    dataKey="bandBase"
                    stackId="band"
                    stroke="none"
                    fill="transparent"
                    fillOpacity={0}
                    isAnimationActive={false}
                    connectNulls
                    name="Lower bound"
                    legendType="none"
                  />
                  <Area
                    dataKey="bandHeight"
                    stackId="band"
                    stroke="none"
                    fill="var(--color-accent)"
                    fillOpacity={0.15}
                    isAnimationActive={false}
                    connectNulls
                    name="Confidence interval"
                    legendType="none"
                  />
                  <Line dataKey="history" name="History" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" dot={false} connectNulls={false} />
                  <Line
                    dataKey="forecast"
                    name="Forecast"
                    stroke="var(--color-accent)"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                  />
                  {showPerModel
                    ? Object.keys(query.data.per_model).map((model) => (
                        <Line
                          key={model}
                          dataKey={model}
                          name={model}
                          stroke={MODEL_COLORS[model] ?? 'var(--color-text-muted)'}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeDasharray="3 3"
                          dot={false}
                          connectNulls
                        />
                      ))
                    : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Model scorecard" description="Sorted best first by root mean squared error on a holdout the models did not see.">
            <DataTable
              columns={scoreColumns}
              rows={query.data.scores}
              getRowKey={(r) => r.model}
              caption="Forecast model scores"
              initialSortKey="rmse"
              initialSortDir="asc"
            />
            {query.data.scores[0] ? (
              <p className="mt-2 text-sm text-text-muted">
                Winning model: <span className="font-medium text-text">{query.data.scores[0].model}</span>
              </p>
            ) : null}
          </ChartCard>

          <Caveats title="Notes" items={query.data.notes} variant="note" />
        </>
      )}
    </div>
  )
}
