import { useState, type FormEvent } from 'react'
import { Caveats } from '../components/Caveats'
import { ChartCard } from '../components/ChartCard'
import { ErrorState } from '../components/ErrorState'
import { LoadingSkeleton } from '../components/LoadingSkeleton'
import { useAsk, useAskSuggestions } from '../hooks/useApi'
import type { AskResponse } from '../lib/api'

interface HistoryEntry {
  question: string
  response: AskResponse
}

function ModeBadge({ mode }: { mode: AskResponse['mode'] }) {
  const isDeterministic = mode === 'deterministic'
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ${
        isDeterministic ? 'bg-accent-muted text-accent' : 'bg-rise/10 text-rise'
      }`}
    >
      {isDeterministic ? 'Deterministic' : 'Model'}
    </span>
  )
}

function EvidenceViewer({ evidence }: { evidence: Record<string, unknown> }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-sm border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {open ? 'Hide evidence' : 'View evidence'}
      </button>
      {open ? (
        <pre className="tabular-nums mt-2 max-h-96 overflow-auto rounded-sm border border-border bg-surface-alt p-3 text-xs text-text">
          {JSON.stringify(evidence, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

export default function Ask() {
  const [question, setQuestion] = useState('')
  const [useModel, setUseModel] = useState(true)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const suggestionsQuery = useAskSuggestions()
  const mutation = useAsk()

  function ask(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    mutation.mutate(
      { question: trimmed, use_model: useModel },
      {
        onSuccess: (response) => {
          setHistory((prev) => [{ question: trimmed, response }, ...prev])
        },
      },
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    ask(question)
    setQuestion('')
  }

  const latest = history[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Analyst</h1>
        <p className="max-w-3xl text-sm text-text-muted">
          Ask a question about the published index. Answers are composed directly from the data by default, with
          the evidence they draw on available to check.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
        <label htmlFor="ask-question" className="text-xs font-medium uppercase tracking-wide text-text-muted">
          Question
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="ask-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What is the airfare index today?"
            className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-3 py-2 text-sm text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-surface hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {mutation.isPending ? 'Asking…' : 'Ask'}
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-text-muted select-none">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(e) => setUseModel(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span>Prefer AI model phrasing (Gemini / Claude) when configured</span>
          </label>
        </div>

        {suggestionsQuery.data && suggestionsQuery.data.suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {suggestionsQuery.data.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs text-text hover:bg-accent-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {mutation.isPending ? (
        <LoadingSkeleton rows={3} height={20} label="Getting answer" />
      ) : mutation.isError ? (
        <ErrorState error={mutation.error} onRetry={() => ask(history[0]?.question ?? question)} />
      ) : latest ? (
        <ChartCard
          title="Answer"
          actions={<ModeBadge mode={latest.response.mode} />}
          description={latest.question}
        >
          <p className="text-sm leading-relaxed text-text">{latest.response.answer}</p>
          <EvidenceViewer evidence={latest.response.evidence} />
          <div className="mt-4">
            <Caveats title="Notes" items={latest.response.notes} variant="note" />
          </div>
        </ChartCard>
      ) : null}

      {history.length > 1 ? (
        <ChartCard title="Earlier in this session" description="Question and answer history for this visit.">
          <ul className="flex flex-col divide-y divide-border">
            {history.slice(1).map((entry, i) => (
              <li key={i} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-text">{entry.question}</p>
                  <ModeBadge mode={entry.response.mode} />
                </div>
                <p className="mt-1 text-sm text-text-muted">{entry.response.answer}</p>
              </li>
            ))}
          </ul>
        </ChartCard>
      ) : null}
    </div>
  )
}
