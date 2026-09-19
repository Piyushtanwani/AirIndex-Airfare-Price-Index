import type { ReactNode } from 'react'

interface StatTileProps {
  label: string
  value: ReactNode
  sublabel?: ReactNode
  accent?: boolean
}

export function StatTile({ label, value, sublabel, accent }: StatTileProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-4 shadow-sm ${accent ? 'ring-1 ring-accent/30' : ''}`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="tabular-nums mt-1 text-[1.75rem] font-semibold leading-none tracking-tight text-text">{value}</p>
      {sublabel ? <div className="mt-2 text-sm text-text-muted">{sublabel}</div> : null}
    </div>
  )
}
