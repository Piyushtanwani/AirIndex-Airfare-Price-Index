import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface KPICardProps {
  title: string
  subtitle?: string
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  changePct?: number
  trustScore?: number
  obsCount?: number
  icon?: LucideIcon
  children?: React.ReactNode
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  subtitle,
  value,
  prefix = '',
  suffix = '',
  decimals = 1,
  changePct,
  trustScore,
  obsCount,
  icon: Icon,
  children,
}) => {
  const [displayValue, setDisplayValue] = useState(0)

  // Animated Count-up Effect on Load
  useEffect(() => {
    let start = 0
    const duration = 1000
    const startTime = performance.now()

    const updateCount = (currentTime: number) => {
      const elapsedTime = currentTime - startTime
      const progress = Math.min(elapsedTime / duration, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      const current = start + (value - start) * easedProgress
      setDisplayValue(current)

      if (progress < 1) {
        requestAnimationFrame(updateCount)
      }
    }

    requestAnimationFrame(updateCount)
  }, [value])

  const isPositiveChange = changePct !== undefined && changePct >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-[16px] border border-slate-200 bg-white p-4.5 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-1.5">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Icon size={16} />
            </div>
          )}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              {title}
            </h3>
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
        </div>

        {/* Change Badge */}
        {changePct !== undefined && (
          <div
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
              isPositiveChange
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {isPositiveChange ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isPositiveChange ? `+${changePct}%` : `${changePct}%`}
          </div>
        )}
      </div>

      {/* Main Number */}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-extrabold tracking-tight text-slate-900">
          {prefix}
          {displayValue.toFixed(decimals)}
          {suffix}
        </span>
      </div>

      {/* Footer Details */}
      {(trustScore !== undefined || obsCount !== undefined) && (
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
          {obsCount !== undefined && (
            <span>
              <strong className="font-mono text-slate-800">
                {obsCount.toLocaleString()}
              </strong>{' '}
              validated fares
            </span>
          )}

          {trustScore !== undefined && (
            <span className="flex items-center gap-1 font-semibold text-emerald-700">
              <ShieldCheck size={13} />
              {trustScore}% Trust
            </span>
          )}
        </div>
      )}

      {children && <div className="mt-3">{children}</div>}
    </motion.div>
  )
}
