const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrNumberFormatter = new Intl.NumberFormat('en-IN')

export function formatInr(value: number): string {
  return inrFormatter.format(value)
}

export function formatIndianNumber(value: number): string {
  return inrNumberFormatter.format(value)
}

export function formatIndex(value: number): string {
  return value.toFixed(1)
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '' : '±'
  return `${sign}${value.toFixed(1)}%`
}

export function formatDate(value: string): string {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('en-IN', { year: 'numeric', month: 'short', day: '2-digit' }).format(date)
  } catch {
    return value
  }
}

export function formatDateTime(value: string): string {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return value
  }
}

export function formatShortDate(value: string): string {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('en-IN', { month: 'short', day: '2-digit' }).format(date)
  } catch {
    return value
  }
}
