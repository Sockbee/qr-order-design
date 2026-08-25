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
  soldOut: boolean
  imageUrl?: string
}

export interface CartLine {
  itemId: MenuItemSummary['id']
  quantity: number
  /** Unit price at the time the line was added, options included. */
  unitPrice: number
}
