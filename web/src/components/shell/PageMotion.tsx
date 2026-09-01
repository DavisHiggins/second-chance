"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { childVariant, pageContainer } from "@/lib/motion";

/**
 * Page entrance: content rises 12px and fades in, children staggered, first
 * eight only. Entrance fires once per mount; a filter change re-orders a list,
 * it does not replay this.
 */
export function PageMotion({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={pageContainer}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionChild({
  index,
  children,
  className = "",
  id,
}: {
  index: number;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.div variants={childVariant(index)} className={className} id={id}>
      {children}
    </motion.div>
  );
}

export default PageMotion;
