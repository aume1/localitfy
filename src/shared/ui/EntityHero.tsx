import { Fragment, type ReactNode } from "react";
import { Surface } from "./Surface";
export interface HeroMetaProps {
  items: ReactNode[];
}

export function HeroMeta({ items }: HeroMetaProps) {
  const visible = items.filter(
    (item) =>
      item !== null && item !== undefined && item !== false && item !== "",
  );
  if (visible.length === 0) return null;
  return (
    <p className="collectionHeroStats">
      {visible.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span className="collectionHeroMetaDivider" aria-hidden>
              ·
            </span>
          )}
          <span>{item}</span>
        </Fragment>
      ))}
    </p>
  );
}


export function EntityHero({ cover, title, subtitle, meta, actions, round = false }: {
  cover: ReactNode; title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; actions?: ReactNode; round?: boolean;
}) {
  return <Surface as="header" variant="transparent" className={`collectionHero ${round ? "isRound" : ""}`} data-no-window-drag>
    <div className="collectionHeroArt">{cover}</div>
    <div className="collectionHeroCopy">
      {title}
      {subtitle ? <div className="collectionHeroByline">{subtitle}</div> : null}
      {meta}
    </div>
    <div className="collectionHeroActions">{actions}</div>
  </Surface>;
}
