import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { StatTile } from '../components/StatTile'
import { useQualitySummary } from '../hooks/useApi'
import { formatDateTime, formatIndianNumber, formatShortDate } from '../lib/format'
import type { QualitySource } from '../lib/api'

export default function Quality() {
  const query = useQualitySummary()

  const sourceColumns: DataTableColumn<QualitySource>[] = [
    { key: 'name', header: 'Source', accessor: (s) => s.name, sortable: true },
    { key: 'kind', header: 'Kind', accessor: (s) => s.kind, sortable: true },
    { key: 'enabled', header: 'Enabled', accessor: (s) => (s.enabled ? 1 : 0), sortable: true, render: (s) => (s.enabled ? 'Yes' : 'No') },
    { key: 'robots_ok', header: 'Robots OK', accessor: (s) => (s.robots_ok ? 1 : 0), sortable: true, render: (s) => (s.robots_ok ? 'Yes' : 'No') },
    { key: 'last_run_at', header: 'Last run', accessor: (s) => s.last_run_at, sortable: true, render: (s) => formatDateTime(s.last_run_at) },
    { key: 'last_status', header: 'Last status', accessor: (s) => s.last_status, sortable: true },
    { key: 'requests', header: 'Requests', accessor: (s) => s.requests, sortable: true, align: 'right', render: (s) => formatIndianNumber(s.requests) },
    { key: 'failures', header: 'Failures', accessor: (s) => s.failures, sortable: true, align: 'right', render: (s) => formatIndianNumber(s.failures) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Data quality</h1>
        <p className="text-sm text-text-muted">Validation, exclusion and source-health metrics over the trailing window.</p>
      </div>

      {query.isLoading ? (
        <LoadingSkeleton rows={4} height={80} label="Loading data quality summary" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <EmptyState title="No quality summary available" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Validation pass rate" value={`${(query.data.totals.validation_pass_rate * 100).toFixed(1)}%`} />
            <StatTile label="Duplicates rejected" value={formatIndianNumber(query.data.totals.duplicates_rejected)} />
            <StatTile label="Outliers excluded" value={formatIndianNumber(query.data.totals.outliers_excluded)} />
            <StatTile label="Imputed cells" value={formatIndianNumber(query.data.totals.imputed_cells)} />
            <StatTile
              label="Latest coverage"
              value={query.data.totals.coverage_latest != null ? `${(query.data.totals.coverage_latest * 100).toFixed(0)}%` : '—'}
            />
          </div>

          <ChartCard title="Daily valid vs invalid observations" description={`Trailing ${query.data.window_days} days.`}>
            {query.data.daily.length === 0 ? (
              <EmptyState title="No daily observation data" />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={query.data.daily} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'var(--color-text-muted)' }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                      width={44}
                    />
                    <Tooltip
                      labelFormatter={(label) => formatShortDate(String(label))}
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-md)',
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="valid" stackId="obs" name="Valid" fill="var(--color-fall)" />
                    <Bar dataKey="invalid" stackId="obs" name="Invalid" fill="var(--color-warn)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Source health">
            {query.data.sources.length === 0 ? (
              <EmptyState title="No sources configured" />
            ) : (
              <DataTable columns={sourceColumns} rows={query.data.sources} getRowKey={(s) => s.code} initialSortKey="name" caption="Source health" />
            )}
          </ChartCard>
        </>
      )}
    </div>
  )
}
