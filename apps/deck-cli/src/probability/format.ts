import type { ProbabilityReport } from "./types";

const HEAVY = "━"; // U+2501
const LIGHT = "─"; // U+2500
const BAR_WIDTH = 60;

function heavyBar(): string {
  return HEAVY.repeat(BAR_WIDTH);
}

function lightBar(): string {
  return LIGHT.repeat(52);
}

function pct(value: number): string {
  return (value * 100).toFixed(1) + "%";
}

function padPct(value: number): string {
  return pct(value).padStart(6);
}

export function formatProbabilityReport(
  deckName: string,
  report: ProbabilityReport
): string {
  const lines: string[] = [];

  // Header
  const completeness = report.complete
    ? "[60/60]"
    : `[${report.deckSize}/60 — incomplete]`;
  const header = `  Deck: ${deckName}   ${completeness}`;

  lines.push(heavyBar());
  lines.push(header);
  lines.push(heavyBar());
  lines.push("");

  // Opening hand section
  lines.push(`  Opening hand (7 from ${report.deckSize})`);
  lines.push("  " + lightBar());
  lines.push(
    "  " +
      "Card".padEnd(26) +
      "×".padStart(2) +
      "  " +
      "open 1+".padStart(6) +
      "  " +
      "T2".padStart(6) +
      "  " +
      "T3".padStart(6) +
      "  " +
      "T4".padStart(6)
  );
  lines.push("  " + lightBar());

  for (const card of report.openingHand) {
    const spotlight = card.spotlight ? " ★" : "";
    const nameCol = (card.name + spotlight).padEnd(26);
    const copiesCol = String(card.copies).padStart(2);

    const openCol = padPct(card.pOpen);

    // Turn curve indices 1, 2, 3 correspond to T2, T3, T4
    const t2 = card.turnCurve[1];
    const t3 = card.turnCurve[2];
    const t4 = card.turnCurve[3];

    const t2Col = t2 ? padPct(t2.pAtLeastOne) : "".padStart(6);
    const t3Col = t3 ? padPct(t3.pAtLeastOne) : "".padStart(6);
    const t4Col = t4 ? padPct(t4.pAtLeastOne) : "".padStart(6);

    lines.push(
      "  " +
        nameCol +
        copiesCol +
        "  " +
        openCol +
        "  " +
        t2Col +
        "  " +
        t3Col +
        "  " +
        t4Col
    );
  }

  lines.push("  " + lightBar());

  // Prize risk section
  if (report.prizedRisk.length > 0) {
    const samplePrize = report.prizedRisk[0];
    const prizeChance = samplePrize
      ? pct(samplePrize.pPrized)
      : "?%";

    lines.push("");
    lines.push(
      `  ⚠  Prize risk  (singletons — each has ${prizeChance} chance of being prized)`
    );

    const names = report.prizedRisk.map((e) => e.name);
    const joined = "     " + names.join(" · ");
    lines.push(joined);
  }

  // Footer
  lines.push("");
  lines.push("  ★  = spotlight cards (high-impact singletons)");
  lines.push(heavyBar());

  return lines.join("\n");
}
