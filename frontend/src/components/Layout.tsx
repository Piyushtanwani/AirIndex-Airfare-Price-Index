import { Outlet } from 'react-router-dom'
import { Header } from './Header'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface-alt">
      <Header />

      <main className="page-container min-w-0 flex-1 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
