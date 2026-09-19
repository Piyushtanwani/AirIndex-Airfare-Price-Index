import { useState } from 'react'
import { API_BASE_URL, apiFetchRaw, ApiError, EXPLORER_ENDPOINTS } from '../lib/api'

interface ExplorerResult {
  url: string
  status: number
  elapsedMs: number
  body: string
}

interface ExplorerError {
  url?: string
  status?: number
  message: string
}

export default function ApiExplorer() {
  const [endpointId, setEndpointId] = useState(EXPLORER_ENDPOINTS[0].id)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ExplorerResult | null>(null)
  const [error, setError] = useState<ExplorerError | null>(null)
  const [loading, setLoading] = useState(false)

  const endpoint = EXPLORER_ENDPOINTS.find((e) => e.id === endpointId) ?? EXPLORER_ENDPOINTS[0]

  function handleEndpointChange(id: string) {
    setEndpointId(id)
    setParamValues({})
    setResult(null)
    setError(null)
  }

  async function handleSend() {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      for (const p of endpoint.params) {
        const value = paramValues[p.name]
        if (value) params[p.name] = value
      }
      const missing = endpoint.params.filter((p) => p.required && !params[p.name])
      if (missing.length > 0) {
        throw new ApiError(0, `Missing required parameter(s): ${missing.map((m) => m.name).join(', ')}`)
      }
      const { data, status, elapsedMs, url } = await apiFetchRaw<unknown>(endpoint.path, params)
      setResult({ url, status, elapsedMs, body: JSON.stringify(data, null, 2) })
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">API explorer</h1>
        <p className="text-sm text-text-muted">
          Build a request against the documented endpoints. Full interactive documentation is available at{' '}
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

      <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="endpoint-select" className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Endpoint
            </label>
            <select
              id="endpoint-select"
              value={endpointId}
              onChange={(e) => handleEndpointChange(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {EXPLORER_ENDPOINTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {endpoint.params.length > 0 ? (
          <fieldset className="mt-4">
            <legend className="text-xs font-medium uppercase tracking-wide text-text-muted">Parameters</legend>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {endpoint.params.map((p) => (
                <div key={p.name}>
                  <label htmlFor={`param-${p.name}`} className="text-xs text-text-muted">
                    {p.name}
                    {p.required ? ' (required)' : ''}
                  </label>
                  <input
                    id={`param-${p.name}`}
                    type="text"
                    placeholder={p.placeholder}
                    value={paramValues[p.name] ?? ''}
                    onChange={(e) => setParamValues((v) => ({ ...v, [p.name]: e.target.value }))}
                    className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}

        <button
          type="button"
          onClick={handleSend}
          disabled={loading}
          className="mt-4 rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>

      {(result || error) && (
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Resolved URL</p>
          <p className="mt-1 break-all font-mono text-xs text-text">{result?.url ?? '—'}</p>

          {error ? (
            <p className="mt-3 text-sm text-warn">
              {error.status ? `HTTP ${error.status} — ` : ''}
              {error.message}
            </p>
          ) : result ? (
            <>
              <p className="mt-3 text-xs text-text-muted">
                Status <span className="tabular-nums font-medium text-text">{result.status}</span> &middot;{' '}
                <span className="tabular-nums font-medium text-text">{result.elapsedMs.toFixed(0)} ms</span>
              </p>
              <pre className="mt-2 max-h-96 overflow-auto rounded-sm border border-border bg-surface-alt p-3 font-mono text-xs text-text">
                {result.body}
              </pre>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
