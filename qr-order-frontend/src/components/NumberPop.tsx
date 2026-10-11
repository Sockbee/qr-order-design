import { useState } from 'react'
import './NumberPop.css'

interface NumberPopProps {
  /** Already formatted: 3, "12,000원". */
  value: string | number
}

function toNumber(text: string) {
  return Number(text.replace(/[^\d.-]/g, ''))
}

/** Which characters of `next` differ from `prev` and should pop in. */
function changedChars(prev: string, next: string) {
  // Same length: the digits line up, so only the ones that differ move
  // (12,000원 → 12,500원 pops just the 5).
  if (prev.length === next.length) return [...next].map((char, i) => char !== prev[i])
  // Otherwise the shared lead holds and everything after it pops.
  let same = 0
  while (same < prev.length && same < next.length && prev[same] === next[same]) same++
  return [...next].map((_, i) => i >= same)
}

/**
 * transitions.dev "number pop-in": when the value changes, the changed
 * characters rise in through a short blur, staggered left to right; counting
 * down drops them in from above instead. Nothing moves on first render.
 *
 * Shared by the customer and staff apps, so it styles itself with plain CSS
 * rather than Tailwind (CLAUDE.md §4).
 */
export function NumberPop({ value }: NumberPopProps) {
  const text = String(value)
  const [shown, setShown] = useState({
    text,
    changed: [] as boolean[],
    down: false,
    version: 0,
  })

  if (shown.text !== text) {
    setShown({
      text,
      changed: changedChars(shown.text, text),
      down: toNumber(text) < toNumber(shown.text),
      version: shown.version + 1,
    })
  }

  let order = 0
  return (
    <span className={`number-pop${shown.down ? ' number-pop--down' : ''}`}>
      {/* Read as one value; the split characters below are visual only. */}
      <span className="number-pop__text">{text}</span>
      <span className="number-pop__chars" aria-hidden="true">
        {[...text].map((char, index) => {
          if (!shown.changed[index]) {
            return (
              <span key={index} className="number-pop__char">
                {char}
              </span>
            )
          }
          const stagger = Math.min(order++, 2)
          return (
            // A new key per change remounts the character, which replays its
            // CSS animation without any class toggling or forced reflow.
            <span
              key={`${shown.version}:${index}`}
              className="number-pop__char number-pop__char--in"
              style={{ animationDelay: `calc(${stagger} * var(--number-pop-stagger))` }}
            >
              {char}
            </span>
          )
        })}
      </span>
    </span>
  )
}
