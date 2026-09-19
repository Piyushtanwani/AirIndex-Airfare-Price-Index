interface EmptyStateProps {
  title?: string
  message?: string
}

export function EmptyState({ title = 'No data available', message = 'There are no records to display for this selection.' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border bg-surface-alt/60 p-5">
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="text-sm text-text-muted">{message}</p>
    </div>
  )
}
