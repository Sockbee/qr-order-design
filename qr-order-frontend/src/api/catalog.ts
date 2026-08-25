import { callAppsScript } from './client'
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
    optionGroups: Array<{
      optionGroupId: string
      label: string
      required: boolean
      selectionType: 'single' | 'multiple'
      minSelections: number
      maxSelections: number
      defaultSelectedOptionIds: string[]
      options: Array<{
        optionId: string
        name: string
        priceDelta: number
        available: boolean
      }>
    }>
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
  const [resolved, menu] = await Promise.all([
    callAppsScript<ResolveTableResponse>('resolve-table', payload, signal),
    callAppsScript<MenuResponse>('menu', payload, signal),
  ])

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
      imageUrl: item.imageUrl ?? undefined,
      minQuantity: item.minQuantity,
      maxQuantity: item.maxQuantity,
      allergens: item.allergens,
      origin: item.origin ?? undefined,
      badgeTags: item.badgeTags,
      optionGroups: item.optionGroups.map((group) => ({
        id: group.optionGroupId,
        label: group.label,
        required: group.required,
        type: group.selectionType === 'single' ? 'radio' : 'check',
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        defaultOptionIds: group.defaultSelectedOptionIds,
        options: group.options.map((option) => ({
          id: option.optionId,
          label: option.name,
          priceDelta: option.priceDelta,
          soldOut: !option.available,
        })),
      })),
    })),
    statusPollSeconds: resolved.statusPollSeconds,
    generatedAt: menu.generatedAt,
  }
}
