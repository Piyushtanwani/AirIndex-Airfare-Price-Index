interface LoadingSkeletonProps {
  rows?: number
  height?: number
  label?: string
}

export function LoadingSkeleton({ rows = 3, height = 16, label = 'Loading data' }: LoadingSkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="w-full space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-sm bg-surface-alt"
          style={{ height, width: i === rows - 1 ? '60%' : '100%' }}
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}
