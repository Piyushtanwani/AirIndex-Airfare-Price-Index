import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { API_BASE_URL, apiFetchRaw, ApiError, EXPLORER_ENDPOINTS, type HeatmapResponse } from '../lib/api'
import { HeatmapView } from '../components/HeatmapView'

interface ExplorerResult {
  url: string
  status: number
  elapsedMs: number
  body: string
  data?: unknown
}

interface ExplorerError {
  url?: string
  status?: number
  message: string
}

const POPULAR_ROUTES = ['DEL-BOM', 'BOM-DEL', 'DEL-BLR', 'BOM-BLR', 'DEL-CCU', 'BOM-GOI']

function getDefaultParams(id: string): Record<string, string> {
  switch (id) {
    case 'heatmap':
      return { route: 'DEL-BOM', days: '30' }
    case 'index':
      return { scope: 'national', window: 'all' }
    case 'index-latest':
      return { scope: 'national', window: 'all' }
    case 'fares':
      return { route: 'DEL-BOM', page_size: '20' }
    default:
      return {}
  }
}

function isHeatmapData(data: unknown): data is HeatmapResponse {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return Array.isArray(d.cells) && Array.isArray(d.dates) && Array.isArray(d.lead_times) && typeof d.route === 'string'
}

export default function ApiExplorer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialEndpoint = searchParams.get('endpoint') || EXPLORER_ENDPOINTS[0].id
  const matchedEndpoint = EXPLORER_ENDPOINTS.find((e) => e.id === initialEndpoint)?.id ?? EXPLORER_ENDPOINTS[0].id

  const [endpointId, setEndpointId] = useState(matchedEndpoint)
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => getDefaultParams(matchedEndpoint))
  const [result, setResult] = useState<ExplorerResult | null>(null)
  const [error, setError] = useState<ExplorerError | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'visual' | 'json'>('visual')
  const [copied, setCopied] = useState(false)

  const endpoint = EXPLORER_ENDPOINTS.find((e) => e.id === endpointId) ?? EXPLORER_ENDPOINTS[0]

  // If query parameter changes, sync state
  useEffect(() => {
    const qEndpoint = searchParams.get('endpoint')
    if (qEndpoint && qEndpoint !== endpointId && EXPLORER_ENDPOINTS.some((e) => e.id === qEndpoint)) {
      setEndpointId(qEndpoint)
      setParamValues(getDefaultParams(qEndpoint))
      setResult(null)
      setError(null)
    }
  }, [searchParams, endpointId])

  function handleEndpointChange(id: string) {
    setEndpointId(id)
    setSearchParams({ endpoint: id })
    setParamValues(getDefaultParams(id))
    setResult(null)
    setError(null)
    setActiveTab('visual')
  }

  async function handleSend() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      for (const p of endpoint.params) {
        const value = paramValues[p.name] || (p.required && p.name === 'route' ? 'DEL-BOM' : undefined)
        if (value) params[p.name] = value
      }
      const missing = endpoint.params.filter((p) => p.required && !params[p.name])
      if (missing.length > 0) {
        throw new ApiError(0, `Missing required parameter(s): ${missing.map((m) => m.name).join(', ')}`)
      }
      const { data, status, elapsedMs, url } = await apiFetchRaw<unknown>(endpoint.path, params)
      setResult({ url, status, elapsedMs, body: JSON.stringify(data, null, 2), data })
      if (isHeatmapData(data)) {
        setActiveTab('visual')
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ status: err.status || undefined, message: err.message })
      } else {
        setError({ message: err instanceof Error ? err.message : 'Unknown error' })
      }
    } finally {
      setLoading(false)
    }
  }

  function handleCopyJson() {
    if (!result?.body) return
    navigator.clipboard.writeText(result.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isHeatmapResult = Boolean(result?.data && isHeatmapData(result.data))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">API explorer</h1>
        <p className="text-sm text-text-muted">
          Execute and inspect live API endpoints with rich data visualizations. Interactive API docs available at{' '}
          <a
            href={`${API_BASE_URL.replace(/\/$/, '')}/docs`}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline hover:no-underline"
          >
            {API_BASE_URL.replace(/\/$/, '')}/docs
          </a>
          .
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="endpoint-select" className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Select Endpoint
            </label>
            <select
              id="endpoint-select"
              value={endpointId}
              onChange={(e) => handleEndpointChange(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {EXPLORER_ENDPOINTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Route Switcher for Heatmap */}
          {endpointId === 'heatmap' && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Quick Route Presets
              </label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {POPULAR_ROUTES.map((code) => (
                  <button
                    type="button"
                    key={code}
                    onClick={() => setParamValues((v) => ({ ...v, route: code }))}
                    className={`rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
                      paramValues.route === code
                        ? 'bg-accent text-white shadow-xs'
                        : 'border border-border bg-surface-alt text-text hover:bg-border/50'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {endpoint.params.length > 0 ? (
          <fieldset className="mt-4 border-t border-border pt-3">
            <legend className="text-xs font-medium uppercase tracking-wide text-text-muted">Parameters</legend>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {endpoint.params.map((p) => (
                <div key={p.name}>
                  <label htmlFor={`param-${p.name}`} className="text-xs text-text-muted">
                    <span className="font-mono">{p.name}</span>
                    {p.required ? <span className="text-warn font-semibold"> *</span> : ' (optional)'}
                  </label>
                  <input
                    id={`param-${p.name}`}
                    type="text"
                    placeholder={p.placeholder}
                    value={paramValues[p.name] ?? ''}
                    onChange={(e) => setParamValues((v) => ({ ...v, [p.name]: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm font-mono text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2 text-sm font-medium text-white shadow-xs transition hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Executing…</span>
              </>
            ) : (
              <span>{endpointId === 'heatmap' ? 'Render Heatmap' : 'Send Request'}</span>
            )}
          </button>

          <span className="text-xs text-text-muted">
            Target: <code className="font-mono text-text">{endpoint.path}</code>
          </span>
        </div>
      </div>

      {(result || error) && (
        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          {/* Status & Timing Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  error
                    ? 'bg-warn/10 text-warn'
                    : result?.status === 200
                    ? 'bg-fall/10 text-fall'
                    : 'bg-text-muted/10 text-text'
                }`}
              >
                {error?.status ? `HTTP ${error.status}` : result ? `HTTP ${result.status} OK` : 'ERROR'}
              </span>

              {result && (
                <span className="text-xs text-text-muted">
                  in <strong className="font-mono text-text">{result.elapsedMs.toFixed(0)} ms</strong>
                </span>
              )}
            </div>

            {/* View Tabs when visual heatmap is available */}
            {isHeatmapResult && (
              <div className="inline-flex rounded-md border border-border bg-surface-alt p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('visual')}
                  className={`flex items-center gap-1.5 rounded-sm px-3 py-1 font-medium transition-colors ${
                    activeTab === 'visual'
                      ? 'bg-surface text-accent shadow-xs'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  <span>📊</span>
                  <span>Visual Heatmap</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('json')}
                  className={`flex items-center gap-1.5 rounded-sm px-3 py-1 font-medium transition-colors ${
                    activeTab === 'json'
                      ? 'bg-surface text-accent shadow-xs'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  <span>💻</span>
                  <span>Raw JSON</span>
                </button>
              </div>
            )}
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Resolved Request URL</p>
            <p className="mt-0.5 break-all font-mono text-xs text-text bg-surface-alt/70 rounded p-1.5 border border-border/50">
              {result?.url ?? error?.url ?? '—'}
            </p>
          </div>

          {error ? (
            <div className="mt-4 rounded-md border border-warn/30 bg-warn/5 p-4 text-sm text-warn">
              <p className="font-semibold">Request Failed</p>
              <p className="mt-1 text-xs">{error.message}</p>
            </div>
          ) : result ? (
            <div className="mt-5">
              {isHeatmapResult && activeTab === 'visual' ? (
                /* Proper Visual Heatmap */
                <HeatmapView
                  data={result.data as HeatmapResponse}
                  title={`Interactive Lead-Time Heatmap (${(result.data as HeatmapResponse).route})`}
                  description="Visual matrix of prices across booking lead times and observation dates. Warm colors indicate fares above base period; cool colors indicate fares below base period."
                />
              ) : (
                /* Raw JSON Code view */
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted">Response Payload</span>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {copied ? '✓ Copied' : '📋 Copy JSON'}
                    </button>
                  </div>
                  <pre className="max-h-[500px] overflow-auto rounded-md border border-border bg-surface-alt p-4 font-mono text-xs text-text leading-relaxed">
                    {result.body}
                  </pre>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
