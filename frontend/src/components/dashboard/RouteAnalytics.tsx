import React from 'react'
import type { RouteData, NationalStats, TrendPoint, ContributorItem } from '../../types/map'
import { TrendCard } from './TrendCard'
import {
  TrendingUp,
  ShieldCheck,
  Plane,
  Sparkles,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react'

interface RouteAnalyticsProps {
  nationalStats: NationalStats
  selectedRoute: RouteData
  trendData: TrendPoint[]
  topContributors: ContributorItem[]
  onSelectRoute: (route: RouteData) => void
}

export const RouteAnalytics: React.FC<RouteAnalyticsProps> = ({
  nationalStats,
  selectedRoute,
  trendData,
  topContributors,
  onSelectRoute,
}) => {
  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto pr-1">
      {/* CARD 1: National APIx */}
      <div className="rounded-[16px] border border-slate-200 bg-white p-4.5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              National Airfare Index (APIx)
            </span>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900">
                {nationalStats.apix.toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700 border border-red-200">
                <TrendingUp size={13} />
                +{nationalStats.change}%
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end text-right">
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <ShieldCheck size={14} />
              {nationalStats.trustScore}% Trust
            </span>
            <span className="mt-1 text-[11px] text-slate-400">
              {nationalStats.observationCount.toLocaleString()} Fares
            </span>
          </div>
        </div>
      </div>

      {/* CARD 2: 90-Day Trend Chart */}
      <TrendCard data={trendData} />

      {/* CARD 3: Selected Route Details */}
      <div
        onClick={() => onSelectRoute(selectedRoute)}
        className="group cursor-pointer rounded-[16px] border border-slate-200 bg-white p-4.5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs">
              <Plane size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold tracking-tight text-slate-900">
                  {selectedRoute.origin} → {selectedRoute.destination}
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                  Idx {selectedRoute.apix.toFixed(1)}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Corridor Statistical Diagnostics
              </span>
            </div>
          </div>
          <ArrowUpRight
            size={18}
            className="text-slate-400 transition group-hover:text-slate-800 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Cheapest
            </span>
            <div className="mt-1 font-mono font-bold text-emerald-700">
              ₹{selectedRoute.cheapestFare.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Highest
            </span>
            <div className="mt-1 font-mono font-bold text-red-600">
              ₹{selectedRoute.highestFare.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Average
            </span>
            <div className="mt-1 font-mono font-bold text-slate-900">
              ₹{Math.round((selectedRoute.cheapestFare + selectedRoute.highestFare) / 2).toLocaleString('en-IN')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Volatility
            </span>
            <div className="mt-1 font-mono font-bold text-amber-600">
              {selectedRoute.volatility}%
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Observations
            </span>
            <div className="mt-1 font-mono font-bold text-slate-800">
              {selectedRoute.observations.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">
              Updated
            </span>
            <div className="mt-1 font-mono text-[11px] font-semibold text-slate-600">
              Today
            </div>
          </div>
        </div>
      </div>

      {/* CARD 4: Top Route Contributors */}
      <div className="rounded-[16px] border border-slate-200 bg-white p-4.5 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-amber-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Top Corridor Contributors
            </h3>
          </div>
          <span className="text-[10px] text-slate-400">Decomposition</span>
        </div>

        <div className="space-y-3 pt-0.5">
          {topContributors.map((item) => (
            <div key={item.route} className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-600">
                    {item.rank}
                  </span>
                  {item.route}
                </span>
                <span className="font-mono font-bold text-amber-600">
                  +{item.contribution.toFixed(2)} pts
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500"
                  style={{ width: `${item.sharePercent * 2.5}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CARD 5: AI Intelligence Insight */}
      <div className="rounded-[16px] border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
            <Sparkles size={16} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900">
                MoSPI AI Statistical Summary
              </h4>
              <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-800">
                Grounded
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">
              "Delhi–Mumbai contributed 32% of today's national airfare inflation
              due to strong business travel demand and tighter lead-time booking
              inventory across major carriers."
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
