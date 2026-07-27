import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { cleanupLegacyServiceWorkersOnBoot } from '@/lib/appReload'
import { flushPendingToast } from '@/lib/toast'

void cleanupLegacyServiceWorkersOnBoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Reload dan keyin kutayotgan toast (masalan "Sessiya tugadi")
window.setTimeout(flushPendingToast, 300)
