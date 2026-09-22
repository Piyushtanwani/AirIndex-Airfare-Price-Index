export interface Airport {
  code: string
  name: string
  city: string
  coordinates: [number, number] // [longitude, latitude]
  inflationScore: number // e.g. 122.5
  contributionScore: number // relative weight/contribution (0-100)
  status: 'critical' | 'rising' | 'stable' | 'falling'
}

export type LeadTimeFilter = '1 Day' | '7 Day' | '15 Day' | '30 Day' | '45 Day'
export type AirlineFilter = 'All' | 'IndiGo' | 'Air India' | 'Akasa' | 'SpiceJet'
export type MetricViewFilter =
  | 'APIx'
  | 'Average Fare'
  | 'Volatility'
  | 'Inflation Score'
  | 'Demand Pressure'

export interface RouteData {
  id: string
  origin: string // Airport code e.g. "DEL"
  destination: string // Airport code e.g. "BOM"
  apix: number
  change: number // percentage e.g. +5.4
  cheapestFare: number // e.g. 4280
  highestFare: number // e.g. 11920
  volatility: number // percentage e.g. 18.4
  observations: number
  trustScore: number
  lastUpdated: string
  status: 'Hot' | 'Rising' | 'Stable' | 'Falling'
  contribValue: number // contribution to index e.g. +0.42
}

export interface NationalStats {
  apix: number
  change: number
  observationCount: number
  trustScore: number
}

export interface TrendPoint {
  date: string
  apix: number
  baseline: number
  delBom: number
  delCcu: number
}

export interface ContributorItem {
  rank: number
  route: string
  contribution: number
  change: number
  sharePercent: number
}

export type { FlightStatus, FlightData } from './flight'

