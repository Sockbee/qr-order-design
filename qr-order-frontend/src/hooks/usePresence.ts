import { useEffect, useState } from 'react'

/** Matches --animate-*-out / sheet-drop in tailwind.css. */
const EXIT_MS = 150

/** Keeps an overlay mounted for its exit animation after `open` turns false. */
export function usePresence(open: boolean, exitMs = EXIT_MS) {
  const [wasOpen, setWasOpen] = useState(open)
  const [closing, setClosing] = useState(false)

  if (open !== wasOpen) {
    setWasOpen(open)
    setClosing(!open)
  }

  useEffect(() => {
    if (!closing) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = window.setTimeout(() => setClosing(false), reduced ? 0 : exitMs)
    return () => window.clearTimeout(id)
  }, [closing, exitMs])

  return { mounted: open || closing, closing: closing && !open }
}
