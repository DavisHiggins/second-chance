"use client";

import { MotionConfig } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PreferencesProvider } from "@/components/shell/Preferences";
import SmoothScrollProvider from "@/components/motion/SmoothScrollProvider";

/**
 * `reducedMotion="user"` makes Framer honour the OS preference for every
 * animation for free. The hook is then only needed where reduced motion means a
 * different visual result rather than merely a shorter one.
 *
 * The data-details drawer is opened from the header, the footer and the
 * dashboard's context strip, so its open state lives here rather than in any
 * one of them. It closes on every route change.
 */

interface DataDetailsState {
  open: boolean;
  openDetails: () => void;
  closeDetails: () => void;
}

const DataDetailsContext = createContext<DataDetailsState | null>(null);

export function useDataDetails(): DataDetailsState {
  const context = useContext(DataDetailsContext);
  if (!context) throw new Error("useDataDetails must be used inside Providers");
  return context;
}

function DataDetailsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const openDetails = useCallback(() => setOpen(true), []);
  const closeDetails = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, openDetails, closeDetails }), [open, openDetails, closeDetails]);

  return <DataDetailsContext.Provider value={value}>{children}</DataDetailsContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <MotionConfig reducedMotion="user">
        <SmoothScrollProvider>
          <DataDetailsProvider>{children}</DataDetailsProvider>
        </SmoothScrollProvider>
      </MotionConfig>
    </PreferencesProvider>
  );
}

export default Providers;
