import { ApiClientError } from '../client'
import { readStaffToken } from './client'

type ApiEnvelope<T> =
  | { success: true; data: T }
  | {
      success: false
      error: { code: string; message: string; retryable: boolean; details?: unknown }
    }

export interface AdminCategory {
  categoryId: string
  label: string
  heading: string
  sortOrder: number
  active: boolean
}

export interface AdminMenu {
  menuId: string
  categoryId: string
  name: string
  description: string
  basePrice: number
  imageUrl: string | null
  available: boolean
  minQuantity: number
  maxQuantity: number
  origin: string | null
  sortOrder: number
}

export interface AdminTable {
  tableId: string
  displayName: string
  tokenVersion: number
  active: boolean
  sortOrder: number
  updatedAt: string
}

export interface AdminSetting {
  key: string
  value: string
  type: string
  description: string
}

export interface CatalogOption {
  optionId: string
  name: string
  priceDelta: number
  available: boolean
  defaultSelected: boolean
  sortOrder: number
}

export interface CatalogOptionGroup {
  optionGroupId: string
  label: string
  required: boolean
  selectionType: 'single' | 'multiple'
  minSelections: number
  maxSelections: number
  sortOrder: number
  options: CatalogOption[]
}

export interface AdminSnapshot {
  tables: AdminTable[]
  categories: AdminCategory[]
  menus: AdminMenu[]
  settings: AdminSetting[]
  catalog: { items: Array<{ menuId: string; optionGroups: CatalogOptionGroup[] }> }
}

async function adminApi<T>(
  path: string,
  method: 'POST' | 'PUT',
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim()
  const token = readStaffToken()
  if (!base || !token) {
    throw new ApiClientError('STAFF_AUTH_REQUIRED', '로그인이 필요합니다.', false)
  }
  const response = await fetch(
    `${base.replace(/\/$/, '')}/api/v1/admin/${path}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal,
    },
  )
  const envelope = (await response.json()) as ApiEnvelope<T>
  if (!envelope.success) {
    throw new ApiClientError(
      envelope.error.code,
      envelope.error.message,
      envelope.error.retryable,
      envelope.error.details,
    )
  }
  return envelope.data
}

export const getAdminSnapshot = (signal?: AbortSignal) =>
  adminApi<AdminSnapshot>('snapshot', 'POST', {}, signal)

export const saveAdminCategory = (category: AdminCategory) =>
  adminApi<void>(`categories/${encodeURIComponent(category.categoryId)}`, 'PUT', category as unknown as Record<string, unknown>)

export const saveAdminMenu = (menu: AdminMenu) =>
  adminApi<void>(`menus/${encodeURIComponent(menu.menuId)}`, 'PUT', menu as unknown as Record<string, unknown>)

export const saveAdminSetting = (key: string, value: string) =>
  adminApi<void>(`settings/${encodeURIComponent(key)}`, 'PUT', { value })

export const saveAdminTable = (table: AdminTable) =>
  adminApi<void>(`tables/${encodeURIComponent(table.tableId)}`, 'PUT', table as unknown as Record<string, unknown>)

export const createAdminTable = (tableId: string, displayName: string, sortOrder: number) =>
  adminApi<TokenResponse>(`tables/${encodeURIComponent(tableId)}`, 'POST', { displayName, sortOrder })

export const rotateAdminTableToken = (tableId: string) =>
  adminApi<TokenResponse>(`tables/${encodeURIComponent(tableId)}/rotate-token`, 'POST')

export interface TokenResponse {
  tableId: string
  tableToken: string
  url: string
  qrSvg: string
}

export const saveAdminOptionGroup = (
  menuId: string,
  group: CatalogOptionGroup,
) =>
  adminApi<void>(
    `option-groups/${encodeURIComponent(group.optionGroupId)}`,
    'PUT',
    { menuId, ...group },
  )

export const saveAdminOption = (
  menuId: string,
  optionGroupId: string,
  option: CatalogOption,
) =>
  adminApi<void>(`options/${encodeURIComponent(option.optionId)}`, 'PUT', {
    menuId,
    optionGroupId,
    ...option,
  })
