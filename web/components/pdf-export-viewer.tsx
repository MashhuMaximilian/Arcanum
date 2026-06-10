"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { clearPdfExportPayload, readPdfExportPayload } from "@/lib/pdf/session";
import type { PdfSvgAssetBundle } from "@/lib/pdf/svg-assets.server";
import type { ResolvedPdfCharacter } from "@/lib/pdf/types";

type PdfExportViewerProps = {
  svgAssets: PdfSvgAssetBundle;
  templateSvg?: string;
  token: string | null;
};

type SkillGroup = {
  title: string;
  items: ResolvedPdfCharacter["frontPage"]["skillRows"];
};

function formatCardTags(tags: string[]) {
  return tags.filter(Boolean).join(" · ");
}

function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function PdfSvgFrame({
  className,
  svg,
}: {
  className?: string;
  svg?: string;
}) {
  if (!svg) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`pdf-export__svgFrame${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function PdfValueCard({
  asset,
  label,
  meta,
  value,
}: {
  asset?: string;
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <article className="pdf-export__valueCard">
      <PdfSvgFrame className="pdf-export__cardFrame pdf-export__cardFrame--value" svg={asset} />
      <div className="pdf-export__cardBody pdf-export__cardBody--value">
        <span className="pdf-export__valueLabel">{label}</span>
        <strong className="pdf-export__valueValue">{value}</strong>
        {meta ? <span className="pdf-export__valueMeta">{meta}</span> : null}
      </div>
    </article>
  );
}

function PdfPanelShell({
  asset,
  children,
  className,
}: {
  asset?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pdf-export__panel${className ? ` ${className}` : ""}`}>
      <PdfSvgFrame className="pdf-export__panelFrame" svg={asset} />
      <div className="pdf-export__panelContent">{children}</div>
    </section>
  );
}

function PdfFeatureCard({
  asset,
  detail,
  kind,
  summary,
  tags,
  title,
}: {
  asset?: string;
  detail?: string;
  kind: string;
  summary: string;
  tags: string[];
  title: string;
}) {
  return (
    <article className={`pdf-export__featureCard pdf-export__featureCard--${kind}`}>
      <PdfSvgFrame className="pdf-export__cardFrame pdf-export__cardFrame--feature" svg={asset} />
      <div className="pdf-export__cardBody pdf-export__cardBody--feature">
        <header className="pdf-export__featureCardHeader">
          <h3>{title}</h3>
          {tags.length ? <span>{formatCardTags(tags)}</span> : null}
        </header>
        <p className="pdf-export__featureCardSummary">{summary}</p>
        {detail ? <div className="pdf-export__featureCardDetail">{detail}</div> : null}
      </div>
    </article>
  );
}

function PdfRailGroup({
  asset,
  cards,
  title,
}: {
  asset?: string;
  cards: ResolvedPdfCharacter["frontPage"]["railCards"];
  title: string;
}) {
  if (!cards.length) {
    return null;
  }

  return (
    <section className="pdf-export__railGroup">
      <h2>{title}</h2>
      <div className="pdf-export__railCards">
        {cards.map((card) => (
          <PdfFeatureCard
            key={card.id}
            asset={asset}
            title={card.title}
            summary={card.summary}
            detail={card.detail}
            tags={card.tags}
            kind={card.kind}
          />
        ))}
      </div>
    </section>
  );
}

function PdfStatsStrip({
  assets,
  stats,
}: {
  assets: PdfSvgAssetBundle;
  stats: ResolvedPdfCharacter["frontPage"]["stats"];
}) {
  const frames = [
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
    assets.statBlock,
  ];

  return (
    <PdfPanelShell asset={assets.hpPanel} className="pdf-export__panel--stats">
      <div className="pdf-export__statsGrid">
        {stats.map((stat, index) => (
          <PdfValueCard
            key={stat.id}
            asset={frames[index % frames.length]}
            label={stat.label}
            value={stat.value}
            meta={stat.meta}
          />
        ))}
      </div>
    </PdfPanelShell>
  );
}

