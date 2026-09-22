import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CapsuleNav } from './CapsuleNav'
import { AirIndexIcon } from './Logo'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  isTransparent?: boolean
}

export function Header({ isTransparent = false }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`pointer-events-none transition-all duration-300 z-50 ${
        isTransparent
          ? 'absolute top-0 left-0 right-0 py-3'
          : `sticky top-0 bg-surface/80 backdrop-blur py-2.5 ${
              scrolled ? 'border-b border-border shadow-md' : 'border-b border-transparent'
            }`
      }`}
    >
      <div className="page-container">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Brand Logo Card (Floating Frosted Glass Pill) */}
          <Link
            to="/"
            className="pointer-events-auto group flex items-center gap-3 select-none no-underline rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 shadow-lg backdrop-blur-md transition-all hover:bg-white/95 hover:shadow-xl dark:border-slate-800/80 dark:bg-slate-900/80 dark:hover:bg-slate-900/95"
            title="AirIndex — National Airfare Price Index"
          >
            <AirIndexIcon size="sm" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold tracking-tight text-slate-900 transition-colors group-hover:text-accent dark:text-white">
                  Air<span className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent">Index</span>
                </span>
                <span className="rounded-full bg-teal-500/10 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider text-teal-700 ring-1 ring-inset ring-teal-500/20 dark:text-teal-300">
                  APIX
                </span>
              </div>
              <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
                Airfare Price Index &middot; SIH26056
              </p>
            </div>
          </Link>

          {/* Capsule Nav (Floating) */}
          <div className="pointer-events-auto hidden min-w-0 flex-1 justify-center px-4 min-[1100px]:flex">
            <CapsuleNav />
          </div>

          {/* Theme Toggle Button */}
          <div className="pointer-events-auto">
            <ThemeToggle />
          </div>
        </div>

        <div className="pointer-events-auto mt-2 min-[1100px]:hidden">
          <CapsuleNav />
        </div>
      </div>
    </header>
  )
}
