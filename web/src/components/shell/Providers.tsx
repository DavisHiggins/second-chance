"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { PreferencesProvider } from "@/components/shell/Preferences";

/**
 * `reducedMotion="user"` makes Framer honour the OS preference for every
 * animation for free. The hook is then only needed where reduced motion means a
 * different visual result rather than merely a shorter one.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </PreferencesProvider>
  );
}

export default Providers;
