import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { ChartCard } from '../components/ChartCard'
import { CoverageBadge, ProvisionalBadge } from '../components/CoverageBadge'
import { DeltaBadge } from '../components/DeltaBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useContributions, useIndex, useIndexLatest } from '../hooks/useApi'
import { formatDateTime, formatIndex, formatShortDate } from '../lib/format'

const TOP_CONTRIBUTIONS = 12

export default function Overview() {
  const latestQuery = useIndexLatest({ scope: 'national' })
  const seriesQuery = useIndex({ scope: 'national', window: 'all' })
  const contributionsQuery = useContributions({})

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">National overview</h1>
        <p className="text-sm text-text-muted">The Airfare Price Index (APIx) at national scope.</p>
      </div>

      <section aria-label="Headline index">
        {latestQuery.isLoading ? (
          <LoadingSkeleton rows={2} height={72} label="Loading headline index" />
        ) : latestQuery.isError ? (
          <ErrorState error={latestQuery.error} onRetry={() => latestQuery.refetch()} />
        ) : !latestQuery.data || !latestQuery.data.item ? (
          <EmptyState title="No index value published" />
        ) : (
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">APIx &middot; national</p>
              <ProvisionalBadge provisional={latestQuery.data.item.provisional} />
              <CoverageBadge coverage={latestQuery.data.item.coverage} />
            </div>
            <p className="tabular-nums mt-3 text-6xl font-semibold leading-none tracking-tight text-text sm:text-7xl">
              {formatIndex(latestQuery.data.item.apix)}
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                Week-on-week <DeltaBadge value={latestQuery.data.item.wow_pct} label="Week-on-week" />
              </div>
              <div className="flex items-center gap-2 text-sm text-text-muted">
                Month-on-month <DeltaBadge value={latestQuery.data.item.mom_pct} label="Month-on-month" />
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Last published {formatDateTime(latestQuery.data.item.published_at)} &middot;{' '}
              {latestQuery.data.item.obs_count.toLocaleString('en-IN')} observations
              {latestQuery.data.item.imputed_cells > 0 ? ` · ${latestQuery.data.item.imputed_cells} imputed cells` : ''}
            </p>
          </div>
        )}
      </section>

      <ChartCard title="90-day national index" description="Daily published APIx value, national scope.">
        {seriesQuery.isLoading ? (
          <LoadingSkeleton rows={4} height={20} label="Loading index history" />
        ) : seriesQuery.isError ? (
          <ErrorState error={seriesQuery.error} onRetry={() => seriesQuery.refetch()} />
        ) : !seriesQuery.data || seriesQuery.data.items.length === 0 ? (
          <EmptyState title="No index history available" />
        ) : (
          <div className="h-72 w-full">
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
        )}
      </ChartCard>

      <ChartCard title="Top movers" description="Largest week-on-week movers among routes in the basket.">
        {latestQuery.isLoading ? (
          <LoadingSkeleton rows={3} height={20} label="Loading top movers" />
        ) : latestQuery.isError ? (
          <ErrorState error={latestQuery.error} onRetry={() => latestQuery.refetch()} />
        ) : !latestQuery.data || latestQuery.data.top_movers.length === 0 ? (
          <EmptyState title="No movers reported" />
        ) : (
          <ul className="divide-y divide-border">
            {latestQuery.data.top_movers.map((mover) => (
              <li key={mover.code} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/routes/${mover.code}`} className="font-medium text-text hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  {mover.code}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-text-muted">{formatIndex(mover.apix)}</span>
                  <DeltaBadge value={mover.wow_pct} label="Week-on-week" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard
        title="Contributions to the change"
        description={
          contributionsQuery.data
            ? `Top contributing route/lead-time cells to the ${contributionsQuery.data.apix_change_pct > 0 ? '+' : ''}${contributionsQuery.data.apix_change_pct.toFixed(2)}% move from ${contributionsQuery.data.previous_date} to ${contributionsQuery.data.date}.`
            : 'Top contributing route/lead-time cells to the most recent change.'
        }
      >
        {contributionsQuery.isLoading ? (
          <LoadingSkeleton rows={4} height={20} label="Loading contributions" />
        ) : contributionsQuery.isError ? (
          <ErrorState error={contributionsQuery.error} onRetry={() => contributionsQuery.refetch()} />
        ) : !contributionsQuery.data || contributionsQuery.data.rows.length === 0 ? (
          <EmptyState title="No contribution data available" />
        ) : (
          (() => {
            const rows = contributionsQuery.data.rows.slice(0, TOP_CONTRIBUTIONS)
            return (
              <div className="w-full" style={{ height: Math.max(240, rows.length * 28) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}`}
                      tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="cell"
                      width={100}
                      tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(4)} pp`}
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-md)',
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="contribution_pct" radius={[0, 3, 3, 0]}>
                      {rows.map((row) => (
                        <Cell key={row.cell} fill={row.contribution_pct >= 0 ? 'var(--color-rise)' : 'var(--color-fall)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()
        )}
      </ChartCard>
    </div>
  )
}
