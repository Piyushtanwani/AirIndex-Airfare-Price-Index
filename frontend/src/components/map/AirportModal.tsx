import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, MapPin, Plane, DollarSign, CloudSun, Globe, ArrowRight } from 'lucide-react'
import type { SourcedAirport } from '../../data/airports'

interface AirportModalProps {
  airport: SourcedAirport | null
  darkMode?: boolean
  onClose: () => void
  onSelectCorridor?: (origin: string, dest: string) => void
}

export const AirportModal: React.FC<AirportModalProps> = ({
  airport,
  darkMode,
  onClose,
  onSelectCorridor,
}) => {
  const isDark = darkMode ?? (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark')

  if (!airport) return null

  const flightsToday = airport.code === 'DEL' ? 1420 : airport.code === 'BOM' ? 1180 : 420
  const avgFare = airport.code === 'DEL' ? 6850 : airport.code === 'BOM' ? 7120 : 5400
  const topDestinations = airport.code === 'DEL'
    ? ['BOM', 'BLR', 'CCU', 'HYD', 'GAU']
    : airport.code === 'BOM'
      ? ['DEL', 'BLR', 'HYD', 'MAA', 'GOI']
      : ['DEL', 'BOM', 'BLR']
  const onwardConnections = ['DXB', 'LHR', 'SIN', 'JFK']
  const weather = '28°C Clear'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isDark ? 0.4 : 0.2 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-slate-950 backdrop-blur-sm"
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className={`fixed left-1/2 top-1/2 z-[70] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[24px] border p-6 shadow-2xl backdrop-blur-xl ${
          isDark
            ? 'border-slate-700/60 bg-[#071A33]/95 text-white'
            : 'border-slate-200/90 bg-white/95 text-slate-800'
        }`}
      >
        {/* Header */}
        <div className={`flex items-start justify-between border-b pb-4 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
              isDark
                ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                : 'bg-teal-50 text-teal-600 border-teal-200'
            }`}>
              <MapPin size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-2xl font-black ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>{airport.code}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {airport.region} Region
                </span>
              </div>
              <h3 className={`text-sm font-bold mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>{airport.name}</h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{airport.city}, India</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`rounded-full p-1.5 transition ${
              isDark
                ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Airport Key Metrics */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className={`rounded-xl border p-3 text-center ${
            isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200/90 bg-slate-50/70 shadow-sm'
          }`}>
            <div className={`flex items-center justify-center gap-1 text-[10px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <Plane size={12} className={isDark ? 'text-teal-400' : 'text-teal-600'} /> Flights Today
            </div>
            <div className={`mt-1 font-mono text-lg font-black ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>
              {flightsToday.toLocaleString()}
            </div>
          </div>

          <div className={`rounded-xl border p-3 text-center ${
            isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200/90 bg-slate-50/70 shadow-sm'
          }`}>
            <div className={`flex items-center justify-center gap-1 text-[10px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <DollarSign size={12} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} /> Avg Fare
            </div>
            <div className={`mt-1 font-mono text-lg font-black ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
              ₹{avgFare.toLocaleString('en-IN')}
            </div>
          </div>

          <div className={`rounded-xl border p-3 text-center ${
            isDark ? 'border-slate-800 bg-slate-800/40' : 'border-slate-200/90 bg-slate-50/70 shadow-sm'
          }`}>
            <div className={`flex items-center justify-center gap-1 text-[10px] font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <CloudSun size={12} className={isDark ? 'text-amber-400' : 'text-amber-600'} /> Weather
            </div>
            <div className={`mt-1 text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {weather}
            </div>
          </div>
        </div>

        {/* Top Destinations */}
        <div className="mt-5 space-y-2">
          <h4 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Top Connected Corridors
          </h4>
          <div className="flex flex-wrap gap-2">
            {topDestinations.map((dest) => (
              <button
                key={dest}
                onClick={() => {
                  onSelectCorridor?.(airport.code, dest)
                  onClose()
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition shadow-sm hover:scale-105 ${
                  isDark
                    ? 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-teal-400 hover:text-teal-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-700 hover:bg-teal-50/30'
                }`}
              >
                <span>{airport.code}</span>
                <ArrowRight size={12} className={isDark ? 'text-slate-400' : 'text-slate-400'} />
                <span>{dest}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Onward International Connections */}
        <div className="mt-4 space-y-2">
          <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            <Globe size={12} /> Onward International Hubs
          </h4>
          <div className="flex flex-wrap gap-2 text-xs font-mono font-semibold">
            {onwardConnections.map((conn) => (
              <span key={conn} className={`rounded-md px-2 py-0.5 border ${
                isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                ✈️ {conn}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
