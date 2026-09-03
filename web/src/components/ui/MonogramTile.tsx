import { Cat, Dog } from "lucide-react";

/**
 * The stand-in where a photograph would go.
 *
 * Austin's public feeds carry no photographs at all, so this is the normal
 * case rather than the error case. It deliberately never falls back to a stock
 * image of a different animal: attaching an unrelated photo to a real record
 * would be the most convincing lie on the page.
 *
 * A named animal gets its initial; an unnamed one gets its species mark, which
 * is more useful than a question mark and is true of every record. The tint is
 * the brand teal at its softest, so a grid of these reads as one family rather
 * than as a wall of missing images.
 */
export function MonogramTile({
  name,
  species,
  size = 56,
  radius = "md",
}: {
  name: string | null;
  species?: string;
  size?: number;
  radius?: "md" | "lg" | "xl";
}) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase();
  const Icon = species === "Cat" ? Cat : Dog;

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
      {initial ? initial : <Icon size={Math.round(size * 0.44)} strokeWidth={1.5} />}
    </div>
  );
}

export default MonogramTile;
