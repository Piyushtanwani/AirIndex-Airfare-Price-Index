import React, { useState, useRef, useEffect } from 'react'
import type { LeadTimeFilter, AirlineFilter, MetricViewFilter } from '../../types/map'
import { AIRPORTS } from '../../data/airports'
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  Flame,
  Filter,
  Download,
  X,
  MapPin,
  Plane,
  Sliders,
} from 'lucide-react'

export type RegionFilter = 'All' | 'North' | 'South' | 'East' | 'West' | 'Central' | 'Northeast'

interface MapToolbarProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  selectedRegion: RegionFilter
  onRegionChange: (region: RegionFilter) => void
  hotspotsOnly: boolean
  onToggleHotspots: () => void
  leadTime: LeadTimeFilter
  onLeadTimeChange: (lt: LeadTimeFilter) => void
  airline: AirlineFilter
  onAirlineChange: (al: AirlineFilter) => void
  viewMetric: MetricViewFilter
  onViewMetricChange: (vm: MetricViewFilter) => void
  selectedDate?: string
  onDateChange?: (d: string) => void
  darkMode?: boolean
  showControls: boolean
  onToggleControls: () => void
  onRefresh: () => void
  onExport: () => void
}

export const MapToolbar: React.FC<MapToolbarProps> = ({
  searchQuery,
  onSearchChange,
  selectedRegion,
  onRegionChange,
  hotspotsOnly,
  onToggleHotspots,
  leadTime,
  onLeadTimeChange,
  airline,
  onAirlineChange,
  viewMetric,
  onViewMetricChange,
  selectedDate = new Date().toISOString().slice(0, 10),
  onDateChange,
  darkMode = false,
  showControls,
  onToggleControls,
  onRefresh,
  onExport,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const REGIONS: RegionFilter[] = [
    'All',
    'North',
    'South',
    'East',
    'West',
    'Central',
    'Northeast',
  ]

  // Flight numbers list for search autocomplete
  const KNOWN_FLIGHTS = [
    { code: 'SG8194', airline: 'SpiceJet', route: 'AMD → DEL', type: 'flight' },
    { code: '6E218', airline: 'IndiGo', route: 'DEL → BOM', type: 'flight' },
    { code: 'AI864', airline: 'Air India', route: 'DEL → CCU', type: 'flight' },
    { code: 'AI402', airline: 'Air India', route: 'AMD → DEL', type: 'flight' },
    { code: '6E5321', airline: 'IndiGo', route: 'AMD → DEL', type: 'flight' },
    { code: 'UK955', airline: 'Air India', route: 'AMD → DEL', type: 'flight' },
    { code: 'QP1301', airline: 'Akasa', route: 'BOM → BLR', type: 'flight' },
  ]

  // Filter autocomplete suggestions for airports and flight numbers
  const q = searchQuery.trim().toLowerCase()
  const airportSuggestions = q
    ? AIRPORTS.filter(
        (a) =>
          a.code.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q),
      ).map((a) => ({ code: a.code, title: `${a.code} - ${a.city}`, region: a.region, type: 'airport' }))
    : []

  const flightSuggestions = q
    ? KNOWN_FLIGHTS.filter(
        (f) =>
          f.code.toLowerCase().includes(q) ||
          f.airline.toLowerCase().includes(q) ||
          f.route.toLowerCase().includes(q),
      ).map((f) => ({ code: f.code, title: `${f.code} (${f.airline})`, region: f.route, type: 'flight' }))
    : []

  const allSuggestions = [...flightSuggestions, ...airportSuggestions].slice(0, 6)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Primary Floating Bar (Leakpoint style) */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-full border px-4 py-2 shadow-lg backdrop-blur-md transition duration-300 ${
        darkMode ? 'border-slate-800 bg-slate-900/90 text-white' : 'border-slate-200/90 bg-white/95 text-slate-900'
      }`}>
        {/* Search Input & Region Chips */}
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          {/* Search with Autocomplete */}
          <div ref={searchRef} className="relative min-w-[220px] flex-1 max-w-sm">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search flight (6E218) or airport (DEL)..."
              value={searchQuery}
              onFocus={() => setShowSuggestions(true)}
              onChange={(e) => {
                onSearchChange(e.target.value)
                setShowSuggestions(true)
              }}
              className={`w-full rounded-full border py-1.5 pl-9 pr-7 text-xs font-medium outline-none transition ${
                darkMode
                  ? 'border-slate-700/80 bg-slate-800/80 text-white placeholder-slate-400 focus:border-teal-400'
                  : 'border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:bg-white'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  onSearchChange('')
                  setShowSuggestions(false)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}

            {/* Autocomplete Dropdown */}
            {showSuggestions && allSuggestions.length > 0 && (
              <div className={`absolute left-0 top-full z-50 mt-2 w-full rounded-2xl border py-1.5 shadow-2xl backdrop-blur-md ${
                darkMode ? 'border-slate-700 bg-slate-900/95 text-white' : 'border-slate-200 bg-white/95 text-slate-900'
              }`}>
                {allSuggestions.map((item) => (
                  <button
                    key={`${item.type}-${item.code}`}
                    onClick={() => {
                      onSearchChange(item.code)
                      setShowSuggestions(false)
                    }}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition ${
                      darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {item.type === 'flight' ? (
                        <Plane size={13} className="text-teal-400" />
                      ) : (
                        <MapPin size={13} className="text-slate-400" />
                      )}
                      <span className="font-bold">{item.title}</span>
                    </div>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
                      {item.region}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Region Chips (Desktop) */}
          <div className="hidden lg:flex items-center gap-1">
            {REGIONS.map((region) => (
              <button
                key={region}
                onClick={() => onRegionChange(region)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  selectedRegion === region
                    ? darkMode ? 'bg-teal-500 text-slate-950 font-bold shadow-xs' : 'bg-slate-900 text-white font-semibold shadow-xs'
                    : darkMode ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Controls Pill Button (Matching Leakpoint template) */}
          <button
            onClick={onToggleControls}
            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition shadow-sm ${
              showControls
                ? 'border-teal-400 bg-teal-500/20 text-teal-400'
                : darkMode
                  ? 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                  : 'border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200'
            }`}
          >
            <Sliders size={13} />
            <span>Controls</span>
          </button>

          {/* Refresh View */}
          <button
            onClick={onRefresh}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
              darkMode ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="Refresh Map Data"
          >
            <RotateCcw size={13} />
          </button>

          {/* Export PDF */}
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 rounded-full bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Expandable Controls Drawer (when Controls pill is clicked) */}
      {showControls && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 shadow-xl backdrop-blur-md transition ${
          darkMode ? 'border-slate-800 bg-slate-900/95 text-white' : 'border-slate-200 bg-white/95 text-slate-900'
        }`}>
          {/* Region Chips for smaller screens */}
          <div className="flex lg:hidden flex-wrap items-center gap-1 w-full pb-2 border-b border-slate-700/40">
            {REGIONS.map((region) => (
              <button
                key={region}
                onClick={() => onRegionChange(region)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  selectedRegion === region
                    ? darkMode ? 'bg-teal-500 text-slate-950 font-bold' : 'bg-slate-900 text-white font-semibold'
                    : darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {region}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Hotspots Toggle */}
            <button
              onClick={onToggleHotspots}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                hotspotsOnly
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : darkMode
                    ? 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Flame size={14} className={hotspotsOnly ? 'text-red-600' : 'text-slate-400'} />
              Hotspots Only
            </button>

            {/* Lead Time Selector */}
            <div className={`flex items-center gap-1 rounded-full border p-1 text-xs ${
              darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'
            }`}>
              <SlidersHorizontal size={13} className="ml-2 text-slate-400" />
              {(['1 Day', '7 Day', '15 Day', '30 Day', '45 Day'] as LeadTimeFilter[]).map(
                (lt) => (
                  <button
                    key={lt}
                    onClick={() => onLeadTimeChange(lt)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                      leadTime === lt
                        ? darkMode ? 'bg-teal-500 text-slate-950 font-bold shadow-xs' : 'bg-white text-slate-900 font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lt}
                  </button>
                ),
              )}
            </div>

            {/* Airline Filter */}
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
              darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}>
              <Filter size={13} className="text-slate-400" />
              <select
                value={airline}
                onChange={(e) => onAirlineChange(e.target.value as AirlineFilter)}
                className="bg-transparent text-xs font-medium outline-none cursor-pointer"
              >
                <option value="All">All Carriers</option>
                <option value="IndiGo">IndiGo</option>
                <option value="Air India">Air India</option>
                <option value="Akasa">Akasa</option>
                <option value="SpiceJet">SpiceJet</option>
              </select>
            </div>

            {/* Date Picker Input */}
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
              darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange?.(e.target.value)}
                className="bg-transparent text-xs font-semibold outline-none cursor-pointer"
              />
            </div>

            {/* View Metric Filter */}
            <div className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs ${
              darkMode ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}>
              <select
                value={viewMetric}
                onChange={(e) => onViewMetricChange(e.target.value as MetricViewFilter)}
                className="bg-transparent text-xs font-semibold outline-none cursor-pointer"
              >
                <option value="APIx">View: APIx Index</option>
                <option value="Average Fare">View: Average Fare</option>
                <option value="Volatility">View: Volatility</option>
                <option value="Inflation Score">View: Inflation Score</option>
                <option value="Demand Pressure">View: Demand Pressure</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
