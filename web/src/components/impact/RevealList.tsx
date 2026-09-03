"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const StaggerReveal = dynamic(() => import("@/components/motion/StaggerReveal"), {
  ssr: false,
  // The list renders immediately without the animation. This is the fallback
  // that matters: content first, motion second.
  loading: () => null,
});

/**
 * A list or grid whose items rise into view together.
 *
 * The wrapper exists so the Impact page, which is a server component, can use
 * the client-only GSAP reveal without becoming a client component itself. The
 * children are still rendered on the server and sent as HTML; only the
 * animation is deferred.
 */
export function RevealList({
  children,
  className,
  as = "ul",
}: {
  children: ReactNode;
  className?: string;
  as?: "ul" | "div";
}) {
  const Tag = as;
  return (
    <StaggerReveal selector=":scope > * > *" stagger={0.05} distance={16}>
      <Tag className={className}>{children}</Tag>
    </StaggerReveal>
  );
}

export default RevealList;
