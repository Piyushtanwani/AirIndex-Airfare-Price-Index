import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useIndex } from '../hooks/useApi'
import { formatIndex, formatShortDate } from '../lib/format'

const WINDOWS = ['T+1', 'T+7', 'T+15', 'T+30', 'T+45'] as const

function LeadTimeChart({ windowKey }: { windowKey: (typeof WINDOWS)[number] }) {
  const query = useIndex({ scope: 'national', window: windowKey })

  return (
    <ChartCard title={windowKey} description={`National index filtered to bookings made ${windowKey.replace('T+', '')} days before departure.`}>
      {query.isLoading ? (
        <LoadingSkeleton rows={3} height={16} label={`Loading ${windowKey}`} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data || query.data.items.length === 0 ? (
        <EmptyState title="No data for this booking window" />
      ) : (
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={query.data.items} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                minTickGap={30}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
                tickLine={false}
                width={36}
              />
              <Tooltip
                formatter={(value) => formatIndex(Number(value))}
                labelFormatter={(label) => formatShortDate(String(label))}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="apix" stroke="var(--color-accent)" strokeWidth={2} strokeLinecap="round" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  )
}

export default function LeadTimes() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Lead-time analysis</h1>
        <p className="max-w-3xl text-sm text-text-muted">
          The index is compiled across five booking windows, from a departure booked one day ahead (T+1) to
          forty-five days ahead (T+45). Airlines commonly apply revenue-management pricing that raises fares
          as a departure date nears and as remaining seats fall, so the same route can show materially
          different price relatives across windows on the same day. Comparing the small multiples below
          shows how sensitive a route or the national basket is to booking lead time, which matters for
          households timing a purchase and for interpreting the national APIx, itself a weighted blend of
          all five windows.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {WINDOWS.map((w) => (
          <LeadTimeChart key={w} windowKey={w} />
        ))}
      </div>
    </div>
  )
}
