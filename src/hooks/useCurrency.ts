import { useState } from 'react'

/** Keeps a selected currency valid as the available currencies change (defaults to the first). */
export function useCurrency(currencies: string[]): [string | undefined, (c: string) => void] {
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const current = selected && currencies.includes(selected) ? selected : currencies[0]
  return [current, setSelected]
}
