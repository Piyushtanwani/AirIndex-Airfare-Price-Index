// Typed API client for the AirIndex backend.
// Every interface mirrors a response shape documented in docs/api-contract.md.

export const API_BASE_URL: string = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    return isLocal ? 'http://localhost:8000' : 'https://air-index-backend.vercel.app'
  }
  return import.meta.env.DEV ? 'http://localhost:8000' : 'https://air-index-backend.vercel.app'
})()

export const WS_BASE_URL: string = (() => {
  const envWs = import.meta.env.VITE_WS_BASE_URL as string | undefined
  if (envWs && envWs.trim()) return envWs.trim().replace(/\/+$/, '')
  if (API_BASE_URL) {
    if (API_BASE_URL.startsWith('https://')) return API_BASE_URL.replace(/^https:\/\//, 'wss://')
    if (API_BASE_URL.startsWith('http://')) return API_BASE_URL.replace(/^http:\/\//, 'ws://')
  }
  if (typeof window !== 'undefined') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    return isLocal ? 'ws://localhost:8000' : ''
  }
  return import.meta.env.DEV ? 'ws://localhost:8000' : ''
})()

const API_KEY: string | undefined = import.meta.env.VITE_API_KEY as string | undefined

export class ApiError extends Error {
  status: number
  detail?: string

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

// ------------------------------------------------------------------------
// Shared shapes
// ------------------------------------------------------------------------

export type Scope = 'national' | 'route' | 'airline'
export type Window = 'T+1' | 'T+7' | 'T+15' | 'T+30' | 'T+45' | 'all'

export interface HealthResponse {
  status: string
  version: string
  methodology_version: string
  database: string
}

export interface MethodologyResponse {
  methodology_version: string
  index_type: string
  formula: string
  price_basis: string
  base_period: { start: string | null; end: string | null; value: number }
  lead_times: number[]
  lead_time_weights: Record<string, number>
  min_obs_per_cell: number
  mad_threshold: number
  coverage_threshold: number
  price_basis_explanation: string
  price_statistic: string
  price_statistic_explanation: string
  formula_explanation: string
  base_period_days: number
  publication_cadence: string
  weights_source: string
  weights_asof: string | null
  weights_are_official: boolean
  weights_proxy_note: string | null
  revisions_policy: string
  routes_in_basket: number
  cells_in_basket: number
  /** What the method cannot support. Rendered in full on the methodology page. */
  known_limitations: string[]
  data_sources: string[]
}

export interface RouteItem {
  id: number
  code: string
  origin: string
  destination: string
  origin_city: string
  dest_city: string
  active: boolean
  weight: number
  weight_source: string
  weight_asof: string | null
  latest_apix: number | null
  wow_pct: number | null
  mom_pct: number | null
  obs_30d: number
  coverage: number | null
}

export interface RoutesResponse {
  as_of: string
  methodology_version: string
  count: number
  items: RouteItem[]
}

export interface IndexPoint {
  date: string
  apix: number
  wow_pct: number
  mom_pct: number
  coverage: number
  obs_count: number
  imputed_cells: number
  published_at: string
  provisional: boolean
}

export interface IndexResponse {
  scope: Scope
  scope_id: string | null
  window: string
  methodology_version: string
  as_of: string
  count: number
  items: IndexPoint[]
}

export interface TopMover {
  code: string
  apix: number
  wow_pct: number
}

export interface IndexLatestResponse {
  as_of: string | null
  methodology_version: string
  item: IndexPoint | null
  top_movers: TopMover[]
}

export interface HeatmapCell {
  date: string
  lead_time_days: number
  apix: number
  min_logical_fare: number
  obs_count: number
  imputed: boolean
}

export interface HeatmapResponse {
  route: string
  as_of: string
  lead_times: number[]
  dates: string[]
  cells: HeatmapCell[]
}

export interface FareItem {
  id: number
  route: string
  departure_date: string
  captured_at: string
  lead_time_days: number
  airline_code: string
  airline_name: string
  base_fare: number
  taxes: number
  udf: number
  convenience_fee: number
  total_fare: number
  currency: string
  is_valid: boolean
  quality_flags: string[]
  source: string
}

export interface FaresResponse {
  page: number
  page_size: number
  total: number
  items: FareItem[]
}

export interface QualityFlag {
  flag: string
  count: number
}

export interface QualitySource {
  code: string
  name: string
  kind: string
  enabled: boolean
  robots_ok: boolean
  last_run_at: string
  last_status: string
  requests: number
  failures: number
}

export interface QualityDaily {
  date: string
  obs_count: number
  valid: number
  invalid: number
  outliers: number
  imputed: number
  coverage: number
}

export interface QualitySummaryResponse {
  as_of: string | null
  window_days: number
  totals: {
    raw_observations: number
    valid_fares: number
    invalid_fares: number
    validation_pass_rate: number
    duplicates_rejected: number
    outliers_excluded: number
    imputed_cells: number
    coverage_latest: number | null
  }
  flags: QualityFlag[]
  sources: QualitySource[]
  daily: QualityDaily[]
}

export interface ApiErrorBody {
  detail: string
}

// ------------------------------------------------------------------------
// Analytics shapes (docs/api-contract-analytics.md)
// ------------------------------------------------------------------------

export type QuantityMode = 'elasticity_model' | 'fixed' | 'observed_availability'

export interface FormulaResult {
  name: string
  value: number
  description: string
  caveat: string | null
}

export interface FormulasResponse {
  date: string
  comparison_date: string
  methodology_version: string
  quantity_mode: QuantityMode
  elasticity: number | null
  headline: string
  spread: number
  results: FormulaResult[]
  notes: string[]
}

export interface TrustComponent {
  name: string
  score: number | null
  detail: string
  measured: boolean
}

export interface TrustResponse {
  overall: number | null
  band: string
  as_of: string | null
  components: TrustComponent[]
  warnings: string[]
}

export interface ForecastHistoryPoint {
  date: string
  value: number
}

export interface ForecastPoint {
  date: string
  value: number
  lower: number
  upper: number
}

export interface ForecastScore {
  model: string
  mae: number
  rmse: number
  mape: number
  ensemble_weight: number
}

export interface ForecastResponse {
  as_of: string
  methodology_version: string
  horizon_days: number
  confidence: number
  holdout_days: number
  history: ForecastHistoryPoint[]
  points: ForecastPoint[]
  scores: ForecastScore[]
  per_model: Record<string, number[]>
  notes: string[]
}

export interface ScenarioRequest {
  airfare_shock_pct: number
  atf_shock_pct: number
  demand_shock_pct: number
  capacity_shock_pct: number
  horizon_days: number
  include_sensitivity?: boolean
}

export interface ScenarioChannel {
  channel: string
  input_pct: number
  effect_pct: number
  mechanism: string
}

export interface ScenarioPathPoint {
  date: string
  baseline: number
  scenario: number
  delta_pct: number
}

export interface ScenarioSensitivity {
  assumption: string
  baseline_value: number
  low_value: number
  high_value: number
  effect_low_pct: number
  effect_high_pct: number
  swing_pct_points: number
  share_of_result: number
}

export interface ScenarioAssumptions {
  atf_cost_share: number
  atf_pass_through: number
  atf_pass_through_lag_days: number
  demand_to_fare: number
  capacity_to_fare: number
  cpi_airfare_weight_pct: number
  cpi_weight_is_official: boolean
  source_file: string
  all_values_are_stated_priors: boolean
}

export interface ScenarioResponse {
  baseline_index: number
  baseline_date: string
  inputs: Record<string, number>
  assumptions: ScenarioAssumptions
  channels: ScenarioChannel[]
  total_fare_effect_pct: number
  cpi_effect_pp: number | null
  cpi_effect_is_official: boolean
  path: ScenarioPathPoint[]
  sensitivity: ScenarioSensitivity[]
  notes: string[]
  warnings: string[]
}

export interface AskRequest {
  question: string
  use_model?: boolean
}

export interface AskResponse {
  question: string
  answer: string
  mode: 'deterministic' | 'model'
  grounded: boolean
  evidence: Record<string, unknown>
  notes: string[]
  suggested_questions: string[]
}

export interface AskSuggestionsResponse {
  suggestions: string[]
  note: string
}

export interface ContributionRow {
  cell: string
  weight: number
  price_now: number
  price_prev: number
  pct_change: number
  contribution_pct: number
}

export interface ContributionsResponse {
  date: string
  previous_date: string
  apix_change_pct: number
  rows: ContributionRow[]
}

export type BacktestKind = 'stability' | 'leave_one_out'

export interface BacktestStabilityRow {
  date: string
  first_published: number
  final: number
  revision: number
  revision_pct: number
  coverage: number
  published: boolean
}

export interface BacktestLeaveOneOutRow {
  route_excluded: string
  apix_without: number
  delta: number
}

export interface BacktestResponse {
  kind: string
  days: number
  metrics: Record<string, number | string>
  series: BacktestStabilityRow[] | BacktestLeaveOneOutRow[]
  notes: string[]
}

export type AnomalyDirection = 'rise' | 'fall'
export type AnomalySeverity = 'moderate' | 'high'

export interface AnomalyItem {
  date: string
  value: number
  previous: number
  change_pct: number
  z_score: number
  direction: AnomalyDirection
  severity: AnomalySeverity
}

export interface AnomaliesResponse {
  as_of: string
  threshold: number
  count: number
  items: AnomalyItem[]
  note: string
}

// ------------------------------------------------------------------------
// Fetch helper
// ------------------------------------------------------------------------

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const cleanPath = path.replace(/^\//, '')
  const base = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000')
  const url = new URL(cleanPath, base.endsWith('/') ? base : `${base}/`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

export interface RawResult<T> {
  data: T
  status: number
  elapsedMs: number
  url: string
}

export async function apiFetchRaw<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<RawResult<T>> {
  const url = buildUrl(path, params)
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (API_KEY) headers['X-API-Key'] = API_KEY

  const started = performance.now()
  let response: Response
  try {
    response = await fetch(url, { headers })
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error')
  }
  const elapsedMs = performance.now() - started

  const text = await response.text()
  let parsed: unknown = undefined
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === 'object' && 'detail' in parsed
        ? String((parsed as ApiErrorBody).detail)
        : response.statusText
    throw new ApiError(response.status, detail, detail)
  }

  return { data: parsed as T, status: response.status, elapsedMs, url }
}

async function apiFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const result = await apiFetchRaw<T>(path, params)
  return result.data
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = buildUrl(path)
  const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (API_KEY) headers['X-API-Key'] = API_KEY

  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : 'Network error')
  }

  const text = await response.text()
  let parsed: unknown = undefined
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!response.ok) {
    const detail =
      parsed && typeof parsed === 'object' && 'detail' in parsed
        ? String((parsed as ApiErrorBody).detail)
        : response.statusText
    throw new ApiError(response.status, detail, detail)
  }

  return parsed as T
}

