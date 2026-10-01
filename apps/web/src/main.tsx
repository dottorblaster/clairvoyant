import { initTheme } from '@clairvoyant/ui'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { queryClient } from './lib/queryClient'

import '@clairvoyant/ui/styles.css'

// Resolve and paint the theme before the first render, so there is no flash of
// the wrong theme. CSS carries a `prefers-color-scheme` fallback for the instant
// before this runs.
initTheme()

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
