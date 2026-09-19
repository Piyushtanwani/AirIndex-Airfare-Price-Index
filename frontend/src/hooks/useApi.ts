import { useMutation, useQuery } from '@tanstack/react-query'
import { api, type BacktestKind, type QuantityMode, type Scope } from '../lib/api'

export function useMethodology() {
  return useQuery({ queryKey: ['methodology'], queryFn: api.methodology, staleTime: 5 * 60_000 })
}

export function useRoutes() {
  return useQuery({ queryKey: ['routes'], queryFn: api.routes, staleTime: 60_000 })
}

export function useIndex(params: { scope?: Scope; route?: string; window?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['index', params],
    queryFn: () => api.index(params),
    staleTime: 60_000,
  })
}

export function useIndexLatest(params: { scope?: Scope; route?: string; window?: string }) {
  return useQuery({
    queryKey: ['index-latest', params],
    queryFn: () => api.indexLatest(params),
    staleTime: 60_000,
  })
}

export function useHeatmap(route: string, days = 30) {
  return useQuery({
    queryKey: ['heatmap', route, days],
    queryFn: () => api.heatmap({ route, days }),
    enabled: Boolean(route),
    staleTime: 60_000,
  })
}

export function useQualitySummary() {
  return useQuery({ queryKey: ['quality-summary'], queryFn: api.qualitySummary, staleTime: 60_000 })
}

export function useFormulas(params: { date?: string; lag_days?: number; quantity_mode?: QuantityMode }) {
  return useQuery({ queryKey: ['formulas', params], queryFn: () => api.formulas(params), staleTime: 60_000 })
}

export function useTrust() {
  return useQuery({ queryKey: ['trust'], queryFn: api.trust, staleTime: 60_000 })
}

export function useForecast(params: { horizon?: number; confidence?: number; history_days?: number }) {
  return useQuery({
    queryKey: ['forecast', params],
    queryFn: () => api.forecast(params),
    staleTime: 60_000,
    retry: (failureCount, error) => {
      if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) return false
      return failureCount < 1
    },
  })
}

export function useScenario() {
  return useMutation({ mutationFn: api.scenario })
}

export function useAsk() {
  return useMutation({ mutationFn: api.ask })
}

export function useAskSuggestions() {
  return useQuery({ queryKey: ['ask-suggestions'], queryFn: api.askSuggestions, staleTime: 5 * 60_000 })
}

export function useContributions(params: { date?: string; lag_days?: number }) {
  return useQuery({ queryKey: ['contributions', params], queryFn: () => api.contributions(params), staleTime: 60_000 })
}

export function useBacktest(params: { kind?: BacktestKind; days?: number }) {
  return useQuery({ queryKey: ['backtest', params], queryFn: () => api.backtest(params), staleTime: 60_000 })
}

export function useAnomalies(params: { threshold?: number; days?: number }) {
  return useQuery({ queryKey: ['anomalies', params], queryFn: () => api.anomalies(params), staleTime: 60_000 })
}
