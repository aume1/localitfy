import { LoaderCircle } from "lucide-react";
import type { TagProposal } from "./tagging.types";

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
export const errorText = (reason: unknown) => reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : "Something went wrong. Please try again.";

export const Spinner = () => <LoaderCircle size={14} className="taggingSpinner" aria-hidden="true" />;

/** Plain-language summary of what saving this match changes. */
export function describeChanges(proposal: TagProposal) {
  const { tags, current } = proposal;
  const changes = (["title", "artist", "album", "genre"] as const).filter((key) => tags[key] && tags[key] !== current[key])
    .map((key) => !current[key] || (key === "album" && current.album === "local files") ? `adds ${key}` : `${key} was “${current[key]}”`);
  if (proposal.coverUrl) changes.push("adds cover");
  if (!proposal.writable) changes.push("library only (this file type can’t be tagged)");
  return changes.length ? changes.join(" · ") : "adds track number and MusicBrainz IDs";
}
