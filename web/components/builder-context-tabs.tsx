"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type BuilderContextTabsProps = {
  children: ReactNode;
};

export function BuilderContextTabs({ children }: BuilderContextTabsProps) {
  const [desktopTarget, setDesktopTarget] = useState<HTMLElement | null>(null);
  const [mobileTarget, setMobileTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setDesktopTarget(document.getElementById("builder-context-tabs-desktop"));
    setMobileTarget(document.getElementById("builder-context-tabs-mobile"));
  }, []);

  return (
    <>
      {desktopTarget
        ? createPortal(
            <div className="builder-contextTabs">{children}</div>,
            desktopTarget,
          )
        : null}
      {mobileTarget
        ? createPortal(
            <div className="builder-contextTabs">{children}</div>,
            mobileTarget,
          )
        : null}
    </>
  );
}
