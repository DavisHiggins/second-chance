import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The product's buttons, in one place.
 *
 * Variants: primary (teal), secondary (outline), ghost (text), and two for
 * the navy hero ground. Every variant has hover, keyboard focus, pressed,
 * loading, disabled and success states, and the label never changes width
 * while a state changes: an arrow slides, a spinner replaces the arrow, the
 * words stay where they were.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "band" | "band-outline";

interface CommonProps {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  arrow?: boolean;
  loading?: boolean;
  success?: boolean;
  className?: string;
  children: ReactNode;
}

function classes({
  variant = "primary",
  size = "md",
  success,
  className = "",
}: Pick<CommonProps, "variant" | "size" | "success" | "className">): string {
  return [
    "btn",
    `btn--${success ? "success" : variant}`,
    size === "sm" ? "btn--sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant,
  size,
  arrow = false,
  loading = false,
  success = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button
      type={type}
      className={classes({ variant, size, success, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {success ? <Check size={16} strokeWidth={2} aria-hidden="true" /> : null}
      <span>{children}</span>
      {loading ? (
        <Loader2 size={16} strokeWidth={2} aria-hidden="true" className="animate-spin" />
      ) : arrow ? (
        <ArrowRight size={16} strokeWidth={2} aria-hidden="true" className="btn__arrow" />
      ) : null}
    </button>
  );
}

export function ButtonLink({
  href,
  variant,
  size,
  arrow = false,
  className,
  children,
  external = false,
  ariaLabel,
}: CommonProps & { href: string; external?: boolean; ariaLabel?: string }) {
  const content = (
    <>
      <span>{children}</span>
      {arrow ? (
        <ArrowRight size={16} strokeWidth={2} aria-hidden="true" className="btn__arrow" />
      ) : null}
    </>
  );
  const cls = classes({ variant, size, className });
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer noopener" aria-label={ariaLabel}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} aria-label={ariaLabel}>
      {content}
    </Link>
  );
}

export default Button;
