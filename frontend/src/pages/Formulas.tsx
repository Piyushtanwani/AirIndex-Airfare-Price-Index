import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Caveats } from '../components/Caveats'
import { ChartCard } from '../components/ChartCard'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { StatTile } from '../components/StatTile'
import { useFormulas } from '../hooks/useApi'
import type { FormulaResult, QuantityMode } from '../lib/api'

const QUANTITY_MODES: { value: QuantityMode; label: string }[] = [
  { value: 'elasticity_model', label: 'Elasticity model' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'observed_availability', label: 'Observed availability' },
]

const DE_EMPHASISED = new Set(['carli', 'dutot'])

const COLUMNS: DataTableColumn<FormulaResult>[] = [
  { key: 'name', header: 'Formula', accessor: (r) => r.name, sortable: true },
  {
    key: 'value',
    header: 'Value',
    accessor: (r) => r.value,
    sortable: true,
    align: 'right',
    render: (r) => r.value.toFixed(4),
  },
  { key: 'description', header: 'Description', accessor: (r) => r.description },
  {
    key: 'caveat',
    header: 'Caveat',
    accessor: (r) => r.caveat ?? '',
    render: (r) =>
      r.caveat ? <span className="text-text-muted">{r.caveat}</span> : <span className="text-text-muted">—</span>,
  },
]

export default function Formulas() {
  const [quantityMode, setQuantityMode] = useState<QuantityMode>('elasticity_model')
  const [lagDays, setLagDays] = useState(30)
  const query = useFormulas({ quantity_mode: quantityMode, lag_days: lagDays })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Index formulas</h1>
        <p className="max-w-3xl text-sm text-text-muted">
          The same price movement measured eight ways. The published APIx is the Jevons index; the other seven
          are shown so the size of methodological choice is visible against the size of the market movement.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="quantity-mode" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Quantity mode
          </label>
          <select
            id="quantity-mode"
            value={quantityMode}
            onChange={(e) => setQuantityMode(e.target.value as QuantityMode)}
            className="rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {QUANTITY_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="lag-days" className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Lag (days)
          </label>
          <input
            id="lag-days"
            type="number"
            min={1}
            max={365}
            value={lagDays}
            onChange={(e) => setLagDays(Number(e.target.value) || 1)}
            className="tabular-nums w-28 rounded-sm border border-border bg-surface px-3 py-1.5 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
        </div>
      </div>

      {query.isLoading ? (
        <LoadingSkeleton rows={5} height={20} label="Loading formulas" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.results.length === 0 ? (
        <EmptyState title="No formula results available" />
      ) : (
        <>
          {query.data.quantity_mode === 'fixed' ? (
            <div className="rounded-md border-2 border-warn/50 bg-warn/10 p-4">
              <p className="text-sm font-semibold text-warn">
                Fixed quantity mode: five of the eight formulas are equal by construction
              </p>
              <p className="mt-1 text-sm text-text">
                With quantities held fixed, Laspeyres and Paasche are identical, and Fisher, Törnqvist and Walsh
                collapse onto them. Their agreement below is arithmetic, not evidence that the market did not
                move.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatTile
              label="Spread across methods"
              value={query.data.spread.toFixed(4)}
              sublabel="The range between the highest and lowest of the eight formula values. This is the number that matters most."
              accent
            />
            <StatTile label="Headline (Jevons)" value={query.data.headline} sublabel="The published APIx methodology." />
            <StatTile
              label="Elasticity assumption"
              value={query.data.elasticity != null ? query.data.elasticity.toFixed(2) : '—'}
              sublabel={`Comparison ${query.data.comparison_date} → ${query.data.date}`}
            />
          </div>

          <ChartCard
            title="Formula values, shared axis"
            description="All eight methods on the same scale. The Jevons headline is distinguished from the rest."
          >
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={query.data.results} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                    width={48}
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
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {query.data.results.map((r) => (
                      <Cell
                        key={r.name}
                        fill={
                          r.name === query.data!.headline
                            ? 'var(--color-accent)'
                            : DE_EMPHASISED.has(r.name)
                              ? 'rgb(var(--color-border-rgb))'
                              : 'var(--color-text-muted)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="All eight formulas" description="Name, value, description and caveat.">
            <DataTable
              columns={COLUMNS}
              rows={query.data.results}
              getRowKey={(r) => r.name}
              initialSortKey="value"
              caption="Index formula values"
            />
          </ChartCard>

          <Caveats title="Notes" items={query.data.notes} variant="note" />
        </>
      )}
    </div>
  )
}
