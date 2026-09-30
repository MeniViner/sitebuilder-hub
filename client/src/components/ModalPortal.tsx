import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

let activeModalLayers = 0;
let frameSnapshot: { inert: boolean; ariaHidden: string | null } | null = null;

export function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const frame = document.querySelector<HTMLElement>(".app-shell-frame");
    if (!frame) return;

    if (activeModalLayers === 0) {
      frameSnapshot = {
        inert: frame.hasAttribute("inert"),
        ariaHidden: frame.getAttribute("aria-hidden")
      };
      frame.setAttribute("inert", "");
      frame.setAttribute("aria-hidden", "true");
    }
    activeModalLayers += 1;

    return () => {
      activeModalLayers = Math.max(0, activeModalLayers - 1);
      if (activeModalLayers !== 0 || !frameSnapshot) return;
      if (!frameSnapshot.inert) frame.removeAttribute("inert");
      if (frameSnapshot.ariaHidden === null) frame.removeAttribute("aria-hidden");
      else frame.setAttribute("aria-hidden", frameSnapshot.ariaHidden);
      frameSnapshot = null;
    };
  }, []);

  return createPortal(children, document.body);
}
