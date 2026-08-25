/**
 * The table session resolved from the scanned QR code (UX-STRUCTURE §5.1).
 * Placeholder shape for the UI phase — the server will issue this alongside a
 * `session_token`.
 */
export interface TableSession {
  storeName: string
  /** Drives the store-status badge, and E3 once error screens land. */
  open: boolean
  tableNumber: number
  /** Store notice shown under the table chip. */
  notice: string
}