// ------------------------------------------------------------------------
// Endpoint calls
// ------------------------------------------------------------------------

export const api = {
  health: () => apiFetch<HealthResponse>('/v1/health'),

  methodology: () => apiFetch<MethodologyResponse>('/v1/methodology'),

  routes: () => apiFetch<RoutesResponse>('/v1/routes'),

  index: (params: { scope?: Scope; route?: string; airline?: string; from?: string; to?: string; window?: string }) =>
    apiFetch<IndexResponse>('/v1/index', params),

  indexLatest: (params: { scope?: Scope; route?: string; airline?: string; window?: string }) =>
    apiFetch<IndexLatestResponse>('/v1/index/latest', params),

  heatmap: (params: { route: string; days?: number }) =>
    apiFetch<HeatmapResponse>('/v1/index/heatmap', params),

  fares: (params: { route?: string; date?: string; airline?: string; window?: string; page?: number; page_size?: number }) =>
    apiFetch<FaresResponse>('/v1/fares', params),

  qualitySummary: () => apiFetch<QualitySummaryResponse>('/v1/quality/summary'),

  formulas: (params: { date?: string; lag_days?: number; quantity_mode?: QuantityMode }) =>
    apiFetch<FormulasResponse>('/v1/analytics/formulas', params),

  trust: () => apiFetch<TrustResponse>('/v1/analytics/trust'),

  forecast: (params: { horizon?: number; confidence?: number; history_days?: number }) =>
    apiFetch<ForecastResponse>('/v1/analytics/forecast', params),

  scenario: (body: ScenarioRequest) => apiPost<ScenarioResponse>('/v1/analytics/scenario', body),

  scenarioAssumptions: () => apiFetch<Record<string, unknown>>('/v1/analytics/scenario/assumptions'),

  ask: (body: AskRequest) => apiPost<AskResponse>('/v1/analytics/ask', body),

  askSuggestions: () => apiFetch<AskSuggestionsResponse>('/v1/analytics/ask/suggestions'),

  contributions: (params: { date?: string; lag_days?: number }) =>
    apiFetch<ContributionsResponse>('/v1/index/contributions', params),

  backtest: (params: { kind?: BacktestKind; days?: number }) =>
    apiFetch<BacktestResponse>('/v1/backtest', params),

  anomalies: (params: { threshold?: number; days?: number }) =>
    apiFetch<AnomaliesResponse>('/v1/analytics/anomalies', params),
}

