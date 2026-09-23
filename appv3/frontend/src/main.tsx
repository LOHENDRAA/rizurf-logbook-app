import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AppProvider } from './state/AppContext'
import { SessionProvider } from './state/sessionContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineBanner } from './components/OfflineBanner'
import { ReauthDialog } from './components/ReauthDialog'
import { getEnv } from './config/env'
import { createQueryClient } from './queryClient'
import './styles.css'

const queryClient = createQueryClient()

// Dev/test-only mock server. Production builds reject VITE_ENABLE_MSW at
// env validation, and this dynamic import is never reached there.
async function maybeStartMocks(): Promise<void> {
  try {
    if (getEnv().enableMsw) {
      const { startMockWorker } = await import('./mocks/browser')
      await startMockWorker()
    }
  } catch {
    // Mock startup is opportunistic; the app boots without it.
  }
}

void maybeStartMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SessionProvider>
            <AppProvider>
              <ErrorBoundary>
                <OfflineBanner />
                <ReauthDialog />
                <App />
              </ErrorBoundary>
            </AppProvider>
          </SessionProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
})
