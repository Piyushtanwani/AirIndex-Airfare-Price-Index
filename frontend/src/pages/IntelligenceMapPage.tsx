import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { IndiaMap } from '../components/map/IndiaMap'
import type { RegionFilter } from '../components/map/MapToolbar'
import { FlightDrawer } from '../components/map/FlightDrawer'
import { AlternativeFlightsDrawer } from '../components/map/AlternativeFlightsDrawer'
import { AirportModal } from '../components/map/AirportModal'
import { CorridorBottomSheet } from '../components/map/CorridorBottomSheet'
import { getTodayFlightStatus } from '../services/liveFlightStatus'
import type { LiveFlightStatusData } from '../services/liveFlightStatus'
import { subscribeToLiveFlights } from '../services/websocketService'
import { ROUTES_DATA, NATIONAL_STATS, TREND_DATA } from '../data/routes'
import { AIRPORTS } from '../data/airports'
import type { SourcedAirport } from '../data/airports'
import { LIVE_FLIGHTS_DATA } from '../data/liveStatus'
import { ShieldCheck, TrendingUp } from 'lucide-react'
import type {
  LeadTimeFilter,
  AirlineFilter,
  MetricViewFilter,
  RouteData,
  NationalStats,
} from '../types/map'
import type { FlightData } from '../types/flight'

// Lead Time multiplier map
const LEAD_TIME_CONFIG: Record<
  LeadTimeFilter,
  { fareMult: number; apixDelta: number; volDelta: number; windowDays: number }
> = {
  '1 Day': { fareMult: 1.18, apixDelta: 8.4, volDelta: 6.2, windowDays: 1 },
  '7 Day': { fareMult: 1.1, apixDelta: 4.2, volDelta: 3.1, windowDays: 7 },
  '15 Day': { fareMult: 1.0, apixDelta: 0.0, volDelta: 0.0, windowDays: 15 },
  '30 Day': { fareMult: 0.92, apixDelta: -3.5, volDelta: -2.8, windowDays: 30 },
  '45 Day': { fareMult: 0.86, apixDelta: -6.1, volDelta: -4.5, windowDays: 45 },
}

// Carrier adjustment map
const AIRLINE_CONFIG: Record<
  AirlineFilter,
  { fareMult: number; apixDelta: number }
> = {
  All: { fareMult: 1.0, apixDelta: 0.0 },
  IndiGo: { fareMult: 0.96, apixDelta: -1.8 },
  'Air India': { fareMult: 1.12, apixDelta: 3.5 },
  Akasa: { fareMult: 0.93, apixDelta: -2.4 },
  SpiceJet: { fareMult: 1.02, apixDelta: 1.1 },
}

