import React, { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import MapLibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AIRPORTS } from '../../data/airports'
import { generateCurvedRouteFeature } from './FlightRoute'
import type { SourcedAirport } from '../../data/airports'
import type { RouteData, MetricViewFilter } from '../../types/map'
import { RotateCcw, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react'
import type { RegionFilter } from './MapToolbar'

import type { FlightData } from '../../types/flight'

// Subcontinent Bounding Box: [Southwest [minLng, minLat], Northeast [maxLng, maxLat]]
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [67.5, 6.0], // Southwest
  [97.8, 37.5], // Northeast
]

const getResponsivePadding = (width: number) => {
  if (width >= 1200) {
    return { top: 70, left: 60, bottom: 50, right: 280 }
  } else if (width >= 900) {
    return { top: 60, left: 40, bottom: 40, right: 220 }
  } else if (width >= 600) {
    return { top: 40, left: 30, bottom: 40, right: 40 }
  } else {
    return { top: 30, left: 20, bottom: 120, right: 20 }
  }
}

// Reliable Light Grayscale OpenStreetMap Basemap (Positron Style)
const CARTO_POSITRON_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'carto-positron': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'carto-positron-layer',
      type: 'raster',
      source: 'carto-positron',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
}

// CartoDB Dark Matter Raster Style for Dark Mode
const CARTO_DARK_MATTER_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'carto-dark-layer',
      type: 'raster',
      source: 'carto-dark',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
}

interface IndiaMapProps {
  routes: RouteData[]
  selectedRoute: RouteData | null
  onSelectRoute: (route: RouteData) => void
  searchQuery: string
  selectedRegion: RegionFilter
  hotspotsOnly: boolean
  viewMetric: MetricViewFilter
  flights: FlightData[]
  selectedFlight: FlightData | null
  onSelectFlight: (flight: FlightData | null) => void
  darkMode?: boolean
  onSelectAirport?: (apt: SourcedAirport) => void
  onSelectCorridorLine?: (route: RouteData) => void
}

