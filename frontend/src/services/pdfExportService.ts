import type { RouteData, NationalStats } from '../types/map'

export function exportDashboardPDF(
  routes: RouteData[],
  nationalStats: NationalStats,
  filters: {
    region: string
    airline: string
    leadTime: string
    hotspotsOnly: boolean
  },
): void {
  const dateStr = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  // Create printable iframe/window document
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to export the PDF executive report.')
    return
  }

  const tableRows = routes
    .slice(0, 15)
    .map(
      (r) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${r.origin} → ${r.destination}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${r.apix.toFixed(1)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">₹${r.cheapestFare.toLocaleString('en-IN')}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">₹${r.highestFare.toLocaleString('en-IN')}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${r.volatility}%</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${r.status}</td>
    </tr>
  `,
    )
    .join('')

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>AirIndex SIH26056 - Executive Aviation Report</title>
        <style>
          body { font-family: 'Inter', system-ui, sans-serif; padding: 32px; color: #0f172a; }
          .header { border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-between: 24px; margin-bottom: 24px; }
          .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; }
          .kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b; }
          .kpi-val { font-size: 22px; font-weight: 800; font-family: monospace; color: #0ea5e9; margin-top: 4px; }
          .filters-box { background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 8px; font-size: 12px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; }
          th { background: #f1f5f9; padding: 10px 8px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 2px solid #cbd5e1; }
          .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; pt: 16px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">AIRINDEX SIH26056</h1>
            <div class="subtitle">Ministry of Statistics and Programme Implementation (MoSPI) • Live Aviation Intelligence</div>
          </div>
          <div style="font-size: 12px; color: #64748b; text-align: right;">
            <div>Report Generated: <strong>${dateStr}</strong></div>
            <div>Methodology: <strong>APIx 2.0-STD</strong></div>
          </div>
        </div>

        <div class="filters-box">
          <strong>Applied Parameters:</strong> Region: <u>${filters.region}</u> | Carrier: <u>${filters.airline}</u> | Lead Time: <u>${filters.leadTime}</u> | Hotspots Only: <u>${filters.hotspotsOnly ? 'Active' : 'Off'}</u>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">National APIx</div>
            <div class="kpi-val">${nationalStats.apix.toFixed(1)} Pts</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Trust Score</div>
            <div class="kpi-val" style="color: #10b981;">${nationalStats.trustScore}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Observations</div>
            <div class="kpi-val" style="color: #6366f1;">${nationalStats.observationCount.toLocaleString()}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">90-Day Trend</div>
            <div class="kpi-val" style="color: #2563eb;">+4.2%</div>
          </div>
        </div>

        <h3 style="font-size: 14px; font-weight: 700; margin-bottom: 12px;">Top Aviation Corridors Breakdown (${routes.length} Corridors)</h3>
        <table>
          <thead>
            <tr>
              <th>Corridor</th>
              <th>APIx Index</th>
              <th>Cheapest Fare</th>
              <th>Highest Fare</th>
              <th>Volatility</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="footer">
          <div>AirIndex Statistical Engine • SIH2026 Prototype</div>
          <div>Page 1 of 1</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `

  printWindow.document.write(htmlContent)
  printWindow.document.close()
}
