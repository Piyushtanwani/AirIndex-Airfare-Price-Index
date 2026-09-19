import { useNavigate } from 'react-router-dom'
import { CoverageBadge } from '../components/CoverageBadge'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { DeltaBadge } from '../components/DeltaBadge'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useRoutes } from '../hooks/useApi'
import { formatIndex } from '../lib/format'
import type { RouteItem } from '../lib/api'

export default function Routes() {
  const routesQuery = useRoutes()
  const navigate = useNavigate()

  const columns: DataTableColumn<RouteItem>[] = [
    { key: 'code', header: 'Code', accessor: (r) => r.code, sortable: true },
    {
      key: 'pair',
      header: 'City pair',
      accessor: (r) => `${r.origin_city} – ${r.dest_city}`,
      sortable: true,
    },
    { key: 'weight', header: 'Weight', accessor: (r) => r.weight, sortable: true, align: 'right', render: (r) => r.weight.toFixed(4) },
    { key: 'latest_apix', header: 'Latest index', accessor: (r) => r.latest_apix, sortable: true, align: 'right', render: (r) => formatIndex(r.latest_apix) },
    { key: 'wow_pct', header: 'WoW', accessor: (r) => r.wow_pct, sortable: true, align: 'right', render: (r) => <DeltaBadge value={r.wow_pct} label="Week-on-week" /> },
    { key: 'mom_pct', header: 'MoM', accessor: (r) => r.mom_pct, sortable: true, align: 'right', render: (r) => <DeltaBadge value={r.mom_pct} label="Month-on-month" /> },
    { key: 'obs_30d', header: '30-day obs', accessor: (r) => r.obs_30d, sortable: true, align: 'right', render: (r) => r.obs_30d.toLocaleString('en-IN') },
    { key: 'coverage', header: 'Coverage', accessor: (r) => r.coverage, sortable: true, align: 'right', render: (r) => <CoverageBadge coverage={r.coverage} /> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Routes</h1>
        <p className="text-sm text-text-muted">All routes in the basket. Select a row to open the route detail.</p>
      </div>

      {routesQuery.isLoading ? (
        <LoadingSkeleton rows={6} height={24} label="Loading routes" />
      ) : routesQuery.isError ? (
        <ErrorState error={routesQuery.error} onRetry={() => routesQuery.refetch()} />
      ) : !routesQuery.data || routesQuery.data.items.length === 0 ? (
        <EmptyState title="No routes configured" />
      ) : (
        <DataTable
          columns={columns}
          rows={routesQuery.data.items}
          getRowKey={(r) => r.id}
          initialSortKey="weight"
          onRowClick={(r) => navigate(`/routes/${r.code}`)}
          caption="Routes in the AirIndex basket"
        />
      )}
    </div>
  )
}
