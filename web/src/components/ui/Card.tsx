import type { CSSProperties, ReactNode } from "react";

/**
 * Elevation is a hairline plus a soft shadow, never a shadow alone: on the
 * near-white page surface a borderless card dissolves.
 */
export function Card({
  children,
  className = "",
  elevation = 1,
  surface = "card",
  radius = "lg",
  style,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  elevation?: 0 | 1 | 2 | 3 | 4;
  surface?: "card" | "raised" | "sunken";
  radius?: "md" | "lg" | "xl";
  style?: CSSProperties;
  as?: "section" | "div" | "article" | "aside";
} & { id?: string; "aria-labelledby"?: string }) {
  return (
    <Tag
      className={`border ${className}`}
      style={{
        background: `var(--surface-${surface})`,
        borderColor: "var(--border-hairline)",
        borderRadius: `var(--radius-${radius})`,
        boxShadow: `var(--elev-${elevation})`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  id,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="t-title" id={id} style={{ color: "var(--ink-primary)" }}>
          {title}
        </h2>
        {subtitle ? (
          <p className="t-small mt-1 max-w-prose" style={{ color: "var(--ink-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default Card;
