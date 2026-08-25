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
  minQuantity?: number
  maxQuantity?: number
  badgeTags?: string[]
}

export interface MenuOption {
  id: string
  label: string
  /** Signed delta against the item's base price. Always rendered, even at 0. */
  priceDelta: number
  soldOut?: boolean
}

export interface MenuOptionGroup {
  id: string
  label: string
  /** Required groups must have a selection before the item can be added. */
  required: boolean
  /** Radio and check differ only by control glyph (UX-STRUCTURE §4.3). */
  type: 'radio' | 'check'
  options: MenuOption[]
  /** Pre-selected option ids when the detail screen opens. */
  defaultOptionIds?: string[]
  minSelections?: number
  /** Cap on simultaneous selections for a `check` group. */
  maxSelections?: number
}

export interface MenuItemDetail extends MenuItemSummary {
  allergens?: string[]
  origin?: string
  optionGroups: MenuOptionGroup[]
}

export interface CartLine {
  itemId: MenuItemSummary['id']
  /** Immutable server snapshot used when the current catalog has changed. */
  nameSnapshot?: string
  quantity: number
  /** Unit price at the time the line was added, selected options included. */
  unitPrice: number
  selectedOptionIds?: MenuOption['id'][]
  /** Immutable option labels returned by order history. */
  selectedOptionNames?: string[]
}
