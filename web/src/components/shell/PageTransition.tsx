"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { EASE_OUT } from "@/lib/motion";

/**
 * Route transition: the new page's content fades in and rises 10px over
 * 220ms. The header and footer sit outside it and do not move.
 *
 * There is deliberately no exit phase. An exit animation has to delay the
 * navigation to play, which means intercepting clicks, and that is where
 * modified clicks, downloads, external links and hash links start behaving
 * differently from the browser. Next's own navigation is left alone: back
 * and forward restore scroll and URL state exactly as they would without this
 * component. The Animaster page-transition examples were reviewed (see
 * ATTRIBUTION.md); both require a transition router and were not adopted.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [settled, setSettled] = useState(false);
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      onAnimationStart={() => setSettled(false)}
      onAnimationComplete={() => setSettled(true)}
      // will-change only while moving; once settled Framer writes
      // `transform: none`, so fixed overlays below are not trapped in a
      // transformed containing block.
      style={settled ? undefined : { willChange: "opacity, transform" }}
      className="page-transition"
    >
      {children}
    </motion.div>
  );
}

export default PageTransition;
