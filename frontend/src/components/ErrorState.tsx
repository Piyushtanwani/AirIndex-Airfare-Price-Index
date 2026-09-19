import { ApiError } from '../lib/api'

interface ErrorStateProps {
  error: unknown
  onRetry: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const message =
    error instanceof ApiError
      ? `${error.status ? `HTTP ${error.status} — ` : ''}${error.message}`
      : error instanceof Error
        ? error.message
        : 'An unknown error occurred.'

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-warn/30 bg-warn/[0.06] p-5">
      <p className="text-sm font-medium text-warn">Could not load this data.</p>
      <p className="text-sm text-text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-text shadow-sm hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Retry
      </button>
    </div>
  )
}
