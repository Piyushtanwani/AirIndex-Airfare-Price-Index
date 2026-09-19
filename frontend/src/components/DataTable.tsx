import { useMemo, useState, type ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  header: string
  accessor: (row: T) => string | number | null | undefined
  render?: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'right'
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  initialSortKey?: string
  initialSortDir?: 'asc' | 'desc'
  caption?: string
}

type SortDir = 'asc' | 'desc'

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  initialSortKey,
  initialSortDir = 'desc',
  caption,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialSortDir)

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    const column = columns.find((c) => c.key === sortKey)
    if (!column) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = column.accessor(a)
      const bv = column.accessor(b)
      if (av == null && bv == null) return 0
      if (av == null) return sortDir === 'asc' ? 1 : -1
      if (bv == null) return sortDir === 'asc' ? -1 : 1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return copy
  }, [rows, sortKey, sortDir, columns])

  function handleSort(column: DataTableColumn<T>) {
    if (!column.sortable) return
    if (sortKey === column.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(column.key)
      setSortDir('desc')
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-surface-alt/70">
          <tr className="text-left">
            {columns.map((column) => {
              const isSorted = sortKey === column.key
              const ariaSort = column.sortable ? (isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`py-2.5 px-3 text-xs font-medium uppercase tracking-wide text-text-muted first:rounded-l-sm last:rounded-r-sm ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column)}
                      className="inline-flex items-center gap-1 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {column.header}
                      {isSorted ? <span aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-border/70 last:border-0 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-surface-alt/60' : 'hover:bg-surface-alt/40'}`}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`tabular-nums py-2 px-3 text-text ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {column.render ? column.render(row) : column.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
