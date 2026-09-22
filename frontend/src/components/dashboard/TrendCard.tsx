import React from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { TrendPoint } from '../../types/map'
import { TrendingUp, Activity } from 'lucide-react'

interface TrendCardProps {
  data: TrendPoint[]
}

export const TrendCard: React.FC<TrendCardProps> = ({ data }) => {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white p-4.5 shadow-sm">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Activity size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              90-Day Index Trend
            </h3>
            <span className="text-[11px] text-slate-400">
              National Airfare Series
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
          <TrendingUp size={12} />
          +2.4%
        </div>
      </div>

      <div className="h-[130px] w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
          >
            <defs>
              <linearGradient id="apiLightGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748B', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={['dataMin - 1', 'dataMax + 1']}
              tick={{ fill: '#64748B', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const val = payload[0].value as number
                  const dateStr = payload[0].payload.date
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-md">
                      <div className="font-semibold text-slate-500">{dateStr}</div>
                      <div className="mt-0.5 font-mono text-sm font-bold text-slate-900">
                        APIx: {val.toFixed(1)}
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Area
              type="monotone"
              dataKey="apix"
              stroke="#2563EB"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#apiLightGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
