import './TableCardSkeleton.css'

/**
 * Skeleton (99:1559) — flat blocks, no shimmer. DESIGN.md §6 allows only
 * divider, scrim and whitespace for separation, and a shimmer sweep would be
 * a new motion pattern the design language does not have.
 */
export function TableCardSkeleton() {
  return (
    <div className="table-skeleton" aria-hidden="true">
      <span className="table-skeleton__bar table-skeleton__bar--number" />
      <span className="table-skeleton__bar table-skeleton__bar--status" />
      <span className="table-skeleton__bar table-skeleton__bar--amount" />
      <span className="table-skeleton__bar table-skeleton__bar--meta" />
    </div>
  )
}
