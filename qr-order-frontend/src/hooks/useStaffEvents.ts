import { useSyncExternalStore } from 'react'
import { connectStaffEvents } from '../api/events'
import { hasStaffApi } from '../api/staff/client'

let revision = 0
let connected = false
let snapshot = '0:false'
let lastEventId = ''
let lastNumericEventId = 0
let controller: AbortController | null = null
let reconnectTimer: number | undefined
let reconnectAttempt = 0
const subscribers = new Set<() => void>()

function publish(nextRevision = revision, nextConnected = connected) {
  revision = nextRevision
  connected = nextConnected
  snapshot = `${revision}:${connected}`
  subscribers.forEach((subscriber) => subscriber())
}

function emit() {
  publish(revision + 1, connected)
}

function stop() {
  controller?.abort()
  controller = null
  if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  if (connected) publish(revision, false)
}

function connect() {
  if (controller || subscribers.size === 0 || !hasStaffApi() || document.hidden) return
  controller = new AbortController()
  const active = controller
  void connectStaffEvents(
    active.signal,
    lastEventId,
    () => {
      reconnectAttempt = 0
      if (!connected) publish(revision, true)
    },
    (event) => {
      const numericId = Number(event.id)
      if (event.id && Number.isFinite(numericId) && numericId <= lastNumericEventId) return
      if (event.id) {
        lastEventId = event.id
        if (Number.isFinite(numericId)) lastNumericEventId = numericId
      }
      if (event.type !== 'connected') emit()
    },
  ).catch(() => {
    // Polling remains active while the stream reconnects.
  }).finally(() => {
    if (controller !== active) return
    controller = null
    if (connected) publish(revision, false)
    if (subscribers.size === 0 || document.hidden) return
    reconnectAttempt += 1
    reconnectTimer = window.setTimeout(
      connect,
      Math.min(1_000 * 2 ** reconnectAttempt, 30_000),
    )
  })
}

function onVisibilityChange() {
  if (document.hidden) stop()
  else {
    emit()
    connect()
  }
}

function subscribe(callback: () => void) {
  const wasEmpty = subscribers.size === 0
  subscribers.add(callback)
  if (wasEmpty) {
    document.addEventListener('visibilitychange', onVisibilityChange)
    connect()
  }
  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }
}

export function useStaffEventRevision(): number {
  return useStaffEventState().revision
}

export function useStaffEventState(): { revision: number; connected: boolean } {
  const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
  const [value, active] = current.split(':')
  return { revision: Number(value), connected: active === 'true' }
}