export const IndiaMap: React.FC<IndiaMapProps> = ({
  routes,
  selectedRoute,
  onSelectRoute,
  searchQuery,
  selectedRegion,
  hotspotsOnly,
  viewMetric,
  flights,
  selectedFlight,
  onSelectFlight,
  darkMode = false,
  onSelectAirport,
  onSelectCorridorLine,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const badgeMarkersRef = useRef<maplibregl.Marker[]>([])
  const planeMarkersRef = useRef<maplibregl.Marker[]>([])
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('ready')

  // Floating hover tooltip state
  const [hoveredRouteInfo, setHoveredRouteInfo] = useState<{
    route: RouteData
    x: number
    y: number
  } | null>(null)

  const fitIndiaBounds = (targetMap: maplibregl.Map, width?: number) => {
    const w = width || mapContainerRef.current?.clientWidth || window.innerWidth
    targetMap.fitBounds(INDIA_BOUNDS, {
      padding: getResponsivePadding(w),
      duration: 0,
      maxZoom: 6,
    })
  }

  // Collection protection guards to eliminate runtime crashes
  const safeRoutes = routes ?? []
  const safeAirports = AIRPORTS ?? []
  const safeFlights = flights ?? []

  // Airport Search Camera FlyTo Effect
  useEffect(() => {
    const map = mapRef.current
    if (!map || !searchQuery) return

    const q = searchQuery.toUpperCase().trim()
    const matchedAirport = safeAirports.find(
      (a) => a.code.includes(q) || a.city.toUpperCase().includes(q) || a.name.toUpperCase().includes(q),
    )

    if (matchedAirport) {
      map.flyTo({
        center: matchedAirport.coordinates,
        zoom: 5.8,
        duration: 1200,
        essential: true,
      })

      // Select strongest connected route if available
      const connectedRoute = safeRoutes.find(
        (r) => r.origin === matchedAirport.code || r.destination === matchedAirport.code,
      )
      if (connectedRoute) {
        onSelectRoute(connectedRoute)
      }
    }
  }, [searchQuery, safeAirports, safeRoutes, onSelectRoute])

  // Filter routes & airports based on toolbar inputs
  const filteredRoutes = safeRoutes.filter((r) => {
    if (hotspotsOnly && r.apix <= 115.0 && r.volatility <= 12.0) return false
    if (searchQuery) {
      const q = searchQuery.toUpperCase().trim()
      if (
        !r.origin.includes(q) &&
        !r.destination.includes(q) &&
        !`${r.origin}-${r.destination}`.includes(q)
      ) {
        return false
      }
    }
    if (selectedRegion !== 'All') {
      const origApt = safeAirports.find((a) => a.code === r.origin)
      const destApt = safeAirports.find((a) => a.code === r.destination)
      if (origApt?.region !== selectedRegion && destApt?.region !== selectedRegion) {
        return false
      }
    }
    return true
  })

  // Initialize MapLibre GL Map strictly once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    let isMounted = true

    const initialWidth = mapContainerRef.current.clientWidth || window.innerWidth
    const initialStyle = darkMode ? CARTO_DARK_MATTER_RASTER_STYLE : CARTO_POSITRON_RASTER_STYLE

    const mapOptions: maplibregl.MapOptions & { workerClass?: unknown } = {
      container: mapContainerRef.current,
      style: initialStyle,
      bounds: INDIA_BOUNDS,
      fitBoundsOptions: {
        padding: getResponsivePadding(initialWidth),
        maxZoom: 6,
      },
      pitch: 0, // Flat Mercator
      bearing: 0,
      attributionControl: false,
      dragRotate: true,
      touchPitch: false,
      cooperativeGestures: false,
      workerClass: MapLibreWorker,
    }

    const map = new maplibregl.Map(mapOptions as maplibregl.MapOptions)
    mapRef.current = map

    // Natural Touch & Desktop Gestures
    map.scrollZoom.enable()
    map.dragPan.enable({
      linearity: 0.3,
      easing: (t) => t * (2 - t),
    })
    map.touchZoomRotate.enable()
    map.doubleClickZoom.enable()
    map.boxZoom.disable()
    map.keyboard.enable()

    // Responsive fitBounds recalculation on container size change
    const containerEl = mapContainerRef.current
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (mapRef.current) {
          mapRef.current.resize()
          fitIndiaBounds(mapRef.current, entry.contentRect.width)
        }
      }
    })
    if (containerEl) {
      resizeObserver.observe(containerEl)
    }

    const markReady = () => {
      if (isMounted) {
        setMapStatus('ready')
      }
    }

    map.on('load', () => {
      markReady()
      fitIndiaBounds(map)

      // 1. Corridors Source & Layers
      const corridorFeatures = safeRoutes
        .map((r) => generateCurvedRouteFeature(r, viewMetric))
        .filter((f): f is NonNullable<typeof f> => f !== null)

      map.addSource('flight-corridors', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: corridorFeatures,
        },
      })

      // Base Corridor Line Layer
      map.addLayer({
        id: 'corridors-line',
        type: 'line',
        source: 'flight-corridors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': 0.9,
        },
      })

      // Hover Highlight Corridor Line Layer (4px width)
      map.addLayer({
        id: 'corridors-highlight',
        type: 'line',
        source: 'flight-corridors',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 1.0,
        },
        filter: ['==', ['get', 'id'], ''],
      })

      // 2. Airports Source & Native MapLibre Layers
      const airportFeatures = safeAirports.map((apt: SourcedAirport) => ({
        type: 'Feature' as const,
        properties: {
          code: apt.code,
          name: apt.name,
          city: apt.city,
          apix: apt.inflationScore,
          region: apt.region,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: apt.coordinates,
        },
      }))

      map.addSource('airports-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: airportFeatures,
        },
      })

      // Airport Node Circles (Black circle, white border)
      map.addLayer({
        id: 'airports-circle',
        type: 'circle',
        source: 'airports-source',
        paint: {
          'circle-radius': 5,
          'circle-color': '#1A202C',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      })

      // Airport Text Labels (IATA Code underneath)
      map.addLayer({
        id: 'airports-label',
        type: 'symbol',
        source: 'airports-source',
        layout: {
          'text-field': ['get', 'code'],
          'text-size': 11,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#2D3748',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1.5,
        },
      })

      // Corridor Hover & Click Interactions
      map.on('mousemove', 'corridors-line', (e: maplibregl.MapLayerMouseEvent) => {
        if (e.features && e.features[0]) {
          const routeId = e.features[0].properties?.id
          map.setFilter('corridors-highlight', ['==', ['get', 'id'], routeId])
          map.getCanvas().style.cursor = 'pointer'

          const found = safeRoutes.find((r) => r.id === routeId)
          if (found) {
            setHoveredRouteInfo({
              route: found,
              x: e.point.x,
              y: e.point.y,
            })
          }
        }
      })

      map.on('mouseleave', 'corridors-line', () => {
        if (selectedRoute) {
          map.setFilter('corridors-highlight', ['==', ['get', 'id'], selectedRoute.id])
        } else {
          map.setFilter('corridors-highlight', ['==', ['get', 'id'], ''])
        }
        map.getCanvas().style.cursor = ''
        setHoveredRouteInfo(null)
      })

      map.on('click', 'corridors-line', (e: maplibregl.MapLayerMouseEvent) => {
        if (e.features && e.features[0]) {
          const routeId = e.features[0].properties?.id
          const found = safeRoutes.find((r) => r.id === routeId)
          if (found) {
            onSelectRoute(found)
            onSelectCorridorLine?.(found)
          }
        }
      })

      // Airport Node Click & Hover Interactions
      map.on('click', 'airports-circle', (e: maplibregl.MapLayerMouseEvent) => {
        if (e.features && e.features[0]) {
          const code = e.features[0].properties?.code
          const foundAirport = safeAirports.find((a) => a.code === code)
          if (foundAirport) {
            onSelectAirport?.(foundAirport)
          }
          const connected = safeRoutes.find((r) => r.origin === code || r.destination === code)
          if (connected) onSelectRoute(connected)
        }
      })

      map.on('mouseenter', 'airports-circle', () => {
        map.getCanvas().style.cursor = 'pointer'
      })

      map.on('mouseleave', 'airports-circle', () => {
        map.getCanvas().style.cursor = ''
      })
    })

    map.on('idle', () => {
      markReady()
    })

    return () => {
      isMounted = false
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update Route GeoJSON Lines, APIx Badges & Airplane Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Update GeoJSON Corridors
    if (map.isStyleLoaded() && map.getSource('flight-corridors')) {
      const features = filteredRoutes
        .map((r) => generateCurvedRouteFeature(r, viewMetric))
        .filter((f): f is NonNullable<typeof f> => f !== null)

      const source = map.getSource('flight-corridors') as maplibregl.GeoJSONSource
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: features,
        })
      }
    }

    // Clear previous APIx Badges
    badgeMarkersRef.current.forEach((m) => m.remove())
    badgeMarkersRef.current = []

    // Plot Floating APIx Badges on Midpoints
    filteredRoutes.forEach((route) => {
      const feat = generateCurvedRouteFeature(route, viewMetric)
      if (!feat) return

      const { midLng, midLat, apix, color } = feat.properties

      const badgeEl = document.createElement('div')
      badgeEl.className = `flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm pointer-events-none transition hover:scale-105 ${
        darkMode
          ? 'border-slate-700/80 bg-slate-900/90 text-white'
          : 'border-slate-200 bg-white text-slate-900'
      }`
      badgeEl.innerHTML = `
        <span class="h-1.5 w-1.5 rounded-full" style="background-color: ${color};"></span>
        <span class="font-mono">Idx ${apix.toFixed(1)}</span>
      `

      const badgeMarker = new maplibregl.Marker({ element: badgeEl })
        .setLngLat([midLng, midLat])
        .addTo(map)

      badgeMarkersRef.current.push(badgeMarker)
    })

    // Clear previous Airplane Markers
    planeMarkersRef.current.forEach((m) => m.remove())
    planeMarkersRef.current = []

    // Filter visible flights based on active routes
    const visibleFlights = safeFlights.filter((fl) =>
      filteredRoutes.some((r) => r.origin === fl.origin && r.destination === fl.destination),
    )

    // Render FlightRadar24 Airplane Markers
    visibleFlights.forEach((fl) => {
      const isSelected = selectedFlight?.id === fl.id
      const isCancelled = fl.status === 'cancelled'
      const isEnroute = fl.status === 'enroute'

      const planeEl = document.createElement('div')
      planeEl.className = `group relative flex items-center justify-center rounded-full p-1.5 shadow-md cursor-pointer transition-transform duration-200 ${
        isCancelled
          ? 'bg-red-950 text-red-400 border-2 border-red-500 ring-2 ring-red-500/50 z-20'
          : isSelected
            ? 'bg-teal-500 text-white ring-4 ring-teal-400/50 scale-125 z-30 shadow-lg'
            : isEnroute
              ? darkMode
                ? 'bg-slate-900 text-cyan-400 border border-cyan-400/80 hover:scale-125 z-10 animate-pulse'
                : 'bg-white text-teal-600 border border-teal-500/80 shadow-md hover:scale-125 z-10 animate-pulse'
              : darkMode
                ? 'bg-slate-900 text-teal-400 border border-teal-400/60 hover:scale-125 z-10'
                : 'bg-white text-teal-700 border border-slate-200 shadow-md hover:scale-125 z-10'
      }`
      planeEl.style.transform = `rotate(${fl.heading}deg)`

      if (isCancelled) {
        planeEl.innerHTML = `
          <span class="font-extrabold text-xs leading-none text-red-500">❌</span>
        `
      } else {
        planeEl.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
          </svg>
        `
      }

      // Airplane Hover Tooltip Card
      const tooltipEl = document.createElement('div')
      tooltipEl.className = `pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center rounded-xl border px-3 py-1.5 text-[10px] shadow-xl whitespace-nowrap z-50 backdrop-blur-md transition-all ${
        darkMode
          ? 'border-slate-700/80 bg-slate-900/95 text-white'
          : 'border-slate-200/90 bg-white/95 text-slate-800 shadow-lg'
      }`
      tooltipEl.style.transform = `rotate(-${fl.heading}deg)`

      const flNo = fl.flightNo || fl.flightNumber || fl.id
      if (isCancelled) {
        tooltipEl.innerHTML = `
          <span class="font-extrabold ${darkMode ? 'text-red-400' : 'text-rose-600'}">🔴 ${flNo} • ${fl.origin} → ${fl.destination}</span>
          <span class="font-mono ${darkMode ? 'text-red-300' : 'text-rose-500'} font-bold">Cancelled</span>
        `
      } else {
        tooltipEl.innerHTML = `
          <span class="font-extrabold ${darkMode ? 'text-teal-400' : 'text-teal-700'}">${flNo} • ${fl.origin} → ${fl.destination}</span>
          <span class="font-mono ${darkMode ? 'text-slate-300' : 'text-slate-600'} font-medium">APIx ${fl.apix ? fl.apix.toFixed(1) : '98.4'}</span>
        `
      }
      planeEl.appendChild(tooltipEl)

      // Airplane Click Handler
      planeEl.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectFlight(fl)

        const connectedRoute = safeRoutes.find(
          (r) => r.origin === fl.origin && r.destination === fl.destination,
        )
        if (connectedRoute) onSelectRoute(connectedRoute)

        if (mapRef.current && fl.longitude && fl.latitude) {
          mapRef.current.flyTo({
            center: [fl.longitude, fl.latitude],
            zoom: 6.4,
            speed: 0.9,
            curve: 1.4,
            essential: true,
          })
        }
      })

      if (fl.longitude && fl.latitude) {
        const marker = new maplibregl.Marker({ element: planeEl })
          .setLngLat([fl.longitude, fl.latitude])
          .addTo(map)

        planeMarkersRef.current.push(marker)
      }
    })
  }, [filteredRoutes, viewMetric, safeFlights, selectedFlight, safeRoutes, onSelectFlight, onSelectRoute, darkMode])

  // Synchronize Map Highlight Filter & Dim non-selected routes when flight selected
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || !map.getLayer('corridors-highlight')) return

    const activeRouteId = selectedFlight
      ? safeRoutes.find((r) => r.origin === selectedFlight.origin && r.destination === selectedFlight.destination)?.id
      : selectedRoute?.id

    if (activeRouteId) {
      map.setFilter('corridors-highlight', ['==', ['get', 'id'], activeRouteId])
      if (map.getLayer('corridors-line')) {
        map.setPaintProperty('corridors-line', 'line-opacity', 0.3)
      }
    } else {
      map.setFilter('corridors-highlight', ['==', ['get', 'id'], ''])
      if (map.getLayer('corridors-line')) {
        map.setPaintProperty('corridors-line', 'line-opacity', 0.9)
      }
    }
  }, [selectedRoute, selectedFlight, safeRoutes])

  const handleZoomIn = () => mapRef.current?.zoomIn()
  const handleZoomOut = () => mapRef.current?.zoomOut()
  const handleReset = () => {
    if (mapRef.current) {
      fitIndiaBounds(mapRef.current)
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden isolate bg-slate-100 dark:bg-[#030914]">
      {/* Bottom-Left Legend Overlay */}
      <div className="pointer-events-none absolute left-4 bottom-6 z-10 hidden sm:flex flex-col gap-1.5 rounded-2xl border border-slate-200/90 bg-white/90 p-3 text-slate-800 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 dark:text-white">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
          <span className="text-xs font-bold uppercase tracking-wider">
            India Aviation Corridor Map
          </span>
        </div>
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          MoSPI Baseline ({viewMetric})
        </p>

        {viewMetric === 'Average Fare' ? (
          <div className="mt-1 flex flex-col gap-1 border-t border-slate-100 pt-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#1D4ED8]" /> High Fare (&gt;₹6.5k)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#3B82F6]" /> Medium (₹4.5k–₹6.5k)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#60A5FA]" /> Low Fare (&lt;₹4.5k)
            </span>
          </div>
        ) : viewMetric === 'Volatility' ? (
          <div className="mt-1 flex flex-col gap-1 border-t border-slate-100 pt-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#9333EA]" /> High Volatility (&gt;14%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#F97316]" /> Medium (8–14%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#FACC15]" /> Low (&lt;8%)
            </span>
          </div>
        ) : viewMetric === 'Inflation Score' || viewMetric === 'Demand Pressure' ? (
          <div className="mt-1 flex flex-col gap-1 border-t border-slate-100 pt-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#EA580C]" /> High Pressure (&gt;112)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0D9488]" /> Moderate (104–112)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#06B6D4]" /> Baseline (&lt;104)
            </span>
          </div>
        ) : (
          <div className="mt-1 flex flex-col gap-1 border-t border-slate-100 pt-1.5 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#E53E3E]" /> Red Inflation (&gt;115)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#DD6B20]" /> Orange Rising (108–115)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#D69E2E]" /> Yellow Stable (102–108)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#38A169]" /> Green Lower (&lt;102)
            </span>
          </div>
        )}
      </div>

      {/* Floating Right Zoom & Frame Controls (Matching Leakpoint template right control buttons) */}
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2">
        <div className="pointer-events-auto flex flex-col rounded-2xl border border-slate-200/90 bg-white/95 p-1 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
          <button
            onClick={handleZoomIn}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Zoom In"
          >
            <ZoomIn size={17} />
          </button>
          <div className="h-px w-full bg-slate-200 dark:bg-slate-800" />
          <button
            onClick={handleZoomOut}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut size={17} />
          </button>
        </div>

        {/* Full-view Reset Button */}
        <button
          onClick={handleReset}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200/90 bg-white/95 text-slate-700 shadow-xl backdrop-blur-md transition hover:bg-slate-100 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          title="Fit India View"
        >
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Corridor Hover Tooltip Overlay */}
      {hoveredRouteInfo && (
        <div
          className={`pointer-events-none absolute z-30 min-w-[150px] rounded-xl border p-2.5 text-xs shadow-xl backdrop-blur-md transition-all ${
            darkMode
              ? 'border-slate-700/80 bg-slate-900/95 text-white'
              : 'border-slate-200/90 bg-white/95 text-slate-900 shadow-lg'
          }`}
          style={{
            left: `${hoveredRouteInfo.x + 12}px`,
            top: `${hoveredRouteInfo.y + 12}px`,
          }}
        >
          <div className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {hoveredRouteInfo.route.origin} → {hoveredRouteInfo.route.destination}
          </div>
          <div className="mt-1 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>APIx:</span>
              <span className={`font-mono font-bold ${darkMode ? 'text-teal-400' : 'text-teal-700'}`}>
                {hoveredRouteInfo.route.apix.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Volatility:</span>
              <span className={`font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {hoveredRouteInfo.route.volatility}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Weight:</span>
              <span className={`font-mono ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {(hoveredRouteInfo.route.contribValue * 10).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Map Initializing Loading Overlay with Animated Plane */}
      {mapStatus === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-50">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-teal-400 shadow-lg">
            <RotateCcw className="animate-spin" size={18} />
          </div>
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-700">
            Loading aviation map...
          </p>
        </div>
      )}

      {/* Error state */}
      {mapStatus === 'error' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-red-50 p-4 text-red-800">
          <AlertCircle size={24} className="mb-2 text-red-600" />
          <p className="text-xs font-bold">Failed to load MapLibre tiles.</p>
        </div>
      )}

      {/* MapLibre Container */}
      <div
        ref={mapContainerRef}
        className="map-container absolute inset-0 h-full w-full"
      />
    </div>
  )
}
