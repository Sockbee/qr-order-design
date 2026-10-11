import { useSyncExternalStore } from 'react'
import type { FloorPlanView } from '../data/hanshinFloorPlan'
import { readStoredString, writeStoredString } from '../utils/storage'

// Start existing devices on the current QR drawing once; keep subsequent choices.
const STORAGE_KEY = 'qr-order:staff:floor-plan-view:qr-layout-20260917'
const CHANGE_EVENT = 'floor-plan-view-change'
const DEFAULT_VIEW: FloorPlanView = 'window'
let memoryView: FloorPlanView = DEFAULT_VIEW

function getSnapshot(): FloorPlanView {
  const saved = readStoredString(STORAGE_KEY)
  return saved === 'window' || saved === 'pos' ? saved : memoryView
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      memoryView = DEFAULT_VIEW
      onChange()
    }
  }
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function setView(view: FloorPlanView) {
  memoryView = view
  writeStoredString(STORAGE_KEY, view)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** All visible maps, including the map behind a dialog, share the device preference. */
export function useFloorPlanView() {
  const view = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_VIEW)
  return [view, setView] as const
}
