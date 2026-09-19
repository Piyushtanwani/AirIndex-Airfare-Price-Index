import { useEffect, useState } from 'react'
import { useIndexLatest, useMethodology } from '../hooks/useApi'
import { CapsuleNav } from './CapsuleNav'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const { data: methodology, isError: methodologyError } = useMethodology()
  const { data: latest } = useIndexLatest({ scope: 'national' })
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-20 bg-surface/80 backdrop-blur transition-shadow ${
        scrolled ? 'border-b border-border shadow-md' : 'border-b border-transparent'
      }`}
    >
      <div className="page-container flex flex-col gap-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold tracking-tight text-text">AirIndex</p>
            <p className="text-xs text-text-muted">
              Ministry of Statistics and Programme Implementation &middot; SIH26056
              {methodology ? (
                <> &middot; Methodology {methodology.methodology_version}</>
              ) : methodologyError ? (
                <> &middot; Methodology unavailable</>
              ) : null}
              {latest ? (
                <>
                  {' '}
                  &middot; As of <span className="tabular-nums">{latest.as_of}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="hidden min-w-0 flex-1 justify-center px-4 min-[1100px]:flex">
            <CapsuleNav />
          </div>

          <ThemeToggle />
        </div>

        <div className="min-[1100px]:hidden">
          <CapsuleNav />
        </div>
      </div>
    </header>
  )
}
