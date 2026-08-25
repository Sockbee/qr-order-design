import { useEffect, useState } from 'react'
import { readStored, writeStored } from '../utils/storage'

/**
 * `useState` that survives refresh and tab loss. The initial value is read
 * once, lazily, so a reload restores what was there rather than overwriting it.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readStored(key, initial))

  useEffect(() => {
    writeStored(key, value)
  }, [key, value])

  return [value, setValue] as const
}
