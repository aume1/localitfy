import { useId, type ReactNode } from "react";
import Dialog from "../../../shared/ui/Dialog";
import { X } from "lucide-react";
import { Button, type ButtonProps } from "../../../vendor/beui/button";

export function ComposerButton({ variant = "secondary", size = "md", className = "", ...props }: ButtonProps) {
  return <Button {...props} variant={variant} size={size} pressScale={0.97}
    data-variant={variant} data-size={size} className={"playlistComposerButton " + className} />;
}

type Props = { title: string; description?: string; kind: "prompt" | "smart"; onClose: () => void; children: ReactNode };
export default function PlaylistComposer({ title, description, kind, onClose, children }: Props) {
  const id = useId();
  return <Dialog open onClose={onClose} backdropClassName="playlistComposerBackdrop"
    className={"localtifyPlaylistDialog playlistComposer " + (kind === "prompt" ? "promptPlaylistModal" : "smartPlaylistComposer")}
    labelledBy={id} describedBy={description ? id + "-description" : undefined}>
        <header className="playlistComposerHeader">
          <div><h2 id={id}>{title}</h2>{description ? <p id={id + "-description"}>{description}</p> : null}</div>
          <ComposerButton variant="ghost" size="icon" className="playlistComposerClose" aria-label="Close" onClick={onClose}><X size={19}/></ComposerButton>
        </header>
        {children}
  </Dialog>;
}
