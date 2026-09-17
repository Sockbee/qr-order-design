import { menuImages } from '../data/menuImages'
import { callApi } from './client'
import type { MenuCategory, MenuItemDetail } from '../types/menu'
import type { TableCredentials, TableSession } from '../types/session'

interface ResolveTableResponse {
  table: {
    tableId: string
    displayName: string
  }
  store: {
    name: string
    open: boolean
    notice: string
  }
  statusPollSeconds: number
}

interface MenuResponse {
  categories: Array<{
    categoryId: string
    label: string
    heading: string
  }>
  items: Array<{
    menuId: string
    categoryId: string
    name: string
    description: string
    basePrice: number
    imageUrl: string | null
    available: boolean
    minQuantity: number
    maxQuantity: number
    allergens: string[]
    origin: string | null
    badgeTags: string[]
    coinPrice: number | null
    preparationStation: 'KITCHEN' | 'SERVING'

  }>
  generatedAt: string
}

export interface StorefrontData {
  session: TableSession
  categories: MenuCategory[]
  menuItems: MenuItemDetail[]
  statusPollSeconds: number
  generatedAt: string
}

export async function fetchStorefront(
  credentials: TableCredentials,
  signal?: AbortSignal,
): Promise<StorefrontData> {
  const payload = {
    tableId: credentials.tableId,
    tableToken: credentials.tableToken,
  }
  const bootstrap = await callApi<ResolveTableResponse & MenuResponse>(
    'bootstrap',
    payload,
    signal,
  )
  const resolved = bootstrap
  const menu = bootstrap

  const tableNumber = Number(resolved.table.tableId.slice(1))
  if (!Number.isSafeInteger(tableNumber) || tableNumber < 1) {
    throw new Error('테이블 번호 응답을 확인할 수 없습니다.')
  }

  return {
    session: {
      token: credentials.tableToken,
      storeName: resolved.store.name,
      open: resolved.store.open,
      tableNumber,
      notice: resolved.store.notice,
    },
    categories: menu.categories.map((category) => ({
      id: category.categoryId,
      label: category.label,
      heading: category.heading,
    })),
    menuItems: menu.items.map((item) => ({
      id: item.menuId,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.basePrice,
      soldOut: !item.available,
      imageUrl: item.imageUrl || menuImages[item.menuId],
      minQuantity: item.minQuantity,
      maxQuantity: item.maxQuantity,
      allergens: item.allergens,
      origin: item.origin ?? undefined,
      badgeTags: item.badgeTags,
      coinPrice: item.coinPrice,
      preparationStation: item.preparationStation,
    })),
    statusPollSeconds: resolved.statusPollSeconds,
    generatedAt: menu.generatedAt,
  }
}
