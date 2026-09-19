import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Caveats } from '../components/Caveats'
import { ChartCard } from '../components/ChartCard'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { StatTile } from '../components/StatTile'
import { useScenario } from '../hooks/useApi'
import { ApiError, type ScenarioChannel, type ScenarioSensitivity } from '../lib/api'
import { formatIndex, formatShortDate } from '../lib/format'

interface ShockControl {
  key: 'airfare_shock_pct' | 'atf_shock_pct' | 'demand_shock_pct' | 'capacity_shock_pct'
  label: string
}

const SHOCKS: ShockControl[] = [
  { key: 'airfare_shock_pct', label: 'Airfare shock' },
  { key: 'atf_shock_pct', label: 'ATF fuel shock' },
  { key: 'demand_shock_pct', label: 'Demand shock' },
  { key: 'capacity_shock_pct', label: 'Capacity shock' },
]

const DEBOUNCE_MS = 400

function IllustrativeMarker() {
  return (
    <span className="ml-1 inline-flex items-center rounded-sm bg-warn/10 px-1.5 py-0.5 text-xs font-medium text-warn">
      illustrative, not official
    </span>
  )
}

export default function Scenario() {
  const [shocks, setShocks] = useState({
    airfare_shock_pct: 0,
    atf_shock_pct: 0,
    demand_shock_pct: 0,
    capacity_shock_pct: 0,
  })
  const [horizonDays, setHorizonDays] = useState(90)
  const mutation = useScenario()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      mutation.mutate({ ...shocks, horizon_days: horizonDays, include_sensitivity: true })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shocks, horizonDays])

  function setShock(key: ShockControl['key'], value: number) {
    setShocks((prev) => ({ ...prev, [key]: value }))
  }

  const data = mutation.data
  const is400 = mutation.isError && mutation.error instanceof ApiError && mutation.error.status === 400

  const channelColumns: DataTableColumn<ScenarioChannel>[] = [
    { key: 'channel', header: 'Channel', accessor: (r) => r.channel, sortable: true },
    { key: 'input_pct', header: 'Input', accessor: (r) => r.input_pct, sortable: true, align: 'right', render: (r) => `${r.input_pct > 0 ? '+' : ''}${r.input_pct.toFixed(1)}%` },
    { key: 'effect_pct', header: 'Effect on fares', accessor: (r) => r.effect_pct, sortable: true, align: 'right', render: (r) => `${r.effect_pct > 0 ? '+' : ''}${r.effect_pct.toFixed(2)}%` },
    { key: 'mechanism', header: 'Mechanism', accessor: (r) => r.mechanism },
  ]

  const sensitivityColumns: DataTableColumn<ScenarioSensitivity>[] = [
    { key: 'assumption', header: 'Assumption', accessor: (r) => r.assumption, sortable: true },
    { key: 'baseline_value', header: 'Baseline', accessor: (r) => r.baseline_value, sortable: true, align: 'right', render: (r) => r.baseline_value.toFixed(4) },
    { key: 'low_value', header: 'Low', accessor: (r) => r.low_value, sortable: true, align: 'right', render: (r) => r.low_value.toFixed(4) },
    { key: 'high_value', header: 'High', accessor: (r) => r.high_value, sortable: true, align: 'right', render: (r) => r.high_value.toFixed(4) },
    { key: 'swing_pct_points', header: 'Swing (pp)', accessor: (r) => r.swing_pct_points, sortable: true, align: 'right', render: (r) => r.swing_pct_points.toFixed(2) },
    { key: 'share_of_result', header: 'Share of result', accessor: (r) => r.share_of_result, sortable: true, align: 'right', render: (r) => `${(r.share_of_result * 100).toFixed(1)}%` },
  ]

  const chartData = useMemo(() => data?.path ?? [], [data])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Policy simulator</h1>
        <p className="max-w-3xl text-sm text-text-muted">
          Applies stated-prior coefficients from configuration to a hypothetical shock. None of these coefficients
          are estimated from AirIndex data; they are assumptions, and the simulator refuses shocks large enough to
          exceed what those assumptions can support.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:grid-cols-2">
        {SHOCKS.map((s) => (
          <div key={s.key} className="flex flex-col gap-1">
            <label htmlFor={s.key} className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {s.label} (%)
            </label>
            <div className="flex items-center gap-3">
              <input
                id={s.key}
                type="range"
                min={-60}
                max={60}
                step={1}
                value={shocks[s.key]}
                onChange={(e) => setShock(s.key, Number(e.target.value))}
                className="w-full accent-[var(--color-accent)]"
              />
              <input
                type="number"
                aria-label={`${s.label} value in percent`}
                min={-60}
                max={60}
                value={shocks[s.key]}
                onChange={(e) => setShock(s.key, Number(e.target.value) || 0)}
                className="tabular-nums w-20 rounded-sm border border-border bg-surface px-2 py-1 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="horizon-days" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Horizon (days)
          </label>
          <input
            id="horizon-days"
            type="number"
            min={1}
            max={365}
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value) || 1)}
            className="tabular-nums w-28 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      {mutation.isPending && !data ? (
        <LoadingSkeleton rows={5} height={20} label="Running scenario" />
      ) : is400 ? (
        <EmptyState
          title="Shock outside supported range"
          message={mutation.error instanceof ApiError ? mutation.error.message : 'The requested shock is outside the configured bounds.'}
        />
      ) : mutation.isError ? (
        <ErrorState error={mutation.error} onRetry={() => mutation.mutate({ ...shocks, horizon_days: horizonDays, include_sensitivity: true })} />
      ) : !data ? (
        <EmptyState title="No scenario result yet" message="Adjust a shock above to run the simulator." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Total fare effect"
              value={`${data.total_fare_effect_pct > 0 ? '+' : ''}${data.total_fare_effect_pct.toFixed(2)}%`}
              sublabel="Combined effect of all channels on fares."
              accent
            />
            <StatTile
              label="Baseline index"
              value={formatIndex(data.baseline_index)}
              sublabel={`As of ${data.baseline_date}`}
            />
            <StatTile
              label="CPI effect"
              value={
                data.cpi_effect_pp != null ? (
                  <span>
                    {data.cpi_effect_pp > 0 ? '+' : ''}
                    {data.cpi_effect_pp.toFixed(5)} pp
                    {!data.cpi_effect_is_official ? <IllustrativeMarker /> : null}
                  </span>
                ) : (
                  '—'
                )
              }
              sublabel="Percentage-point contribution to CPI, given the configured airfare weight."
            />
          </div>

          <ChartCard title="Fare channels" description="Each mechanism's contribution to the total fare effect.">
            <DataTable columns={channelColumns} rows={data.channels} getRowKey={(r) => r.channel} caption="Scenario fare channels" />
          </ChartCard>

          <ChartCard title="Baseline vs. scenario path" description="Index path with and without the shock applied.">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
                    width={48}
                  />
                  <Tooltip
                    formatter={(value) => (typeof value === 'number' ? formatIndex(value) : value)}
                    labelFormatter={(label) => formatShortDate(String(label))}
                    contentStyle={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-md)',
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="baseline" name="Baseline" stroke="var(--color-text-muted)" strokeWidth={2} strokeLinecap="round" dot={false} />
                  <Line type="monotone" dataKey="scenario" name="Scenario" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {data.sensitivity.length > 0 ? (
            <ChartCard title="Sensitivity" description="How much the result swings as each assumption moves across its plausible range, largest swing first.">
              <DataTable
                columns={sensitivityColumns}
                rows={data.sensitivity}
                getRowKey={(r) => r.assumption}
                initialSortKey="swing_pct_points"
                caption="Scenario sensitivity to assumptions"
              />
            </ChartCard>
          ) : null}

          <Caveats title="Notes" items={data.notes} variant="note" />
          <Caveats title="Warnings" items={data.warnings} variant="warning" />
        </>
      )}
    </div>
  )
}