export const IntelligenceMapPage: React.FC = () => {
  const [searchQuery] = useState('')
  const [selectedRegion] = useState<RegionFilter>('All')
  const [hotspotsOnly] = useState(false)
  const [leadTime] = useState<LeadTimeFilter>('15 Day')
  const [airline] = useState<AirlineFilter>('All')
  const [viewMetric] = useState<MetricViewFilter>('APIx')
  const [selectedFlight, setSelectedFlight] = useState<FlightData | null>(null)
  const [selectedAirport, setSelectedAirport] = useState<SourcedAirport | null>(null)
  const [selectedCorridorLine, setSelectedCorridorLine] = useState<RouteData | null>(null)
  
  // Sync map page dark mode with global navbar theme (data-theme on html)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  })

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      setDarkMode(isDark)
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  const [liveFlightDataState, setLiveFlightDataState] = useState<FlightData[]>(LIVE_FLIGHTS_DATA)
  const selectedDate = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [liveStatus, setLiveStatus] = useState<LiveFlightStatusData | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false)
  const [showAlternatives, setShowAlternatives] = useState(false)
  const refreshKey = 0

  // Subscribe to WebSocket /ws/flights for real-time aircraft position updates
  useEffect(() => {
    const unsubscribe = subscribeToLiveFlights((updates) => {
      setLiveFlightDataState((prevFlights) =>
        prevFlights.map((fl) => {
          const match = updates.find(
            (u) => u.id === fl.id || (u.flightNo && u.flightNo === fl.flightNo),
          )
          if (match) {
            return {
              ...fl,
              latitude: match.latitude ?? fl.latitude,
              longitude: match.longitude ?? fl.longitude,
              progress: match.progress ?? fl.progress,
            }
          }
          return fl
        }),
      )
    })

    return () => unsubscribe()
  }, [])

  // Fetch operational status for selected flight & date
  useEffect(() => {
    if (!selectedFlight) {
      setLiveStatus(null)
      setIsLoadingStatus(false)
      return
    }

    let active = true
    const flNo = selectedFlight.flightNo || selectedFlight.flightNumber || selectedFlight.id
    setIsLoadingStatus(true)

    getTodayFlightStatus(flNo, selectedDate).then((statusData) => {
      if (active) {
        setLiveStatus(statusData)
        setIsLoadingStatus(false)
      }
    })

    return () => {
      active = false
    }
  }, [selectedFlight, selectedDate])

  // 1. TanStack Query Backend Integration
  const leadConfig = LEAD_TIME_CONFIG[leadTime]
  const { data: apiRoutesData } = useQuery<RouteData[]>({
    queryKey: ['routes', selectedRegion, airline, leadTime, hotspotsOnly, viewMetric],
    queryFn: async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/v1/routes?window=${leadConfig.windowDays}&carrier=${encodeURIComponent(airline)}`,
        )
        if (!res.ok) throw new Error('API offline')
        const data = await res.json()
        return data as RouteData[]
      } catch {
        return ROUTES_DATA
      }
    },
    staleTime: 60000,
  })

  const baseRoutes = apiRoutesData && apiRoutesData.length > 0 ? apiRoutesData : ROUTES_DATA

  // 2. Functional State Derivation via useMemo
  const filteredRoutes = useMemo(() => {
    const lt = LEAD_TIME_CONFIG[leadTime]
    const al = AIRLINE_CONFIG[airline]

    return baseRoutes
      .map((r) => {
        const adjustedFare = Math.round(r.cheapestFare * lt.fareMult * al.fareMult)
        const adjustedHighest = Math.round(r.highestFare * lt.fareMult * al.fareMult)
        const adjustedApix = Math.max(80.0, Number((r.apix + lt.apixDelta + al.apixDelta).toFixed(1)))
        const adjustedVol = Math.max(3.0, Number((r.volatility + lt.volDelta).toFixed(1)))
        const status =
          adjustedApix > 115.0
            ? 'Hot'
            : adjustedApix >= 108.0
              ? 'Rising'
              : adjustedApix >= 102.0
                ? 'Stable'
                : 'Falling'

        return {
          ...r,
          cheapestFare: adjustedFare,
          highestFare: adjustedHighest,
          apix: adjustedApix,
          volatility: adjustedVol,
          status: status as RouteData['status'],
        }
      })
      .filter((r) => {
        if (hotspotsOnly && r.apix <= 115.0 && r.volatility <= 12.0) return false
        if (selectedRegion !== 'All') {
          const orig = AIRPORTS.find((a) => a.code === r.origin)
          const dest = AIRPORTS.find((a) => a.code === r.destination)
          if (orig?.region !== selectedRegion && dest?.region !== selectedRegion) return false
        }
        if (searchQuery) {
          const q = searchQuery.toUpperCase().trim()
          const orig = AIRPORTS.find((a) => a.code === r.origin)
          const dest = AIRPORTS.find((a) => a.code === r.destination)

          const matchCode = r.origin.includes(q) || r.destination.includes(q)
          const matchCity =
            (orig && orig.city.toUpperCase().includes(q)) ||
            (dest && dest.city.toUpperCase().includes(q)) ||
            (orig && orig.name.toUpperCase().includes(q)) ||
            (dest && dest.name.toUpperCase().includes(q))
          const matchRoute = `${r.origin}-${r.destination}`.includes(q)

          if (!matchCode && !matchCity && !matchRoute) return false
        }
        return true
      })
  }, [baseRoutes, leadTime, airline, hotspotsOnly, selectedRegion, searchQuery])

  // Dynamic Flight Observations list mapped to filtered routes
  const filteredFlights = useMemo(() => {
    return liveFlightDataState.filter((fl) => {
      if (airline !== 'All' && fl.airline !== airline) return false
      return filteredRoutes.some(
        (r) => r.origin === fl.origin && r.destination === fl.destination,
      )
    }).map((fl) => {
      const parentRoute = filteredRoutes.find(
        (r) => r.origin === fl.origin && r.destination === fl.destination,
      )
      return {
        ...fl,
        apix: parentRoute?.apix || fl.apix,
        cheapestFare: parentRoute?.cheapestFare || fl.cheapestFare,
        highestFare: parentRoute?.highestFare || fl.highestFare,
        averageFare: parentRoute
          ? Math.round((parentRoute.cheapestFare + parentRoute.highestFare) / 2)
          : fl.averageFare,
        volatility: parentRoute?.volatility || fl.volatility,
        leadTime: leadTime,
      }
    })
  }, [liveFlightDataState, filteredRoutes, airline, leadTime])

  // Map route clicks to matching flight object for unified drawer display
  const handleSelectRoute = useCallback(
    (route: RouteData | null) => {
      if (!route) {
        setSelectedFlight(null)
        return
      }
      const match = filteredFlights.find(
        (f) => f.origin === route.origin && f.destination === route.destination,
      )
      if (match) {
        setSelectedFlight(match)
      } else {
        const origAirport = AIRPORTS.find((a) => a.code === route.origin)
        const destAirport = AIRPORTS.find((a) => a.code === route.destination)

        const synFlight: FlightData = {
          id: `route-${route.id}`,
          flightNo: `6E${Math.floor(100 + Math.random() * 900)}`,
          flightNumber: `6E-${Math.floor(100 + Math.random() * 900)}`,
          airline: 'IndiGo',
          aircraft: 'Airbus A320neo',
          origin: route.origin,
          originCity: origAirport?.city || route.origin,
          destination: route.destination,
          destCity: destAirport?.city || route.destination,
          distanceKm: 1150,
          departureTime: '08:30 IST',
          arrivalTime: '11:00 IST',
          status: 'enroute',
          progress: 45,
          speed: '780 km/h',
          altitude: '34,000 ft',
          heading: 145,
          apix: route.apix,
          cheapestFare: route.cheapestFare,
          highestFare: route.highestFare,
          averageFare: Math.round((route.cheapestFare + route.highestFare) / 2),
          volatility: route.volatility,
          trust: 98.4,
          leadTime: leadTime,
          latitude: (origAirport?.coordinates[1] || 20) + 1.5,
          longitude: (origAirport?.coordinates[0] || 78) + 1.5,
        }
        setSelectedFlight(synFlight)
      }
    },
    [filteredFlights, leadTime],
  )

  // Automatically close flight drawer if the selected flight disappears due to filters
  useEffect(() => {
    if (selectedFlight) {
      const isVisible = filteredFlights.some(
        (f) =>
          f.id === selectedFlight.id ||
          (f.origin === selectedFlight.origin && f.destination === selectedFlight.destination),
      )
      if (!isVisible) setSelectedFlight(null)
    }
  }, [filteredFlights, selectedFlight])

  // Recalculate National KPI summary dynamically
  const derivedNationalStats = useMemo<NationalStats>(() => {
    if (filteredRoutes.length === 0) return NATIONAL_STATS

    const totalApix = filteredRoutes.reduce((acc, r) => acc + r.apix, 0)
    const avgApix = Number((totalApix / filteredRoutes.length).toFixed(1))
    const totalChange = filteredRoutes.reduce((acc, r) => acc + r.change, 0)
    const avgChange = Number((totalChange / filteredRoutes.length).toFixed(1))
    const totalObs = filteredRoutes.reduce((acc, r) => acc + r.observations, 0)

    return {
      apix: avgApix,
      change: avgChange,
      observationCount: totalObs,
      trustScore: 98.4,
    }
  }, [filteredRoutes])

  // Trend data for FlightDrawer sparkline chart
  const derivedTrendData = useMemo(() => {
    const mult = LEAD_TIME_CONFIG[leadTime].fareMult
    return TREND_DATA.map((pt) => ({
      ...pt,
      apix: Number((pt.apix * mult).toFixed(1)),
    }))
  }, [leadTime])



  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100 dark:bg-[#030914]">
      {/* FULL BLEED BACKGROUND MAP */}
      <div className="absolute inset-0 h-full w-full">
        <IndiaMap
          key={refreshKey}
          routes={filteredRoutes}
          selectedRoute={null}
          onSelectRoute={handleSelectRoute}
          searchQuery={searchQuery}
          selectedRegion={selectedRegion}
          hotspotsOnly={hotspotsOnly}
          viewMetric={viewMetric}
          flights={filteredFlights}
          selectedFlight={selectedFlight}
          onSelectFlight={setSelectedFlight}
          darkMode={darkMode}
          onSelectAirport={setSelectedAirport}
          onSelectCorridorLine={setSelectedCorridorLine}
        />
      </div>

      {/* FLOATING TOP-RIGHT NATIONAL KPI WIDGETS */}
      <div className="pointer-events-auto absolute bottom-5 right-4 z-20 flex flex-wrap gap-2 sm:bottom-auto sm:top-20 sm:right-6 sm:flex-col items-end">
        <div className={`flex items-center gap-2.5 rounded-2xl border px-3 py-1.5 shadow-lg backdrop-blur-md transition ${
          darkMode ? 'border-slate-800/80 bg-slate-900/85 text-white' : 'border-slate-200/80 bg-white/90 text-slate-900'
        }`}>
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
            <TrendingUp size={15} />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              National APIx
            </div>
            <div className="font-mono text-xs font-extrabold text-teal-400">
              {derivedNationalStats.apix.toFixed(1)}
            </div>
          </div>
        </div>

        <div className={`flex items-center gap-2.5 rounded-2xl border px-3 py-1.5 shadow-lg backdrop-blur-md transition ${
          darkMode ? 'border-slate-800/80 bg-slate-900/85 text-white' : 'border-slate-200/80 bg-white/90 text-slate-900'
        }`}>
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <ShieldCheck size={15} />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Trust Score
            </div>
            <div className="font-mono text-xs font-extrabold text-emerald-400">
              {derivedNationalStats.trustScore}%
            </div>
          </div>
        </div>
      </div>

      {/* SINGLE MASTER FLIGHT INTELLIGENCE DRAWER */}
      <FlightDrawer
        flight={selectedFlight}
        liveStatus={liveStatus}
        isLoadingStatus={isLoadingStatus}
        selectedDate={selectedDate}
        trendData={derivedTrendData}
        darkMode={darkMode}
        onClose={() => setSelectedFlight(null)}
        onViewAlternatives={() => setShowAlternatives(true)}
      />

      {/* ALTERNATIVE FLIGHTS REBOOKING DRAWER */}
      <AlternativeFlightsDrawer
        isOpen={showAlternatives}
        selectedFlight={selectedFlight}
        allFlights={filteredFlights}
        darkMode={darkMode}
        onSelectFlight={(fl) => {
          setSelectedFlight(fl)
          setShowAlternatives(false)
        }}
        onClose={() => setShowAlternatives(false)}
      />

      {/* AIRPORT INTELLIGENCE MODAL */}
      <AirportModal
        airport={selectedAirport}
        darkMode={darkMode}
        onClose={() => setSelectedAirport(null)}
        onSelectCorridor={(orig, dest) => {
          const foundRoute = filteredRoutes.find(
            (r) => (r.origin === orig && r.destination === dest) || (r.origin === dest && r.destination === orig),
          )
          if (foundRoute) {
            handleSelectRoute(foundRoute)
          }
        }}
      />

      {/* CORRIDOR ROUTE INTELLIGENCE BOTTOM SHEET */}
      <CorridorBottomSheet
        route={selectedCorridorLine}
        darkMode={darkMode}
        onClose={() => setSelectedCorridorLine(null)}
      />
    </div>
  )
}

export default IntelligenceMapPage


