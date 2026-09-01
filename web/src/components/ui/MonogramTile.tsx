/**
 * `photo_url` is null for most animals in this dataset, so the monogram is the
 * normal case and not the error case. It never uses a stock photo of a
 * different animal, and it occupies exactly the space a photo would. The
 * tint is the brand teal at its softest, so a wall of monograms reads as one
 * family rather than as a wall of missing images.
 */
export function MonogramTile({
  name,
  size = 56,
  radius = "md",
}: {
  name: string | null;
  size?: number;
  radius?: "md" | "lg" | "xl";
}) {
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center border"
      style={{
        width: size,
        height: size,
        borderRadius: `var(--radius-${radius})`,
        background: "var(--accent-soft)",
        borderColor: "var(--border-hairline)",
        color: "var(--accent-strong)",
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
      }}
    >
      {initial}
    </div>
  );
}

export default MonogramTile;
