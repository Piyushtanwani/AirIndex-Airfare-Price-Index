import { formatPercent } from '../lib/format'

interface DeltaBadgeProps {
  value: number
  label?: string
}

// Semantics: a RISE in the airfare index is bad news for consumers (fares
// costlier), shown in the warm "rise" colour; a FALL is good news for
// consumers, shown in the cool "fall" colour. This is called out in the
// accessible label so the meaning is never ambiguous from colour alone.
export function DeltaBadge({ value, label }: DeltaBadgeProps) {
  const isRise = value > 0
  const isFall = value < 0
  const colorClass = isRise ? 'text-rise bg-rise/10' : isFall ? 'text-fall bg-fall/10' : 'text-text-muted bg-surface-alt'
  const direction = isRise ? 'up (fares costlier)' : isFall ? 'down (fares cheaper)' : 'unchanged'

  return (
    <span
      className={`tabular-nums inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${colorClass}`}
      aria-label={`${label ? `${label}: ` : ''}${direction}, ${formatPercent(value)}`}
    >
      {formatPercent(value)}
    </span>
  )
}
