import { Caveats } from '../components/Caveats'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useTrust } from '../hooks/useApi'
import type { TrustComponent } from '../lib/api'

function bandTone(band: string): string {
  const b = band.toLowerCase()
  if (b === 'publishable') return 'text-fall bg-fall/10'
  if (b === 'usable with caveats') return 'text-accent bg-accent-muted'
  if (b === 'indicative only') return 'text-rise bg-rise/10'
  if (b === 'not fit for publication') return 'text-warn bg-warn/10'
  return 'text-text-muted bg-surface-alt'
}

function ComponentCard({ component }: { component: TrustComponent }) {
  const notMeasured = !component.measured || component.score === null
  const scoreTone = notMeasured ? 'text-text-muted' : component.score! >= 70 ? 'text-fall' : component.score! >= 40 ? 'text-rise' : 'text-warn'

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{component.name}</p>
      {notMeasured ? (
        <p className="tabular-nums mt-1 text-2xl font-semibold text-text-muted" aria-label="Not measured">
          Not measured
        </p>
      ) : (
        <p className={`tabular-nums mt-1 text-2xl font-semibold ${scoreTone}`}>{component.score!.toFixed(0)}</p>
      )}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-alt" role="presentation">
        {notMeasured ? (
          <div
            className="h-full w-full bg-[repeating-linear-gradient(45deg,var(--color-border),var(--color-border)_6px,transparent_6px,transparent_12px)]"
            aria-hidden="true"
          />
        ) : (
          <div
            className={`h-full rounded-full ${component.score! >= 70 ? 'bg-fall' : component.score! >= 40 ? 'bg-rise' : 'bg-warn'}`}
            style={{ width: `${Math.max(0, Math.min(100, component.score!))}%` }}
          />
        )}
      </div>
      <p className="mt-2 text-sm text-text-muted">{component.detail}</p>
    </div>
  )
}

export default function Trust() {
  const query = useTrust()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Data trust</h1>
        <p className="max-w-3xl text-sm text-text-muted">
          A composite score for how much weight the current data can bear, broken into the components that make
          it up. A component that could not be measured is shown as such, never as a zero or a full mark.
        </p>
      </div>

      {query.isLoading ? (
        <LoadingSkeleton rows={4} height={20} label="Loading trust score" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data ? (
        <EmptyState title="No trust score available" />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Overall trust score</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <p className="tabular-nums text-5xl font-semibold text-text">
                {query.data.overall != null ? query.data.overall.toFixed(0) : '—'}
              </p>
              <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-sm font-medium ${bandTone(query.data.band)}`}>
                {query.data.band}
              </span>
            </div>
            <p className="mt-2 text-xs text-text-muted">As of {query.data.as_of ?? '—'}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.components.map((c) => (
              <ComponentCard key={c.name} component={c} />
            ))}
          </div>

          <Caveats title="Warnings" items={query.data.warnings} variant="warning" />
        </>
      )}
    </div>
  )
}
