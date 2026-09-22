import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FlightData } from '../../types/map'
import {
  X,
  Plane,
  Clock,
  Navigation,
  Gauge,
  Compass,
  DollarSign,
  TrendingUp,
  Activity,
  Calendar,
  Building2,
} from 'lucide-react'

interface AircraftDrawerProps {
  flight: FlightData | null
  onClose: () => void
}

export const AircraftDrawer: React.FC<AircraftDrawerProps> = ({ flight, onClose }) => {
  if (!flight) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '-100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '-100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        className="fixed left-0 top-20 z-40 flex h-[calc(100vh-6rem)] w-[380px] flex-col overflow-y-auto border-r border-slate-700/60 bg-slate-900/95 p-5 text-white shadow-2xl backdrop-blur-xl rounded-r-[24px]"
      >
        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-extrabold text-teal-400">
                {flight.flightNumber}
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                {flight.airline}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{flight.aircraft}</p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-md bg-blue-900/40 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-700/50">
                Domestic
              </span>
              <span className="rounded-md bg-emerald-900/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-700/50">
                Scheduled
              </span>
              <span className="rounded-md bg-teal-900/40 px-2 py-0.5 text-[10px] font-bold text-teal-300 border border-teal-700/50">
                {flight.status}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* HERO IMAGE CARD */}
        <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-br from-slate-800 to-slate-950 p-4 shadow-inner">
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-teal-400">
                <Plane size={14} className="rotate-45" /> Live Radar Tracking
              </span>
              <span className="font-mono text-[11px] text-slate-400">AirIndex Grid</span>
            </div>
            <div className="text-center">
              <span className="font-mono text-3xl font-black tracking-widest text-slate-100">
                {flight.flightNumber}
              </span>
              <p className="text-[11px] font-medium text-slate-400">
                {flight.originCity} ({flight.origin}) → {flight.destCity} ({flight.destination})
              </p>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>ALT {flight.altitude}</span>
              <span>SPD {flight.speed}</span>
            </div>
          </div>
        </div>

        {/* ROUTE FLIGHTRADAR24 PROGRESS SECTION */}
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <div className="flex items-center justify-between text-center">
            <div className="text-left">
              <div className="font-mono text-2xl font-black text-white">{flight.origin}</div>
              <div className="text-xs font-semibold text-slate-300">{flight.originCity}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                <Clock size={11} /> {flight.departureTime}
              </div>
            </div>

            {/* Flight Path Graphic */}
            <div className="flex flex-1 flex-col items-center px-4">
              <div className="relative flex w-full items-center justify-center">
                <div className="h-[2px] w-full bg-slate-700" />
                <div
                  className="absolute top-1/2 -translate-y-1/2 text-teal-400 transition-all duration-300"
                  style={{ left: `${flight.progress}%` }}
                >
                  <Plane size={16} className="rotate-90" />
                </div>
              </div>
              <span className="mt-2 text-[11px] font-semibold text-slate-400">
                {flight.distanceKm.toLocaleString()} km
              </span>
            </div>

            <div className="text-right">
              <div className="font-mono text-2xl font-black text-white">{flight.destination}</div>
              <div className="text-xs font-semibold text-slate-300">{flight.destCity}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400 justify-end">
                <Clock size={11} /> {flight.arrivalTime}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-slate-400">Flight Progress</span>
              <span className="font-mono text-teal-400">{flight.progress}% Complete</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${flight.progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* TWO-COLUMN LIVE FLIGHT STATS GRID */}
        <div className="mt-5 space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Live Flight & Tariff Metrics
          </h4>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <TrendingUp size={12} className="text-teal-400" /> APIx Index
              </span>
              <div className="mt-1 font-mono text-base font-extrabold text-teal-300">
                {flight.apix.toFixed(1)}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <Activity size={12} className="text-amber-400" /> Volatility
              </span>
              <div className="mt-1 font-mono text-base font-extrabold text-amber-300">
                {flight.volatility}%
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <DollarSign size={12} className="text-emerald-400" /> Cheapest Fare
              </span>
              <div className="mt-1 font-mono text-base font-extrabold text-emerald-400">
                ₹{flight.cheapestFare.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <DollarSign size={12} className="text-red-400" /> Highest Fare
              </span>
              <div className="mt-1 font-mono text-base font-extrabold text-red-400">
                ₹{flight.highestFare.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <DollarSign size={12} className="text-blue-400" /> Average Fare
              </span>
              <div className="mt-1 font-mono text-base font-extrabold text-blue-300">
                ₹{flight.averageFare.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <Calendar size={12} className="text-purple-400" /> Lead Window
              </span>
              <div className="mt-1 font-mono text-sm font-bold text-slate-200">
                {flight.leadTime}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <Navigation size={12} className="text-slate-400" /> Altitude
              </span>
              <div className="mt-1 font-mono text-sm font-bold text-slate-200">
                {flight.altitude}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <Gauge size={12} className="text-slate-400" /> Speed
              </span>
              <div className="mt-1 font-mono text-sm font-bold text-slate-200">
                {flight.speed}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <Compass size={12} className="text-slate-400" /> Heading
              </span>
              <div className="mt-1 font-mono text-sm font-bold text-slate-200">
                {flight.heading}°
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/50 p-2.5">
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
                <Building2 size={12} className="text-slate-400" /> Airline
              </span>
              <div className="mt-1 font-mono text-sm font-bold text-slate-200">
                {flight.airline}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
