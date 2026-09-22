import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RouteData } from '../../types/map'
import {
  X,
  Plane,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

interface RouteDrawerProps {
  route: RouteData | null
  onClose: () => void
}

const SPARKLINE_DATA = [
  { day: 'Day 1', price: 4280 },
  { day: 'Day 5', price: 4350 },
  { day: 'Day 10', price: 4120 },
  { day: 'Day 15', price: 4800 },
  { day: 'Day 20', price: 4650 },
  { day: 'Day 25', price: 5100 },
  { day: 'Day 30', price: 5420 },
]

const LEAD_TIME_BREAKDOWN = [
  { leadTime: 'T+1 (1 Day)', minFare: 8900, avgFare: 11200, obs: 84 },
  { leadTime: 'T+7 (7 Days)', minFare: 5600, avgFare: 7400, obs: 92 },
  { leadTime: 'T+15 (15 Days)', minFare: 4280, avgFare: 5900, obs: 78 },
  { leadTime: 'T+30 (30 Days)', minFare: 3850, avgFare: 4900, obs: 42 },
  { leadTime: 'T+45 (45 Days)', minFare: 3500, avgFare: 4300, obs: 32 },
]

export const RouteDrawer: React.FC<RouteDrawerProps> = ({ route, onClose }) => {
  if (!route) return null

  const isPositive = route.change >= 0

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs"
      />

      {/* Slide-over Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white p-6 text-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
              <Plane size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {route.origin} → {route.destination}
              </h2>
              <p className="text-xs text-slate-500">
                Aviation Corridor Diagnostics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pt-4 space-y-4 pr-1">
          {/* Headline APIx */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase text-slate-500">
                  Corridor APIx Index
                </span>
                <div className="mt-1 font-mono text-3xl font-extrabold text-slate-900">
                  {route.apix.toFixed(1)}
                </div>
              </div>

              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                  isPositive
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {isPositive ? `+${route.change}%` : `${route.change}%`}
              </div>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Cheapest Fare
              </span>
              <div className="mt-1 font-mono text-base font-bold text-emerald-700">
                ₹{route.cheapestFare.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Highest Fare
              </span>
              <div className="mt-1 font-mono text-base font-bold text-red-600">
                ₹{route.highestFare.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Volatility
              </span>
              <div className="mt-1 font-mono text-base font-bold text-amber-600">
                {route.volatility}%
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <span className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
                <ShieldCheck size={12} className="text-emerald-600" />
                Trust
              </span>
              <div className="mt-1 font-mono text-base font-bold text-emerald-700">
                {route.trustScore}/100
              </div>
            </div>
          </div>

          {/* 30-Day Sparkline */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between pb-2">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-700">
                <Activity size={14} className="text-blue-600" />
                30-Day Fare Velocity
              </span>
              <span className="text-[10px] text-slate-400">Min Fare Trajectory</span>
            </div>
            <div className="h-24 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={SPARKLINE_DATA}>
                  <defs>
                    <linearGradient id="drawerSparkLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" hide />
                  <YAxis domain={['dataMin - 200', 'dataMax + 200']} hide />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white p-1.5 text-xs font-bold text-slate-900 shadow-md">
                            ₹{(payload[0].value as number).toLocaleString('en-IN')}
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#2563EB"
                    strokeWidth={2}
                    fill="url(#drawerSparkLight)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lead Time Breakdown */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-bold uppercase text-slate-700 pb-2.5">
              Lead Time Booking Curve Breakdown
            </h4>
            <div className="space-y-1.5 text-xs">
              {LEAD_TIME_BREAKDOWN.map((lt) => (
                <div
                  key={lt.leadTime}
                  className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5"
                >
                  <span className="text-slate-700 font-medium">{lt.leadTime}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-slate-900 font-semibold">
                      ₹{lt.minFare.toLocaleString('en-IN')}
                    </span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.2 text-[10px] text-slate-600">
                      {lt.obs} obs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Observation Metadata */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <Layers size={14} /> Total Valid Fares:
            </span>
            <span className="font-mono font-bold text-slate-900">
              {route.observations}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
