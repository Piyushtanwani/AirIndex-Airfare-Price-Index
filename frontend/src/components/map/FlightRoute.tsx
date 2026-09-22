import { greatCircle } from '@turf/turf'
import type { RouteData, MetricViewFilter } from '../../types/map'
import { AIRPORT_MAP } from '../../data/airports'

export const getRouteColor = (
  metric: MetricViewFilter,
  apix: number,
  fare: number,
  volatility: number,
): string => {
  if (metric === 'Average Fare') {
    if (fare > 6500) return '#1D4ED8' // Deep Blue
    if (fare >= 4500) return '#3B82F6' // Medium Blue
    return '#60A5FA' // Light Blue
  }
  if (metric === 'Volatility') {
    if (volatility > 14.0) return '#9333EA' // Purple
    if (volatility >= 8.0) return '#F97316' // Orange
    return '#FACC15' // Yellow
  }
  if (metric === 'Inflation Score' || metric === 'Demand Pressure') {
    if (apix > 112.0) return '#EA580C' // Deep Orange
    if (apix >= 104.0) return '#0D9488' // Teal
    return '#06B6D4' // Cyan
  }
  // Default APIx color mapping
  if (apix > 115.0) return '#E53E3E' // Red -> High Inflation
  if (apix >= 108.0) return '#DD6B20' // Orange -> Moderate
  if (apix >= 102.0) return '#D69E2E' // Yellow -> Stable
  return '#38A169' // Green -> Low Fares
}

export interface CurvedRouteGeoJSON {
  type: 'Feature'
  properties: {
    id: string
    origin: string
    destination: string
    apix: number
    change: number
    status: string
    color: string
    weight: number
    midLng: number
    midLat: number
  }
  geometry: {
    type: 'LineString'
    coordinates: [number, number][]
  }
}

export const generateCurvedRouteFeature = (
  route: RouteData,
  metric: MetricViewFilter = 'APIx',
): CurvedRouteGeoJSON | null => {
  const orig = AIRPORT_MAP.get(route.origin)
  const dest = AIRPORT_MAP.get(route.destination)

  if (!orig || !dest) return null

  try {
    const gc = greatCircle(
      { type: 'Point', coordinates: orig.coordinates },
      { type: 'Point', coordinates: dest.coordinates },
      { npoints: 60 },
    )

    const coords = gc.geometry.coordinates as [number, number][]
    const midPoint = coords[Math.floor(coords.length / 2)] || orig.coordinates

    return {
      type: 'Feature',
      properties: {
        id: route.id,
        origin: route.origin,
        destination: route.destination,
        apix: route.apix,
        change: route.change,
        status: route.status,
        color: getRouteColor(metric, route.apix, route.cheapestFare, route.volatility),
        weight: 2, // 2px stroke
        midLng: midPoint[0],
        midLat: midPoint[1],
      },
      geometry: gc.geometry as { type: 'LineString'; coordinates: [number, number][] },
    }
  } catch (err) {
    console.warn('Failed to calculate curved arc for route', route.id, err)
    return null
  }
}

export const FlightRoute = () => {
  return null
}
