import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasStaffApi } from '../api/staff/client'
import {
  listStaffMenu,
  mapStaffMenu,
  setStaffMenuAvailability,
} from '../api/staff/menu'
import { categories as fallbackCategories, menuItems } from '../data/menu'
import type { MenuCategory, MenuItemSummary } from '../types/menu'

interface StaffMenuState {
  categories: MenuCategory[]
  items: MenuItemSummary[]
  loading: boolean
  toggling: string | null
  setSoldOut: (itemId: string, soldOut: boolean) => void
}

export function useStaffMenu(): StaffMenuState {
  const configured = hasStaffApi()
  const [remote, setRemote] = useState<{
    categories: MenuCategory[]
    items: MenuItemSummary[]
  } | null>(null)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) return
    let disposed = false
    const controller = new AbortController()
    listStaffMenu(controller.signal)
      .then((response) => {
        if (!disposed) setRemote(mapStaffMenu(response))
      })
      .catch(() => {
        // The page shows an empty catalog; A03 has no error frame of its own.
      })
    return () => {
      disposed = true
      controller.abort()
    }
  }, [configured])

  const base = useMemo(() => {
    if (configured) return remote
    return {
      categories: fallbackCategories,
      items: menuItems.map((item) => ({ ...item })),
    }
  }, [configured, remote])

  const items = useMemo(() => {
    if (!base) return []
    return base.items.map((item) =>
      item.id in overrides ? { ...item, soldOut: overrides[item.id] } : item,
    )
  }, [base, overrides])

  const setSoldOut = useCallback(
    (itemId: string, soldOut: boolean) => {
      // Optimistic: one tap flips it, and flipping back is the undo (102:1579).
      setOverrides((current) => ({ ...current, [itemId]: soldOut }))
      if (!configured) return
      setToggling(itemId)
      void setStaffMenuAvailability(itemId, soldOut)
        .catch(() => {
          setOverrides((current) => ({ ...current, [itemId]: !soldOut }))
        })
        .finally(() => setToggling(null))
    },
    [configured],
  )

  return {
    categories: base?.categories ?? [],
    items,
    loading: configured && remote === null,
    toggling,
    setSoldOut,
  }
}
