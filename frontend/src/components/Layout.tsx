import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'

export function Layout() {
  const location = useLocation()
  const isMapRoot = location.pathname === '/' || location.pathname === '/map'

  if (isMapRoot) {
    return (
      <div className="flex h-screen h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-surface-alt touch-none overscroll-none">
        <Header isTransparent={true} />
        <main className="relative flex-1 w-full h-full overflow-hidden touch-none">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-surface-alt">
      <Header isTransparent={false} />
      <main className="page-container min-w-0 flex-1 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
