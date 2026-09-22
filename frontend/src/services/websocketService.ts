import type { FlightData } from '../types/flight'
import { WS_BASE_URL } from '../lib/api'

export function subscribeToLiveFlights(
  onUpdate: (updatedFlights: Partial<FlightData>[]) => void,
): () => void {
  let ws: WebSocket | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  // Don't attempt to connect to ws://localhost if deployed on HTTPS (blocked by PNA / mixed content)
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isLocalWs = WS_BASE_URL.includes('localhost') || WS_BASE_URL.includes('127.0.0.1');

  if (!WS_BASE_URL || (isHttps && isLocalWs)) {
    startFallbackTimer();
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }

  try {
    const wsUrl = `${WS_BASE_URL}/ws/flights`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'aircraft_update' && Array.isArray(data.flights)) {
          onUpdate(data.flights);
        }
      } catch {
        // Parse error ignored
      }
    };

    ws.onerror = () => {
      // Fallback timer when WebSocket is unavailable
      startFallbackTimer();
    };
  } catch {
    startFallbackTimer();
  }

  function startFallbackTimer() {
    if (intervalId) return;
    let step = 0;
    intervalId = setInterval(() => {
      step += 1;
      const delta = (step % 10) * 0.05;
      onUpdate([
        {
          id: 'fl-1',
          flightNo: '6E218',
          latitude: 23.4 - delta * 0.4,
          longitude: 75.8 - delta * 0.3,
          progress: Math.min(95, 63 + (step % 30)),
        },
        {
          id: 'fl-2',
          flightNo: 'AI864',
          latitude: 25.1 + delta * 0.1,
          longitude: 83.2 + delta * 0.5,
          progress: Math.min(95, 20 + (step % 40)),
        },
      ]);
    }, 5000);
  }

  return () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}
