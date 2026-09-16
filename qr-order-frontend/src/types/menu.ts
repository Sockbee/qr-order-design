export interface MenuCategory {
  id: string
  label: string
  /** Section heading shown above the category's items on S02. */
  heading: string
}

export interface MenuItemSummary {
  id: string
  categoryId: MenuCategory['id']
  name: string
  description: string
  /** Base price in KRW, minor units are not used by the domain. */
  price: number
  coinPrice?: number | null
  preparationStation?: 'KITCHEN' | 'SERVING'
  soldOut: boolean
  imageUrl?: string
  minQuantity?: number
  maxQuantity?: number
  badgeTags?: string[]
}

export interface MenuItemDetail extends MenuItemSummary {
  allergens?: string[]
  origin?: string
}

export interface CartLine {
  itemId: MenuItemSummary['id']
  /** Immutable server snapshot used when the current catalog has changed. */
  nameSnapshot?: string
  quantity: number
  /** Menu cap frozen when the line is added, used to keep the cart submittable. */
  maxQuantitySnapshot?: number
  /** Unit price at the time the line was added. */
  unitPrice: number
}
