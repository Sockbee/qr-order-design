import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import StaffApp from './StaffApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StaffApp />
  </StrictMode>,
)
