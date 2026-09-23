import { API_BASE_URL } from '../lib/api'

export type FlightOperationalStatus =
  | 'scheduled'
  | 'boarding'
  | 'enroute'
  | 'delayed'
  | 'landed'
  | 'cancelled'
  | 'unknown'

export interface LiveFlightStatusData {
  flightNo: string
  airline: string
  aircraft: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  status: FlightOperationalStatus
  gate?: string
  terminal?: string
  delayMinutes?: number
  updatedAt: string
}

// Simulated real-time operational status directory for flights
const MOCK_OPERATIONAL_DATABASE: Record<string, Partial<LiveFlightStatusData>> = {
  '6E218': {
    flightNo: '6E218',
    airline: 'IndiGo',
    aircraft: 'Airbus A320neo',
    origin: 'DEL',
    destination: 'BOM',
    departureTime: '14:40',
    arrivalTime: '16:35',
    status: 'scheduled',
    terminal: 'T2',
    gate: '14B',
    updatedAt: '1h 39m ago',
  },
  'SG8194': {
    flightNo: 'SG8194',
    airline: 'SpiceJet',
    aircraft: 'Boeing 737-800',
    origin: 'AMD',
    destination: 'DEL',
    departureTime: '08:00',
    arrivalTime: '09:30',
    status: 'cancelled',
    terminal: 'T1',
    gate: '04A',
    updatedAt: '25m ago',
  },
  'AI864': {
    flightNo: 'AI864',
    airline: 'Air India',
    aircraft: 'Airbus A321neo',
    origin: 'DEL',
    destination: 'CCU',
    departureTime: '10:15',
    arrivalTime: '12:30',
    status: 'delayed',
    delayMinutes: 45,
    terminal: 'T3',
    gate: '22',
    updatedAt: '12m ago',
  },
  'AI402': {
    flightNo: 'AI402',
    airline: 'Air India',
    aircraft: 'Airbus A320neo',
    origin: 'AMD',
    destination: 'DEL',
    departureTime: '08:45',
    arrivalTime: '10:20',
    status: 'enroute',
    terminal: 'T3',
    gate: '18',
    updatedAt: '4m ago',
  },
  '6E5321': {
    flightNo: '6E5321',
    airline: 'IndiGo',
    aircraft: 'Airbus A321neo',
    origin: 'AMD',
    destination: 'DEL',
    departureTime: '09:10',
    arrivalTime: '10:40',
    status: 'boarding',
    terminal: 'T1',
    gate: '07C',
    updatedAt: '2m ago',
  },
  'QP1301': {
    flightNo: 'QP1301',
    airline: 'Akasa',
    aircraft: 'Boeing 737 MAX 8',
    origin: 'BOM',
    destination: 'BLR',
    departureTime: '14:00',
    arrivalTime: '15:40',
    status: 'scheduled',
    terminal: 'T1',
    gate: '09',
    updatedAt: '45m ago',
  },
  'UK955': {
    flightNo: 'UK955',
    airline: 'Air India',
    aircraft: 'Airbus A320neo',
    origin: 'AMD',
    destination: 'DEL',
    departureTime: '11:25',
    arrivalTime: '13:00',
    status: 'scheduled',
    terminal: 'T3',
    gate: '31',
    updatedAt: '50m ago',
  },
}

export async function getTodayFlightStatus(
  flightNo: string,
  date: string,
): Promise<LiveFlightStatusData> {
  const cleanNo = flightNo.replace(/[\s-]/g, '').toUpperCase()

  // Simulate network fetch delay
  await new Promise((resolve) => setTimeout(resolve, 400))

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const isLocalApi = API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1')
  const canFetch = Boolean(API_BASE_URL) && !(isHttps && isLocalApi)

  if (canFetch) {
    try {
      const res = await fetch(
        `${API_BASE_URL}/v1/flight-status?flight=${encodeURIComponent(cleanNo)}&date=${encodeURIComponent(date)}`,
      )
      if (res.ok) {
        const data = await res.json()
        return data as LiveFlightStatusData
      }
    } catch {
      // Backend offline fallback
    }
  }

  const match = MOCK_OPERATIONAL_DATABASE[cleanNo]
  if (match) {
    return {
      flightNo: cleanNo,
      airline: match.airline || 'IndiGo',
      aircraft: match.aircraft || 'Airbus A320neo',
      origin: match.origin || 'DEL',
      destination: match.destination || 'BOM',
      departureTime: match.departureTime || '14:40',
      arrivalTime: match.arrivalTime || '16:35',
      status: match.status || 'scheduled',
      terminal: match.terminal || 'T2',
      gate: match.gate || '12',
      delayMinutes: match.delayMinutes,
      updatedAt: match.updatedAt || 'Just now',
    }
  }

  // If flight not specifically mapped in database
  return {
    flightNo: cleanNo,
    airline: 'IndiGo',
    aircraft: 'Airbus A320neo',
    origin: 'DEL',
    destination: 'BOM',
    departureTime: '12:00',
    arrivalTime: '14:15',
    status: 'scheduled',
    terminal: 'T2',
    gate: '10',
    updatedAt: 'Just now',
  }
}
