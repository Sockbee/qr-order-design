import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * transitions.dev "tabs sliding": one indicator element that glides to cover
 * whatever `targetSelector` matches inside the list (the selected tab, or its
 * underline slot). The indicator must be absolutely positioned inside the
 * list, and the list must be its offsetParent (any non-static position).
 *
 * The first placement and any later layout change (font swap, viewport
 * resize) snap without a transition, so the indicator never sweeps in from
 * 0,0. Only a selection change animates; the transition itself lives in CSS.
 */
export function useSlidingIndicator(
  listRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  targetSelector: string,
  selectedKey: string | number,
) {
  const placed = useRef<string | null>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    const indicator = indicatorRef.current
    if (!list || !indicator) return

    const place = (animate: boolean) => {
      const target = list.querySelector<HTMLElement>(targetSelector)
      if (!target) {
        indicator.style.visibility = 'hidden'
        placed.current = null
        return
      }
      const box = `${target.offsetLeft},${target.offsetTop},${target.offsetWidth},${target.offsetHeight}`
      // A selection that also reflows the tabs (the bold label is wider)
      // reports a resize afterwards; same box means nothing to correct.
      if (box === placed.current) return
      const first = placed.current === null
      placed.current = box

      if (!animate || first) indicator.style.transition = 'none'
      indicator.style.visibility = ''
      indicator.style.width = `${target.offsetWidth}px`
      indicator.style.height = `${target.offsetHeight}px`
      indicator.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`
      if (!animate || first) {
        void indicator.offsetWidth
        indicator.style.transition = ''
      }
    }

    place(true)
    if (typeof ResizeObserver === 'undefined') return // jsdom

    // ResizeObserver reports every observed element once on observe(); that
    // first batch is the layout we just measured.
    let primed = false
    const observer = new ResizeObserver(() => {
      if (!primed) {
        primed = true
        return
      }
      place(false)
    })
    observer.observe(list)
    for (const tab of list.querySelectorAll('[role="tab"]')) observer.observe(tab)
    return () => observer.disconnect()
  }, [listRef, indicatorRef, targetSelector, selectedKey])
}
