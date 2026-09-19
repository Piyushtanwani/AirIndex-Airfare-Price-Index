interface CaveatsProps {
  title?: string
  items: string[]
  variant?: 'warning' | 'note'
}

// Shared surface for every `notes` / `warnings` / `caveat` field the analytics
// endpoints return. These describe the limits of the numbers on the page and
// must never be collapsed, truncated, or dropped — see api-contract-analytics.md.
export function Caveats({ title, items, variant = 'note' }: CaveatsProps) {
  const cleaned = items.filter((item) => item && item.trim().length > 0)
  if (cleaned.length === 0) return null

  const isWarning = variant === 'warning'
  const toneClasses = isWarning ? 'border-warn/30 bg-warn/[0.06]' : 'border-border bg-surface-alt/60'
  const titleClasses = isWarning ? 'text-warn' : 'text-text-muted'
  const barClasses = isWarning ? 'bg-warn/50' : 'bg-border'

  return (
    <section
      aria-label={title ?? (isWarning ? 'Warnings' : 'Notes')}
      className={`relative overflow-hidden rounded-lg border pl-5 pr-4 py-4 ${toneClasses}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${barClasses}`} />
      <p className={`text-xs font-semibold uppercase tracking-wide ${titleClasses}`}>
        {title ?? (isWarning ? 'Warnings' : 'Notes')}
      </p>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        {cleaned.map((item, i) => (
          <li key={i} className="text-sm leading-relaxed text-text">
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
