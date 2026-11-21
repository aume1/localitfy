import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "../../../vendor/beui/button";
import { useModalFocus } from "../../../shared/hooks/useModalFocus";

export function ComposerButton({ variant = "secondary", size = "md", className = "", ...props }: ButtonProps) {
  return <Button {...props} variant={variant} size={size} pressScale={0.97}
    data-variant={variant} data-size={size} className={"playlistComposerButton " + className} />;
}

type Props = { title: string; description?: string; kind: "prompt" | "smart"; onClose: () => void; children: ReactNode };
/** One isolated, keyboard-safe surface for both editors. beUI provides the
 * interactive buttons; the existing focus hook supports portaled Arc menus. */
export default function PlaylistComposer({ title, description, kind, onClose, children }: Props) {
  const id = useId();
  const dialogRef = useModalFocus(true);
  const reduced = useReducedMotion();
  return createPortal(
    <div className="playlistComposerBackdrop" onClick={onClose}>
      <motion.section ref={dialogRef} tabIndex={-1}
        className={"localtifyPlaylistDialog playlistComposer " + (kind === "prompt" ? "promptPlaylistModal" : "smartPlaylistComposer")}
        role="dialog" aria-modal="true" aria-labelledby={id} aria-describedby={description ? id + "-description" : undefined}
        initial={reduced ? false : { opacity: 0, y: 10, scale: .985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : .18, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) onClose(); }}>
        <header className="playlistComposerHeader">
          <div><h2 id={id}>{title}</h2>{description ? <p id={id + "-description"}>{description}</p> : null}</div>
          <ComposerButton variant="ghost" size="icon" className="playlistComposerClose" aria-label="Close" onClick={onClose}><X size={19}/></ComposerButton>
        </header>
        {children}
      </motion.section>
    </div>, document.querySelector(".app") || document.body
  );
}
