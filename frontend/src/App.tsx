import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes as RouterRoutes, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import Overview from './pages/Overview'
import IntelligenceMapPage from './pages/IntelligenceMapPage'
import RoutesPage from './pages/Routes'
import RouteDetail from './pages/RouteDetail'
import LeadTimes from './pages/LeadTimes'
import Quality from './pages/Quality'
import Methodology from './pages/Methodology'
import ApiExplorer from './pages/ApiExplorer'
import Formulas from './pages/Formulas'
import Forecast from './pages/Forecast'
import Trust from './pages/Trust'
import Scenario from './pages/Scenario'
import Ask from './pages/Ask'
import Diagnostics from './pages/Diagnostics'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RouterRoutes>
          <Route element={<Layout />}>
            <Route index element={<IntelligenceMapPage />} />
            <Route path="map" element={<Navigate to="/" replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="routes/:code" element={<RouteDetail />} />
            <Route path="lead-times" element={<LeadTimes />} />
            <Route path="quality" element={<Quality />} />
            <Route path="methodology" element={<Methodology />} />
            <Route path="api" element={<ApiExplorer />} />
            <Route path="formulas" element={<Formulas />} />
            <Route path="forecast" element={<Forecast />} />
            <Route path="trust" element={<Trust />} />
            <Route path="scenario" element={<Scenario />} />
            <Route path="ask" element={<Ask />} />
            <Route path="diagnostics" element={<Diagnostics />} />
          </Route>
        </RouterRoutes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
