import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'

export function Layout() {
  const location = useLocation()
  const isMapRoot = location.pathname === '/' || location.pathname === '/map'

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-surface-alt">
      <Header isTransparent={isMapRoot} />

      <main className={isMapRoot ? 'relative flex-1 w-full h-full overflow-hidden isolate z-0' : 'page-container min-w-0 flex-1 py-6 sm:py-8'}>
        <Outlet />
      </main>
    </div>
  )
}
