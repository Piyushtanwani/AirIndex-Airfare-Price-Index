import React, { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
import { AIRPORTS } from '../../data/airports'
import { generateCurvedRouteFeature } from './FlightRoute'
import { createCreativeAirportMarker } from './AirportMarker'
import type { SourcedAirport } from '../../data/airports'
import type { RouteData, MetricViewFilter } from '../../types/map'
import { RotateCcw, ZoomIn, ZoomOut, AlertCircle, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import type { RegionFilter } from './MapToolbar'

import type { FlightData } from '../../types/flight'

// Focused Indian Domestic Aviation Corridors Bounding Box: [Southwest [minLng, minLat], Northeast [maxLng, maxLat]]
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [71.5, 7.8], // Southwest (Arabian Sea / Kerala / Gujarat coastal boundary)
  [93.0, 32.2], // Northeast (Jammu & Punjab down to Assam & Northeast corridor)
]

const getResponsivePadding = (width: number) => {
  if (width >= 1200) {
    return { top: 85, left: 50, bottom: 50, right: 50 }
  } else if (width >= 900) {
    return { top: 80, left: 40, bottom: 40, right: 40 }
  } else if (width >= 600) {
    return { top: 75, left: 30, bottom: 40, right: 30 }
  } else {
    return { top: 85, left: 16, bottom: 80, right: 16 }
  }
}

// Reliable OpenStreetMap Basemap
const OPENSTREETMAP_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
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
      id: 'osm-tiles-layer',
      type: 'raster',
      source: 'osm-tiles',
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
  selectedAirport?: SourcedAirport | null
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
  darkMode: _darkMode = false,
  selectedAirport = null,
  onSelectAirport,
  onSelectCorridorLine,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const badgeMarkersRef = useRef<maplibregl.Marker[]>([])
  const planeMarkersRef = useRef<maplibregl.Marker[]>([])
  const airportMarkersRef = useRef<maplibregl.Marker[]>([])
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('ready')
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false)

  // Floating hover tooltip state
  const [hoveredRouteInfo, setHoveredRouteInfo] = useState<{
    route: RouteData
    x: number
    y: number
  } | null>(null)

  const fitIndiaBounds = (targetMap: maplibregl.Map, width?: number) => {
    try {
      const container = mapContainerRef.current
      const w = width || container?.clientWidth || window.innerWidth
      const h = container?.clientHeight || window.innerHeight
      const padding = getResponsivePadding(w)
      if (h > padding.top + padding.bottom + 20 && w > padding.left + padding.right + 20) {
        targetMap.fitBounds(INDIA_BOUNDS, {
          padding,
          duration: 0,
          maxZoom: 6,
        })
      }
    } catch {
      // Ignore fitBounds error when container layout is not fully measured yet
    }
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
    const initialStyle = OPENSTREETMAP_RASTER_STYLE

    const mapOptions: maplibregl.MapOptions = {
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
    }

    const map = new maplibregl.Map(mapOptions)
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
      console.log('[IndiaMap] map.on("load") triggered');
      markReady()
      fitIndiaBounds(map)

      // 1. Corridors Source & Layers
      const corridorFeatures = safeRoutes
        .map((r) => generateCurvedRouteFeature(r, viewMetric))
        .filter((f): f is NonNullable<typeof f> => f !== null)
      console.log('[IndiaMap] corridorFeatures count on load:', corridorFeatures.length, corridorFeatures[0]);

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
    })

    map.on('idle', () => {
      markReady()
    })

    return () => {
      isMounted = false
      resizeObserver.disconnect()
      badgeMarkersRef.current.forEach((m) => m.remove())
      planeMarkersRef.current.forEach((m) => m.remove())
      airportMarkersRef.current.forEach((m) => m.remove())
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update Route GeoJSON Lines, APIx Badges & Airplane Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Update GeoJSON Corridors
    const source = map.getSource('flight-corridors') as maplibregl.GeoJSONSource | undefined
    if (source) {
      const features = filteredRoutes
        .map((r) => generateCurvedRouteFeature(r, viewMetric))
        .filter((f): f is NonNullable<typeof f> => f !== null)

      source.setData({
        type: 'FeatureCollection',
        features: features,
      })
    }

    // Clear previous APIx Badges
    badgeMarkersRef.current.forEach((m) => m.remove())
    badgeMarkersRef.current = []

    // Plot Floating APIx Badges on Midpoints
    // Plot Floating APIx Badges on Midpoints (Always Light Mode)
    filteredRoutes.forEach((route) => {
      const feat = generateCurvedRouteFeature(route, viewMetric)
      if (!feat) return

      const { midLng, midLat, apix, color } = feat.properties

      const badgeEl = document.createElement('div')
      badgeEl.className =
        'flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-900 shadow-sm pointer-events-none transition hover:scale-105'
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

    // Render FlightRadar24 Airplane Markers (Always Light Mode)
    visibleFlights.forEach((fl) => {
      const isSelected = selectedFlight?.id === fl.id
      const isCancelled = fl.status === 'cancelled'
      const isEnroute = fl.status === 'enroute'

      const planeEl = document.createElement('div')
      planeEl.className = `group relative flex items-center justify-center rounded-full p-1.5 shadow-md cursor-pointer transition-transform duration-200 ${
        isCancelled
          ? isSelected
            ? 'bg-rose-600 text-white ring-4 ring-rose-300/60 scale-125 z-30 shadow-lg'
            : 'bg-white text-rose-600 border border-rose-200 shadow-md ring-2 ring-rose-500/20 hover:scale-125 z-20'
          : isSelected
            ? 'bg-teal-500 text-white ring-4 ring-teal-400/50 scale-125 z-30 shadow-lg'
            : isEnroute
              ? 'bg-white text-teal-600 border border-teal-500/80 shadow-md hover:scale-125 z-10 animate-pulse'
              : 'bg-white text-teal-700 border border-slate-200 shadow-md hover:scale-125 z-10'
      }`
      if (!isCancelled) {
        planeEl.style.transform = `rotate(${fl.heading}deg)`
      }

      if (isCancelled) {
        planeEl.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        `
      } else {
        planeEl.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
          </svg>
        `
      }

      // Airplane Hover Tooltip Card (Always Light Mode)
      const tooltipEl = document.createElement('div')
      tooltipEl.className =
        'pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center rounded-xl border border-slate-200/90 bg-white/95 text-slate-800 px-3 py-1.5 text-[10px] shadow-lg whitespace-nowrap z-50 backdrop-blur-md transition-all'
      if (!isCancelled) {
        tooltipEl.style.transform = `rotate(-${fl.heading}deg)`
      }

      const flNo = fl.flightNo || fl.flightNumber || fl.id
      if (isCancelled) {
        tooltipEl.innerHTML = `
          <span class="font-bold text-rose-600">${flNo} &middot; ${fl.origin} &rarr; ${fl.destination}</span>
          <span class="font-mono text-[10px] text-rose-500 font-semibold">Cancelled</span>
        `
      } else {
        tooltipEl.innerHTML = `
          <span class="font-extrabold text-teal-700">${flNo} • ${fl.origin} → ${fl.destination}</span>
          <span class="font-mono text-slate-600 font-medium">APIx ${fl.apix ? fl.apix.toFixed(1) : '98.4'}</span>
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

    // Clear previous Airport Markers
    airportMarkersRef.current.forEach((m) => m.remove())
    airportMarkersRef.current = []

    // Plot Creative Airport Location Pins (Always Light Mode)
    safeAirports.forEach((apt) => {
      const isSelected = selectedAirport?.code === apt.code
      const markerEl = createCreativeAirportMarker(
        apt,
        isSelected,
        false, // Always false: keep map icons in light mode
        (clickedAirport) => {
          onSelectAirport?.(clickedAirport)
          const connected = safeRoutes.find(
            (r) => r.origin === clickedAirport.code || r.destination === clickedAirport.code,
          )
          if (connected) onSelectRoute(connected)
        },
      )

      const marker = new maplibregl.Marker({
        element: markerEl,
        anchor: 'bottom',
      })
        .setLngLat(apt.coordinates)
        .addTo(map)

      airportMarkersRef.current.push(marker)
    })
  }, [
    filteredRoutes,
    viewMetric,
    safeFlights,
    selectedFlight,
    safeRoutes,
    safeAirports,
    selectedAirport,
    onSelectFlight,
    onSelectRoute,
    onSelectAirport,
  ])

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
    <div className="relative h-full w-full overflow-hidden isolate bg-surface">
      {/* 1. MapLibre Canvas Container (Base Layer z-0) */}
      <div
        ref={mapContainerRef}
        className="map-container absolute inset-0 h-full w-full z-0"
      />

      {/* 2. Bottom-Left Legend Overlay (Elevated with z-30, solid white bg) */}
      <div className="pointer-events-auto absolute left-4 bottom-6 z-30 hidden sm:flex flex-col rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-white transition-all">
        {isLegendCollapsed ? (
          <button
            onClick={() => setIsLegendCollapsed(false)}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Expand Map Legend"
          >
            <Layers size={14} className="text-teal-600 dark:text-teal-400" />
            <span>Map Legend</span>
            <ChevronUp size={14} className="text-slate-400" />
          </button>
        ) : (
          <div className="p-3 sm:p-3.5 w-[230px]">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Layers size={14} className="text-teal-600 dark:text-teal-400" />
                <div>
                  <div className="text-xs font-bold tracking-tight text-slate-900 dark:text-white">
                    Corridor Index
                  </div>
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    MoSPI Baseline ({viewMetric})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsLegendCollapsed(true)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Collapse Legend"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {viewMetric === 'Average Fare' ? (
              <div className="mt-2.5 flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">High Fare</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">&gt; ₹6,500</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rise" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Moderate</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">₹4.5k–₹6.5k</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-fall" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Low Fare</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">&lt; ₹4,500</span>
                </div>
              </div>
            ) : viewMetric === 'Volatility' ? (
              <div className="mt-2.5 flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">High Volatility</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">&gt; 14%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rise" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Medium</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">8%–14%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-fall" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Stable</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">&lt; 8%</span>
                </div>
              </div>
            ) : (
              <div className="mt-2.5 flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Severe Pressure</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">&gt; 115</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rise" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Elevated</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">108–115</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Baseline</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">102–108</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-fall" />
                    <span className="font-medium text-slate-800 dark:text-slate-200">Discounted</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">&lt; 102</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Floating Right Zoom & Frame Controls (Solid White BG) */}
      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        <div className="pointer-events-auto flex flex-col rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={handleZoomIn}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <div className="h-px w-full bg-slate-200 dark:bg-slate-800" />
          <button
            onClick={handleZoomOut}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
        </div>

        {/* Full-view Reset Button */}
        <button
          onClick={handleReset}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xl transition hover:bg-slate-100 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          title="Fit India View"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {/* 4. Corridor Hover Tooltip Overlay (Solid White BG) */}
      {hoveredRouteInfo && (
        <div
          className="pointer-events-none absolute z-35 min-w-[150px] rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-white transition-all"
          style={{
            left: `${hoveredRouteInfo.x + 12}px`,
            top: `${hoveredRouteInfo.y + 12}px`,
          }}
        >
          <div className="font-bold text-slate-900 dark:text-white">
            {hoveredRouteInfo.route.origin} &rarr; {hoveredRouteInfo.route.destination}
          </div>
          <div className="mt-1 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">APIx:</span>
              <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                {hoveredRouteInfo.route.apix.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Volatility:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {hoveredRouteInfo.route.volatility}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Weight:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(hoveredRouteInfo.route.contribValue * 10).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Map Initializing Loading Overlay */}
      {mapStatus === 'loading' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-border text-accent shadow-lg">
            <RotateCcw className="animate-spin" size={18} />
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Loading aviation map...
          </p>
        </div>
      )}

      {/* Error state */}
      {mapStatus === 'error' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-warn/10 p-4 text-warn">
          <AlertCircle size={24} className="mb-2 text-warn" />
          <p className="text-xs font-semibold">Failed to load MapLibre tiles.</p>
        </div>
      )}
    </div>
  )
}
