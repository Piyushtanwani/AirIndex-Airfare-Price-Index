import { Caveats } from '../components/Caveats'
import { ChartCard } from '../components/ChartCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useMethodology } from '../hooks/useApi'

export default function Methodology() {
  const query = useMethodology()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Methodology</h1>
        <p className="text-sm text-text-muted">
          Rendered directly from <code className="font-mono text-xs">GET /v1/methodology</code> so this page and the
          published method can never disagree.
        </p>
      </div>

      {query.isLoading ? (
        <LoadingSkeleton rows={6} height={20} label="Loading methodology" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <EmptyState title="Methodology unavailable" />
      ) : (
        <>
          <ChartCard title="Index definition">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Methodology version</dt>
                <dd className="text-sm text-text">{query.data.methodology_version}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Index type</dt>
                <dd className="text-sm text-text">{query.data.index_type}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Price basis</dt>
                <dd className="text-sm text-text">{query.data.price_basis}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Base period</dt>
                <dd className="tabular-nums text-sm text-text">
                  {query.data.base_period.start && query.data.base_period.end
                    ? `${query.data.base_period.start} to ${query.data.base_period.end} = ${query.data.base_period.value.toFixed(1)}`
                    : 'Not yet established'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Routes in basket</dt>
                <dd className="tabular-nums text-sm text-text">{query.data.routes_in_basket}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Cells in basket</dt>
                <dd className="tabular-nums text-sm text-text">{query.data.cells_in_basket}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Formula</p>
              <pre className="mt-1 overflow-x-auto rounded-sm border border-border bg-surface-alt p-3 font-mono text-xs text-text">
                {query.data.formula}
              </pre>
            </div>
          </ChartCard>

          <ChartCard title="Lead-time weights">
            <table className="w-full max-w-md border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 px-3 text-xs font-medium uppercase tracking-wide text-text-muted">Lead time</th>
                  <th scope="col" className="py-2 px-3 text-right text-xs font-medium uppercase tracking-wide text-text-muted">Weight</th>
                </tr>
              </thead>
              <tbody>
                {query.data.lead_times.map((lt) => (
                  <tr key={lt} className="border-b border-border last:border-0">
                    <td className="py-2 px-3 text-text">{`T+${lt}`}</td>
                    <td className="tabular-nums py-2 px-3 text-right text-text">
                      {(query.data!.lead_time_weights[String(lt)] ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>

          <ChartCard title="Thresholds and weighting">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Minimum observations per cell</dt>
                <dd className="tabular-nums text-sm text-text">{query.data.min_obs_per_cell}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">MAD outlier threshold</dt>
                <dd className="tabular-nums text-sm text-text">{query.data.mad_threshold}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Coverage publication threshold</dt>
                <dd className="tabular-nums text-sm text-text">{(query.data.coverage_threshold * 100).toFixed(0)}%</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Weights source</dt>
                <dd className="text-sm text-text">{query.data.weights_source}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">Weights as of</dt>
                <dd className="tabular-nums text-sm text-text">{query.data.weights_asof}</dd>
              </div>
            </dl>
          </ChartCard>

          <ChartCard title="Revisions policy">
            <p className="text-sm text-text">{query.data.revisions_policy}</p>
          </ChartCard>

          {query.data.weights_proxy_note ? (
            <Caveats
              title="The weights are a declared proxy"
              variant="warning"
              items={[query.data.weights_proxy_note]}
            />
          ) : null}

          {query.data.data_sources?.length ? (
            <ChartCard title="Data sources">
              <ul className="list-inside list-disc space-y-1 text-sm text-text">
                {query.data.data_sources.map((source, i) => (
                  <li key={i}>{source}</li>
                ))}
              </ul>
            </ChartCard>
          ) : null}

          {/* Known limitations are the most important thing on this page. They travel
              with the published method so that no figure can be quoted without them. */}
          {query.data.known_limitations?.length ? (
            <Caveats
              title="Known limitations of this index"
              items={query.data.known_limitations}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