function PdfAbilityPanel({
  abilityRows,
  asset,
  skillGroups,
}: {
  abilityRows: ResolvedPdfCharacter["frontPage"]["abilityRows"];
  asset?: string;
  skillGroups: SkillGroup[];
}) {
  return (
    <PdfPanelShell asset={asset} className="pdf-export__panel--abilities">
      <div className="pdf-export__abilitiesLayout">
        <div className="pdf-export__abilityColumn">
          {abilityRows.map((row) => (
            <article key={row.id} className="pdf-export__abilityCard">
              <span className="pdf-export__abilitySaveLabel">{row.saveProficient ? "SAVE" : "SAVE"}</span>
              <strong className="pdf-export__abilityScore">{row.label}</strong>
              <span className="pdf-export__abilityValue">{row.score}</span>
              <span className="pdf-export__abilityMod">{formatSigned(row.modifier)}</span>
              <span className="pdf-export__abilitySaveValue">Save {formatSigned(row.saveBonus)}</span>
            </article>
          ))}
        </div>
        <div className="pdf-export__skillColumn">
          <h3>Ability checks</h3>
          <div className="pdf-export__skillGrid">
            {skillGroups.map((group) => (
              <section key={group.title} className="pdf-export__skillGroup">
                <h4>{group.title}</h4>
                <ul>
                  {group.items.map((skill) => (
                    <li key={skill.id}>
                      <span className="pdf-export__skillName">{skill.label}</span>
                      <span className="pdf-export__skillValue">{formatSigned(skill.total)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </PdfPanelShell>
  );
}

function PdfAttacksPanel({
  asset,
  attacks,
}: {
  asset?: string;
  attacks: ResolvedPdfCharacter["frontPage"]["attackRows"];
}) {
  return (
    <PdfPanelShell asset={asset} className="pdf-export__panel--attacks">
      <div className="pdf-export__attackTable">
        <header>
          <span>Name</span>
          <span>Hit</span>
          <span>Damage</span>
          <span>Type</span>
          <span>Properties</span>
        </header>
        {attacks.length ? (
          attacks.map((attack) => (
            <div key={attack.id} className="pdf-export__attackRow">
              <span>{attack.name}</span>
              <span>{attack.hit}</span>
              <span>{attack.damage}</span>
              <span>{attack.type || "Weapon"}</span>
              <span>{attack.properties || "—"}</span>
            </div>
          ))
        ) : (
          <div className="pdf-export__attackRow pdf-export__attackRow--empty">
            <span>No equipped weapons detected.</span>
          </div>
        )}
      </div>
    </PdfPanelShell>
  );
}

function PdfPassivesPanel({
  asset,
  character,
}: {
  asset?: string;
  character: ResolvedPdfCharacter;
}) {
  const statsByLabel = new Map(character.frontPage.stats.map((stat) => [stat.label.toLowerCase(), stat]));
  const skillByLabel = new Map(character.frontPage.skillRows.map((skill) => [skill.label.toLowerCase(), skill]));

  const entries = [
    {
      label: "Passive Perception",
      value: statsByLabel.get("passive perception")?.value || `${10 + (skillByLabel.get("perception")?.total ?? 0)}`,
    },
    {
      label: "Passive Insight",
      value: `${10 + (skillByLabel.get("insight")?.total ?? 0)}`,
    },
    {
      label: "Passive Investigation",
      value: `${10 + (skillByLabel.get("investigation")?.total ?? 0)}`,
    },
    {
      label: "Walking",
      value: statsByLabel.get("speed")?.value || "—",
    },
    {
      label: "Flying",
      value: "—",
    },
    {
      label: "Climbing",
      value: "—",
    },
    {
      label: "Swimming",
      value: "—",
    },
    {
      label: "Burrowing",
      value: "—",
    },
  ];

  return (
    <PdfPanelShell asset={asset} className="pdf-export__panel--passives">
      <div className="pdf-export__passiveGrid">
        {entries.map((entry) => (
          <div key={entry.label} className="pdf-export__passiveTile">
            <span>{entry.label}</span>
            <strong>{entry.value}</strong>
          </div>
        ))}
      </div>
    </PdfPanelShell>
  );
}

function PdfFrontPage({
  character,
  svgAssets,
}: {
  character: ResolvedPdfCharacter;
  svgAssets: PdfSvgAssetBundle;
}) {
  const traitCards = useMemo(() => character.frontPage.railCards.filter((card) => card.kind === "trait"), [character.frontPage.railCards]);
  const conditionCards = useMemo(() => character.frontPage.railCards.filter((card) => card.kind === "condition"), [character.frontPage.railCards]);
  const senseCards = useMemo(() => character.frontPage.railCards.filter((card) => card.kind === "sense"), [character.frontPage.railCards]);
  const proficiencyCards = useMemo(() => character.frontPage.railCards.filter((card) => card.kind === "proficiency"), [character.frontPage.railCards]);
  const languageCards = useMemo(() => character.frontPage.railCards.filter((card) => card.kind === "language"), [character.frontPage.railCards]);
  const skillGroups = useMemo<SkillGroup[]>(() => {
    const byAbility = new Map<string, ResolvedPdfCharacter["frontPage"]["skillRows"]>();
    for (const row of character.frontPage.skillRows) {
      const key = row.ability.toUpperCase();
      const list = byAbility.get(key) ?? [];
      list.push(row);
      byAbility.set(key, list);
    }

    return [
      { title: "STR", items: byAbility.get("STR") ?? [] },
      { title: "DEX", items: byAbility.get("DEX") ?? [] },
      { title: "INT", items: byAbility.get("INT") ?? [] },
      { title: "WIS", items: byAbility.get("WIS") ?? [] },
      { title: "CHA", items: byAbility.get("CHA") ?? [] },
    ];
  }, [character.frontPage.skillRows]);

  return (
    <div className="pdf-export__sheetContent">
      <header className="pdf-export__header">
        <PdfSvgFrame className="pdf-export__headerFrame" svg={svgAssets.frontPageHeader} />
        <div className="pdf-export__headerBody">
          <div className="pdf-export__identity">
            <span className="pdf-export__eyebrow">Front</span>
            <h1>{character.name}</h1>
            <p>
              {character.classLabel || "Character"}
              {character.level ? ` · Level ${character.level}` : ""}
            </p>
          </div>
          <div className="pdf-export__identityMeta">
            <div>
              <span>Race</span>
              <strong>{[character.raceLabel, character.subraceLabel].filter(Boolean).join(" / ") || "—"}</strong>
            </div>
            <div>
              <span>Background</span>
              <strong>{character.backgroundLabel || "—"}</strong>
            </div>
            <div>
              <span>Player</span>
              <strong>{character.playerName || "—"}</strong>
            </div>
          </div>
        </div>
      </header>

      <div className="pdf-export__vitalsSection">
        <PdfStatsStrip assets={svgAssets} stats={character.frontPage.stats} />
      </div>

      <section className="pdf-export__midGrid">
        <div className="pdf-export__leftColumn">
          <PdfAbilityPanel abilityRows={character.frontPage.abilityRows} asset={svgAssets.abilityPanel} skillGroups={skillGroups} />
          <PdfPassivesPanel asset={svgAssets.passivesAndSpeeds} character={character} />
          <PdfAttacksPanel asset={svgAssets.weaponAttacks} attacks={character.frontPage.attackRows} />
        </div>
        <aside className="pdf-export__rail">
          <PdfRailGroup asset={svgAssets.generalContainer} title="Racial traits" cards={traitCards} />
          <PdfRailGroup asset={svgAssets.generalContainer} title="Conditions" cards={conditionCards} />
          <PdfRailGroup asset={svgAssets.generalContainer} title="Senses" cards={senseCards} />
          <PdfRailGroup asset={svgAssets.generalContainer} title="Proficiencies" cards={proficiencyCards} />
          <PdfRailGroup asset={svgAssets.generalContainer} title="Languages" cards={languageCards} />
        </aside>
      </section>

      <section className="pdf-export__featuresSection">
        <div className="pdf-export__deckArea">
          <h2>Features and traits</h2>
          <div className="pdf-export__featureGrid">
            {character.frontPage.deck.map((card) => (
              <PdfFeatureCard
                key={card.id}
                asset={svgAssets.generalContainer}
                title={card.title}
                summary={card.summary}
                detail={card.detail}
                tags={card.tags}
                kind={card.kind}
              />
            ))}
          </div>
        </div>
      </section>

      {character.frontPage.notes.length ? (
        <footer className="pdf-export__footerNotes">
          {character.frontPage.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </footer>
      ) : null}
    </div>
  );
}

export function PdfExportViewer({ svgAssets, templateSvg, token }: PdfExportViewerProps) {
  const [character, setCharacter] = useState<ResolvedPdfCharacter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing export token. Please go back and export again.");
      return;
    }

    const payload = readPdfExportPayload(token);
    if (!payload) {
      setError("Export data was not found. Please return to the builder and export again.");
      return;
    }

    clearPdfExportPayload(token);
    setCharacter(payload);
    setReady(true);
  }, [token]);

  useEffect(() => {
    if (!ready || !character) {
      return;
    }

    let cancelled = false;

    const schedulePrint = async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (!cancelled) {
        window.print();
      }
    };

    void schedulePrint();

    return () => {
      cancelled = true;
    };
  }, [character, ready]);

  if (error) {
    return <div className="pdf-export__error">{error}</div>;
  }

  if (!character) {
    return <div className="pdf-export__loading">Loading export preview…</div>;
  }

  return (
    <div className="pdf-export">
      <style>{`
        @page {
          size: A4 landscape;
          margin: 0;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #efe4d2;
        }
        body {
          color: #4c2b1d;
          font-family: Georgia, "Times New Roman", serif;
        }
        .pdf-export {
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: #efe4d2;
          padding: 12px;
        }
        .pdf-export__sheet {
          position: relative;
          width: 297mm;
          min-height: 210mm;
          overflow: hidden;
          background: #f7f1e8;
          box-shadow: 0 18px 40px rgba(68, 42, 28, 0.14);
        }
        .pdf-export__templateSvg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.95;
        }
        .pdf-export__templateSvg svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        .pdf-export__sheetContent {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 8mm;
          padding: 10mm 12mm 10mm;
        }
        .pdf-export__header {
          position: relative;
          min-height: 31mm;
        }
        .pdf-export__headerFrame {
          position: absolute;
          inset: 0;
          opacity: 0.95;
          pointer-events: none;
        }
        .pdf-export__headerFrame svg,
        .pdf-export__panelFrame svg,
        .pdf-export__cardFrame svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        .pdf-export__headerBody {
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: space-between;
          gap: 14mm;
          padding: 8mm 7mm 6mm 8mm;
        }
        .pdf-export__identity h1 {
          margin: 0;
          font-size: 31px;
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .pdf-export__identity p {
          margin: 6px 0 0;
          font-size: 13px;
          opacity: 0.82;
        }
        .pdf-export__eyebrow {
          display: inline-block;
          margin-bottom: 6px;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          opacity: 0.7;
        }
        .pdf-export__identityMeta {
          min-width: 67mm;
          display: grid;
          gap: 4mm;
        }
        .pdf-export__identityMeta div {
          display: grid;
          gap: 2px;
        }
        .pdf-export__identityMeta span {
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          opacity: 0.6;
        }
        .pdf-export__identityMeta strong {
          font-size: 14px;
          font-weight: 700;
        }
        .pdf-export__panel {
          position: relative;
          background: rgba(255, 255, 255, 0.22);
          border: 1px solid rgba(170, 116, 77, 0.18);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 0 rgba(80, 50, 36, 0.04);
        }
        .pdf-export__panelFrame {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.95;
        }
        .pdf-export__panelContent {
          position: relative;
          z-index: 1;
        }
        .pdf-export__panel--stats {
          padding: 8px;
        }
        .pdf-export__statsGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 4mm;
        }
        .pdf-export__valueCard {
          position: relative;
          min-height: 20mm;
          border-radius: 10px;
          overflow: hidden;
        }
        .pdf-export__cardFrame {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.9;
        }
        .pdf-export__cardBody {
          position: relative;
          z-index: 1;
        }
        .pdf-export__cardBody--value {
          padding: 9px 10px 10px;
          min-height: 20mm;
          display: grid;
          grid-template-rows: auto auto 1fr;
          gap: 4px;
        }
        .pdf-export__valueLabel {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.75;
        }
        .pdf-export__valueValue {
          font-size: 24px;
          line-height: 1;
          letter-spacing: -0.03em;
        }
        .pdf-export__valueMeta {
          align-self: end;
          font-size: 10px;
          line-height: 1.25;
          opacity: 0.78;
        }
        .pdf-export__midGrid {
          display: grid;
          grid-template-columns: minmax(0, 1.22fr) minmax(54mm, 0.78fr);
          gap: 6mm;
          align-items: start;
        }
        .pdf-export__leftColumn {
          display: grid;
          gap: 4mm;
        }
        .pdf-export__panel--abilities,
        .pdf-export__panel--passives,
        .pdf-export__panel--attacks {
          padding: 8px;
        }
        .pdf-export__abilitiesLayout {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.1fr);
          gap: 4mm;
        }
        .pdf-export__abilityColumn {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 3mm;
        }
        .pdf-export__abilityCard {
          position: relative;
          min-height: 22mm;
          border-radius: 11px;
          border: 1px solid rgba(170, 116, 77, 0.16);
          background: rgba(255, 255, 255, 0.26);
          padding: 6px 8px;
          display: grid;
          justify-items: center;
          align-content: center;
          gap: 3px;
          text-align: center;
        }
        .pdf-export__abilitySaveLabel {
          position: absolute;
          top: 5px;
          left: 8px;
          font-size: 8px;
          letter-spacing: 0.16em;
          opacity: 0.55;
        }
        .pdf-export__abilityScore {
          font-size: 12px;
          letter-spacing: 0.08em;
        }
        .pdf-export__abilityValue {
          font-size: 18px;
          line-height: 1;
          font-weight: 700;
        }
        .pdf-export__abilityMod {
          font-size: 13px;
          opacity: 0.82;
        }
        .pdf-export__abilitySaveValue {
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0.7;
        }
        .pdf-export__skillColumn h3,
        .pdf-export__deckArea h2 {
          margin: 0 0 4mm;
          font-size: 14px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .pdf-export__skillGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 3mm;
        }
        .pdf-export__skillGroup {
          border: 1px solid rgba(170, 116, 77, 0.16);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.28);
          padding: 7px 8px;
          min-height: 24mm;
        }
        .pdf-export__skillGroup h4 {
          margin: 0 0 3px;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.68;
        }
        .pdf-export__skillGroup ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 2px;
        }
        .pdf-export__skillGroup li {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 10px;
          line-height: 1.2;
        }
        .pdf-export__skillName {
          min-width: 0;
        }
        .pdf-export__skillValue {
          font-variant-numeric: tabular-nums;
        }
        .pdf-export__passiveGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 3mm;
        }
        .pdf-export__passiveTile {
          border: 1px solid rgba(170, 116, 77, 0.16);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.3);
          min-height: 17mm;
          padding: 5px 6px;
          display: grid;
          align-content: center;
          gap: 3px;
        }
        .pdf-export__passiveTile span {
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          opacity: 0.65;
        }
        .pdf-export__passiveTile strong {
          font-size: 15px;
        }
        .pdf-export__attackTable {
          display: grid;
          gap: 2px;
        }
        .pdf-export__attackTable header,
        .pdf-export__attackRow {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) 0.55fr 0.95fr 0.7fr 1.2fr;
          gap: 6px;
          align-items: start;
        }
        .pdf-export__attackTable header {
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.66;
          padding-bottom: 2px;
        }
        .pdf-export__attackRow {
          font-size: 10px;
          line-height: 1.3;
          min-height: 7.5mm;
          padding: 3px 0;
          border-top: 1px solid rgba(170, 116, 77, 0.12);
        }
        .pdf-export__attackRow--empty {
          grid-template-columns: 1fr;
          min-height: 12mm;
        }
        .pdf-export__rail {
          display: grid;
          gap: 4mm;
        }
        .pdf-export__railGroup {
          position: relative;
          padding: 8px;
          min-height: 30mm;
          border-radius: 12px;
          border: 1px solid rgba(170, 116, 77, 0.18);
          background: rgba(255, 255, 255, 0.24);
          overflow: hidden;
        }
        .pdf-export__railGroup h2 {
          margin: 0 0 4px;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .pdf-export__railCards {
          display: grid;
          gap: 4px;
        }
        .pdf-export__railCards .pdf-export__featureCard {
          min-height: 20mm;
        }
        .pdf-export__railCards .pdf-export__cardBody--feature {
          padding: 7px 8px 8px;
        }
        .pdf-export__railCards .pdf-export__featureCardHeader h3 {
          font-size: 11px;
        }
        .pdf-export__railCards .pdf-export__featureCardSummary,
        .pdf-export__railCards .pdf-export__featureCardDetail {
          font-size: 9px;
        }
        .pdf-export__featuresSection {
          display: grid;
          gap: 5mm;
        }
        .pdf-export__featureGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 3.5mm;
        }
        .pdf-export__featureCard {
          break-inside: avoid;
          min-height: 26mm;
        }
        .pdf-export__cardBody--feature {
          padding: 9px 10px 10px;
        }
        .pdf-export__featureCardHeader {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: start;
          margin-bottom: 4px;
        }
        .pdf-export__featureCardHeader h3 {
          margin: 0;
          font-size: 13px;
          line-height: 1.15;
        }
        .pdf-export__featureCardHeader span {
          font-size: 9px;
          opacity: 0.65;
          text-align: right;
        }
        .pdf-export__featureCardSummary {
          margin: 0;
          font-size: 11px;
          line-height: 1.3;
          opacity: 0.9;
        }
        .pdf-export__featureCardDetail {
          margin-top: 6px;
          font-size: 10px;
          line-height: 1.34;
          white-space: pre-wrap;
          opacity: 0.82;
        }
        .pdf-export__footerNotes {
          font-size: 10px;
          opacity: 0.72;
          display: grid;
          gap: 3px;
        }
        .pdf-export__error,
        .pdf-export__loading {
          max-width: 800px;
          padding: 32px;
          background: white;
          border-radius: 14px;
          border: 1px solid rgba(170, 116, 77, 0.28);
          box-shadow: 0 18px 40px rgba(68, 42, 28, 0.12);
        }
        @media print {
          .pdf-export {
            display: block;
            padding: 0;
            background: white;
          }
          .pdf-export__sheet {
            box-shadow: none;
          }
        }
      `}</style>
      <div className="pdf-export__sheet">
        {templateSvg ? (
          <div className="pdf-export__templateSvg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: templateSvg }} />
        ) : null}
        <PdfFrontPage character={character} svgAssets={svgAssets} />
      </div>
    </div>
  );
}
