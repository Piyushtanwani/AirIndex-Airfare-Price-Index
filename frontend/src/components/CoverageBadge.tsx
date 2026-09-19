interface CoverageBadgeProps {
  coverage: number
}

export function CoverageBadge({ coverage }: CoverageBadgeProps) {
  const pct = coverage * 100
  const tone = pct >= 90 ? 'text-fall bg-fall/10' : pct >= 60 ? 'text-rise bg-rise/10' : 'text-warn bg-warn/10'
  return (
    <span className={`tabular-nums inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      Coverage {pct.toFixed(0)}%
    </span>
  )
}

interface ProvisionalBadgeProps {
  provisional: boolean
}

export function ProvisionalBadge({ provisional }: ProvisionalBadgeProps) {
  if (!provisional) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2.5 py-0.5 text-xs font-medium text-warn">
      Provisional
    </span>
  )
}
