/**
 * A skeleton is the shape of the thing that is coming, not a spinner. It is only
 * shown by a Suspense boundary that has actually suspended, so content that
 * arrives immediately never flashes one.
 */
export function QueueSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      <div className="skeleton h-10 w-full rounded-[var(--radius-md)]" />
      <ul className="mt-4 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <li
            key={index}
            className="skeleton rounded-[var(--radius-lg)]"
            style={{ height: "var(--row-height)" }}
          />
        ))}
      </ul>
      <span className="sr-only">Loading the needs-attention queue</span>
    </div>
  );
}

export default QueueSkeleton;
