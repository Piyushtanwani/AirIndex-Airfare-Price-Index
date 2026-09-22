import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RouteData } from '../../types/map'
import { TrendingUp, TrendingDown, ShieldCheck, Clock, Layers } from 'lucide-react'

interface RouteTooltipProps {
  route: RouteData | null
  mousePos: { x: number; y: number }
}

export const RouteTooltip: React.FC<RouteTooltipProps> = ({ route, mousePos }) => {
  if (!route) return null

  const isPositive = route.change >= 0

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 5 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="pointer-events-none fixed z-50 min-w-[240px] rounded-[16px] border border-white/15 bg-[#08111F]/90 p-4 text-white shadow-2xl backdrop-blur-xl"
        style={{
          left: `${mousePos.x + 16}px`,
          top: `${mousePos.y + 16}px`,
        }}
      >
        {/* Header: Origin -> Destination */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white">
              {route.origin}
            </span>
            <span className="text-xs font-semibold text-[#34D6FF]">→</span>
            <span className="text-lg font-bold tracking-tight text-white">
              {route.destination}
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isPositive
                ? 'bg-[#FF5A5F]/15 text-[#FF5A5F] border border-[#FF5A5F]/30'
                : 'bg-[#2ED47A]/15 text-[#2ED47A] border border-[#2ED47A]/30'
            }`}
          >
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isPositive ? `+${route.change}%` : `${route.change}%`}
          </span>
        </div>

        {/* Details Grid */}
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Current APIx</span>
            <span className="font-mono text-sm font-bold text-[#34D6FF]">
              {route.apix.toFixed(1)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-400">
              <Layers size={12} className="text-slate-500" />
              Observations
            </span>
            <span className="font-medium text-slate-200">{route.observations}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-slate-400">
              <ShieldCheck size={12} className="text-[#2ED47A]" />
              Trust Score
            </span>
            <span className="font-medium text-[#2ED47A]">{route.trustScore}/100</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Cheapest Fare</span>
            <span className="font-semibold text-slate-200">
              ₹{route.cheapestFare.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              Last Updated
            </span>
            <span>{route.lastUpdated}</span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
