import { CircleCheck, TriangleAlert } from 'lucide-react'

/**
 * Advisory badge for the second-pass AI review of a drafted vendor email.
 *
 * Renders nothing when `review` is null — that means no review was recorded (the call
 * failed, timed out, or the request predates the feature). Failing open is deliberate:
 * a missing review must never be mistaken for a failed one.
 *
 * A supervisor can approve or reject regardless of what this says. It is a quality
 * signal, never a gate — the auto/pending routing is decided in Node before this runs.
 */
export function ReviewBadge({ review, showIssues = false }) {
  if (!review) return null

  if (review.ok) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-ink-faint">
        <CircleCheck size={10} />
        AI-reviewed
      </span>
    )
  }

  return (
    <div className="min-w-0">
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-accent-100 bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
        <TriangleAlert size={10} />
        Review flagged an issue
      </span>
      {showIssues && review.issues.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg border border-accent-100 bg-accent-50/60 p-2.5">
          {review.issues.map((issue, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-accent-700">
              <span aria-hidden="true">·</span>
              <span className="min-w-0">{issue}</span>
            </li>
          ))}
          <li className="pt-0.5 text-[10px] text-ink-faint">
            Advisory only — you can still approve or reject this request.
          </li>
        </ul>
      )}
    </div>
  )
}