export interface EndpointParamDef {
  name: string
  required: boolean
  placeholder?: string
}

export interface EndpointDef {
  id: string
  label: string
  path: string
  params: EndpointParamDef[]
}

export const EXPLORER_ENDPOINTS: EndpointDef[] = [
  { id: 'health', label: 'GET /v1/health', path: '/v1/health', params: [] },
  { id: 'methodology', label: 'GET /v1/methodology', path: '/v1/methodology', params: [] },
  { id: 'routes', label: 'GET /v1/routes', path: '/v1/routes', params: [] },
  {
    id: 'index',
    label: 'GET /v1/index',
    path: '/v1/index',
    params: [
      { name: 'scope', required: false, placeholder: 'national | route | airline' },
      { name: 'route', required: false, placeholder: 'DEL-BOM' },
      { name: 'airline', required: false, placeholder: '6E' },
      { name: 'from', required: false, placeholder: 'YYYY-MM-DD' },
      { name: 'to', required: false, placeholder: 'YYYY-MM-DD' },
      { name: 'window', required: false, placeholder: 'T+15 | all' },
    ],
  },
  {
    id: 'index-latest',
    label: 'GET /v1/index/latest',
    path: '/v1/index/latest',
    params: [
      { name: 'scope', required: false, placeholder: 'national | route | airline' },
      { name: 'route', required: false, placeholder: 'DEL-BOM' },
      { name: 'window', required: false, placeholder: 'T+15 | all' },
    ],
  },
  {
    id: 'heatmap',
    label: 'GET /v1/index/heatmap',
    path: '/v1/index/heatmap',
    params: [
      { name: 'route', required: true, placeholder: 'DEL-BOM' },
      { name: 'days', required: false, placeholder: '30' },
    ],
  },
  {
    id: 'fares',
    label: 'GET /v1/fares',
    path: '/v1/fares',
    params: [
      { name: 'route', required: false, placeholder: 'DEL-BOM' },
      { name: 'date', required: false, placeholder: 'YYYY-MM-DD' },
      { name: 'airline', required: false, placeholder: '6E' },
      { name: 'window', required: false, placeholder: 'T+15' },
      { name: 'page', required: false, placeholder: '1' },
      { name: 'page_size', required: false, placeholder: '50' },
    ],
  },
  { id: 'quality-summary', label: 'GET /v1/quality/summary', path: '/v1/quality/summary', params: [] },
]
