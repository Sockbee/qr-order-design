import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { readStored, writeStored } from '../utils/storage'

/**
 * `useState` that survives refresh and tab loss. The initial value is read
 * once, lazily, so a reload restores what was there rather than overwriting it.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [entry, setEntry] = useState<{ key: string; value: T }>(() => ({
    key,
    value: readStored(key, initial),
  }))
  const value = entry.key === key ? entry.value : readStored(key, initial)

  const setValue: Dispatch<SetStateAction<T>> = useCallback((action) => {
    setEntry((current) => {
      const currentValue = current.key === key
        ? current.value
        : readStored(key, initial)
      const nextValue = typeof action === 'function'
        ? (action as (previous: T) => T)(currentValue)
        : action
      writeStored(key, nextValue)
      return { key, value: nextValue }
    })
  }, [initial, key])

  return [value, setValue] as const
}
