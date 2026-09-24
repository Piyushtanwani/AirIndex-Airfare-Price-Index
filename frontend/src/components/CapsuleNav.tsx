import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  end?: boolean
}

// Route paths are unchanged from the previous sidebar navigation; only the
// labels are shortened and the order is regrouped: index pages first, then
// (after the divider) the analysis pages.
const ITEMS: NavItem[] = [
  { to: '/', label: 'Map', end: true },
  { to: '/overview', label: 'Overview' },
  { to: '/routes', label: 'Routes' },
  { to: '/lead-times', label: 'Lead times' },
  { to: '/quality', label: 'Quality' },
  { to: '/formulas', label: 'Formulas' },
  { to: '/forecast', label: 'Forecast' },
  { to: '/trust', label: 'Trust' },
  { to: '/scenario', label: 'Simulator' },
  { to: '/ask', label: 'Analyst' },
  { to: '/diagnostics', label: 'Diagnostics' },
  { to: '/methodology', label: 'Method' },
  { to: '/api', label: 'API' },
]

const DIVIDER_AFTER = '/quality'

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = () => setReduced(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function CapsuleNav() {
  const location = useLocation()
  const reducedMotion = usePrefersReducedMotion()
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map())
  const [fade, setFade] = useState({ start: false, end: false })
  const isInitialRef = useRef(true)
  const [isReady, setIsReady] = useState(false)

  const active = ITEMS.find((item) => isItemActive(item, location.pathname)) ?? ITEMS[0]

  const measure = useCallback(
    (animate = true) => {
      const scroller = scrollerRef.current
      const highlight = highlightRef.current
      const link = linkRefs.current.get(active.to)
      if (!scroller || !highlight || !link) return
      const scrollerRect = scroller.getBoundingClientRect()
      const linkRect = link.getBoundingClientRect()
      const x = linkRect.left - scrollerRect.left + scroller.scrollLeft

      if (!animate || reducedMotion) {
        highlight.style.transition = 'none'
      } else {
        highlight.style.transition =
          'transform 260ms cubic-bezier(0.16, 1, 0.3, 1), width 260ms cubic-bezier(0.16, 1, 0.3, 1)'
      }

      highlight.style.width = `${linkRect.width}px`
      highlight.style.transform = `translateX(${x}px)`

      if (!animate) {
        void highlight.offsetHeight
        setIsReady(true)
      }
    },
    [active.to, reducedMotion],
  )

  const updateFade = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    setFade({
      start: scroller.scrollLeft > 4,
      end: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 4,
    })
  }, [])

  useLayoutEffect(() => {
    if (isInitialRef.current) {
      measure(false)
      isInitialRef.current = false
    } else {
      measure(true)
    }
  }, [measure])

  useEffect(() => {
    const scroller = scrollerRef.current
    const link = linkRefs.current.get(active.to)
    const isInitial = !isReady

    // Center active link strictly within the capsule scroller itself,
    // avoiding window-level scrollIntoView which causes page up/down/left/right shifts.
    if (scroller && link) {
      const scrollerRect = scroller.getBoundingClientRect()
      const linkRect = link.getBoundingClientRect()
      const targetLeft =
        scroller.scrollLeft + (linkRect.left - scrollerRect.left) - (scrollerRect.width - linkRect.width) / 2
      scroller.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: isInitial || reducedMotion ? 'auto' : 'smooth',
      })
    }

    // Re-measure once the scroll settles.
    const id = window.setTimeout(
      () => measure(!isInitial && !reducedMotion),
      isInitial || reducedMotion ? 0 : 280,
    )
    return () => window.clearTimeout(id)
  }, [active.to, reducedMotion, measure, isReady])

  useEffect(() => {
    updateFade()
    measure(!isInitialRef.current && !reducedMotion)
    const scroller = scrollerRef.current
    const onResize = () => {
      updateFade()
      measure(false)
    }
    window.addEventListener('resize', onResize)
    scroller?.addEventListener('scroll', updateFade, { passive: true })
    document.fonts?.ready?.then(() => measure(false)).catch(() => {})
    return () => {
      window.removeEventListener('resize', onResize)
      scroller?.removeEventListener('scroll', updateFade)
    }
  }, [measure, updateFade, reducedMotion])

  return (
    <div className="relative w-full min-w-0 sm:w-auto">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 z-10 h-full w-8 rounded-l-pill bg-gradient-to-r from-surface-raised to-transparent transition-opacity duration-150 ${
          fade.start ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute right-0 top-0 z-10 h-full w-8 rounded-r-pill bg-gradient-to-l from-surface-raised to-transparent transition-opacity duration-150 ${
          fade.end ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={scrollerRef}
        className="scrollbar-hide relative flex max-w-full items-center overflow-x-auto rounded-pill border border-border bg-surface-raised px-1.5 py-1.5 shadow-sm"
      >
        <div
          ref={highlightRef}
          aria-hidden="true"
          className={`absolute left-0 top-1.5 z-0 h-[calc(100%-0.75rem)] rounded-pill bg-accent transition-opacity duration-150 ${
            isReady ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transition:
              isReady && !reducedMotion
                ? 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1), width 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 150ms ease'
                : 'none',
          }}
        />
        <nav aria-label="Primary" className="relative z-[1] flex items-center gap-0.5">
          {ITEMS.map((item) => {
            const isActive = item.to === active.to
            return (
              <div key={item.to} className="flex shrink-0 items-center">
                <NavLink
                  ref={(node) => {
                    if (node) linkRefs.current.set(item.to, node)
                    else linkRefs.current.delete(item.to)
                  }}
                  to={item.to}
                  end={item.end}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative whitespace-nowrap rounded-pill px-3 py-1.5 text-sm font-medium outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    isActive ? 'text-on-accent' : 'text-text-muted hover:bg-surface-alt hover:text-text'
                  }`}
                >
                  {item.label}
                </NavLink>
                {item.to === DIVIDER_AFTER ? (
                  <span aria-hidden="true" className="mx-1.5 h-4 w-px shrink-0 bg-border" />
                ) : null}
              </div>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
