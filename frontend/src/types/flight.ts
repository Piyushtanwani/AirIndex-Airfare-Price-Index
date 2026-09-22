export type FlightStatus =
  | 'scheduled'
  | 'delayed'
  | 'enroute'
  | 'landed'
  | 'cancelled'
  | 'unknown'

export interface FlightData {
  id: string
  airline: 'IndiGo' | 'Air India' | 'Akasa' | 'SpiceJet' | string
  flightNo: string
  flightNumber?: string
  aircraft: string
  origin: string
  originCity: string
  destination: string
  destCity: string
  departureTime: string
  arrivalTime: string
  status: FlightStatus
  delayMinutes?: number
  cancelReason?: string
  progress: number
  speed: string
  altitude: string
  heading: number
  latitude?: number
  longitude?: number
  distanceKm: number
  apix: number
  cheapestFare: number
  highestFare: number
  averageFare: number
  volatility: number
  trust: number
  leadTime?: string
}
