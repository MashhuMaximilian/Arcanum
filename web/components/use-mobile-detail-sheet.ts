"use client";

import { useEffect, useRef, useState } from "react";

const MOBILE_CATALOG_QUERY = "(max-width: 900px)";

export function useMobileDetailSheet(
  isOpen: boolean,
  close: () => void,
) {
  const [isMobile, setIsMobile] = useState(false);
  const historyEntryActive = useRef(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_CATALOG_QUERY);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isMobile || !isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (!historyEntryActive.current) {
      window.history.pushState({ arcanumDetailSheet: true }, "");
      historyEntryActive.current = true;
    }

    function handlePopState() {
      historyEntryActive.current = false;
      close();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isMobile, isOpen]);

  useEffect(() => {
    if (isOpen || !historyEntryActive.current) {
      return;
    }

    historyEntryActive.current = false;
    if (window.history.state?.arcanumDetailSheet) {
      window.history.back();
    }
  }, [isOpen]);

  return isMobile;
}
