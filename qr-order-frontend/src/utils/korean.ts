const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3
const JONGSEONG_COUNT = 28

/**
 * "을" after a batchim, "를" otherwise (e.g. "항목을" vs "커피를"). Falls
 * back to "를" for a name that doesn't end in a Hangul syllable.
 */
export function objectParticle(word: string): '을' | '를' {
  const lastChar = word.trim().at(-1)
  if (!lastChar) return '를'

  const code = lastChar.charCodeAt(0)
  if (code < HANGUL_BASE || code > HANGUL_LAST) return '를'

  const hasBatchim = (code - HANGUL_BASE) % JONGSEONG_COUNT !== 0
  return hasBatchim ? '을' : '를'
}
