"use client";

import type { ReactNode } from "react";
import { useDataDetails } from "@/components/shell/Providers";

/** A button that opens the shared data-details drawer from anywhere. */
export function DataDetailsTrigger({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { openDetails } = useDataDetails();
  return (
    <button type="button" onClick={openDetails} className={className} style={style} aria-haspopup="dialog">
      {children}
    </button>
  );
}

export default DataDetailsTrigger;
