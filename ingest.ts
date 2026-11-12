import { geometry, layoutPageJoins, pipeline, escapeLeadingHash, pageBreakContinuations, columns, runningFurniture, numberedSections, unlistedHeadingsMinor, hangingIndents, layoutEndnotes, layoutMarkers, hyphenFragments, divisionLabels, typographicHeadings, speakerTurns } from "@rtm/ingest";
import type { BodyPass, PipelineContext } from "@rtm/ingest";

type Line = ReturnType<NonNullable<PipelineContext["layout"]>["lines"]>[number];

/**
 * The words the figures and charts draw, by face (reportsthatmatter-wck). The figures label their parts
 * in Futura Medium at 5-10pt ("Bipod Ramp", "Liquid Hydrogen Tank", p.50; the org chart of p.17; the
 * sensor plots of pp.65-70), or in Arial (the slides of pp.132-138, the briefing chart of p.125), and
 * nothing else in the volume uses those faces: Futura Medium's other sizes are the headings (13-54pt) and
 * the endnotes (11pt); the quoted e-mails are ArialMT 15pt and stay. Left in, the labels stood as
 * paragraphs and quotations between the body's and broke its paragraphs in two ("The Orbiter is attached
 * to the Ex-" / "Bipod Ramp" / "ternal Tank by two umbilical fittings", p.50). A line made only of a
 * figure's words goes, and a label set three or more spaces beside the text is cut from its line; the
 * text's own lines are never re-read. (`figureFaces` cannot be used: it takes font families, and Futura
 * Medium is the headings' family too; its re-weaving also split the e-mail headers of p.163.) The
 * captions (Futura Medium Italic 12pt) and the tables (Futura Medium Italic 13-15pt) stay.
 */
const FIGURE_FACE = /^(Futura-Medium\|([2-9]|10)\||Futura-Medium\|11\|#ffffff|Futura-Medium\|13\|#f6f40f|Arial(MT)?\|([2-9]|1[0-4]|1[6-9]|[2-9][0-9])\||Arial-Black\|)/;
const figureLabels = (): BodyPass => ({
  name: "figureLabels",
  stage: "body",
  run(lines, context, at) {
    const page = at && context?.layout?.page(at.volume, at.pdfIndex);
    if (!page) return lines;
    const key = (t: string) => t.replace(/\s+/g, "");
    const isFigure = (l: Line) =>
      FIGURE_FACE.test(l.font) && !KEEP_FACE.has(l.font) && l.color !== "#808080" && !(at!.pdfIndex === TUFTE_SLIDE && l.family.startsWith("Arial"));
    const body = new Set(page.lines.filter((l) => !isFigure(l)).map((l) => key(l.text)));
    // A figure's words, unless the page also sets the same words outside a figure.
    const figure = new Set(page.lines.filter(isFigure).map((l) => key(l.text)).filter((k) => k && !body.has(k)));
    if (!figure.size) return lines;
    const longest = [...figure].sort((a, b) => b.length - a.length);
    const figureWords = new Set(page.lines.filter(isFigure).flatMap((l) => l.text.trim().split(/\s+/)));
    const onlyFigure = (text: string) => {
      let rest = key(text);
      for (const f of longest) while (rest.includes(f)) rest = rest.replace(f, "");
      return !rest;
    };
    const out: string[] = [];
    for (const line of lines) {
      if (!line.trim()) {
        out.push(line);
        continue;
      }
      // Nothing but a figure's words, one label or several run together ("Bipod Ramp   FeedLine").
      if (onlyFigure(line)) continue;
      // A chart's ticks and labels that the text layer cut and joined otherwise than the layout did
      // ("- 400 500 600 700 800 900 — 1000", p.68; "12.01 03.02", p.132): every word on the line is one
      // the page's figures draw, and the line is none of the text's own.
      const words = line.trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
      if (words.length && words.length <= 12 && !body.has(key(line)) && words.every((w) => figureWords.has(w))) continue;
      // A label set beside the text, three or more spaces apart from it.
      const segments = line.trim().split(/\s{3,}/);
      const kept = segments.filter((s) => !figure.has(key(s)));
      out.push(kept.length < segments.length ? line.slice(0, line.length - line.trimStart().length) + kept.join("   ") : line);
    }
    return out;
  },
});
// The slide Tufte's analysis quotes (p.191) is the subject of the text: its words stay, in every Arial
// face it uses. So does the grey Arial of an e-mail's signature block ("Rodney Rocha (ES2)", p.163).
const TUFTE_SLIDE = 191;
const KEEP_FACE = new Set(["Arial|12|#000000|b", "Arial|9|#000000|b"]);

/**
 * The page's layout lines by their words (whitespace ignored), to find the face and place of a text line.
 * A text that the layout sets more than once on the page, or not at all, has no answer.
 */
const layoutIndex = (context: PipelineContext | undefined, at: { volume: number; pdfIndex: number } | undefined) => {
  const page = at && context?.layout?.page(at.volume, at.pdfIndex);
  if (!page) return undefined;
  const key = (t: string) => t.replace(/\s+/g, "");
  const byKey = new Map<string, Line[]>();
  for (const l of page.lines) {
    const k = key(l.text);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), l]);
  }
  const line = (t: string): Line | undefined => {
    const found = byKey.get(key(t));
    return found?.length === 1 ? found[0] : undefined;
  };
  return { page, line, face: (t: string) => line(t)?.font };
};

/** A line that stops before its sentence does: no closing stop, ending on a word, a comma or a hyphen. */
const open = (t: string) => !/[.!?:;]["”’)\]]*\d*\s*$/.test(t) && /[A-Za-z0-9,\-–—]\s*$/.test(t);
/** A line that opens on a finding's, a list's or a numbered item's label: never a run-on. */
const LABEL = /^\s*(?:[FRO]\d+\.\d+-\d+|[•·▪-]\s|\d+\.\s|\(\w{1,3}\)\s)/;

/**
 * A blank line the text layer puts inside a paragraph, where the page shows none (reportsthatmatter-wck).
 * `pdftotext -layout` sets the page in rows, and a figure, a photograph's caption or a sidebar beside one
 * column puts rows of its own between that column's lines: "Because it is the common element to which the
 * Solid Rocket" / "" / "Boosters and the Orbiter are connected" (p.50, beside Figure 3.2-2's labels), so the
 * paragraph was cut in two at each. This document parts its paragraphs with a line's space, so two lines
 * the layout sets one under the other, in the same face, at the same left edge and one line pitch apart,
 * are one paragraph: the blank lines between them go.
 */
const closeRowGaps = (): BodyPass => ({
  name: "closeRowGaps",
  stage: "body",
  run(lines, context, at) {
    const ix = layoutIndex(context, at);
    if (!ix || !ix.page.pitch) return lines;
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() || !out.length || !out[out.length - 1].trim()) {
        out.push(lines[i]);
        continue;
      }
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      const a = ix.line(out[out.length - 1]);
      const b = j < lines.length ? ix.line(lines[j]) : undefined;
      const joined =
        a && b && !LABEL.test(lines[j]) && a.font === b.font && Math.abs(a.left - b.left) < a.size / 2 && b.top > a.top && b.top - a.top <= ix.page.pitch * 1.3;
      if (!joined) for (let k = i; k < j; k++) out.push(lines[k]);
      i = j - 1;
    }
    return out;
  },
});

/**
 * A paragraph that runs from the foot of the left column to the head of the right (reportsthatmatter-wck).
 * `columns` sets a hard break between the two columns, so that the foot of one is never welded to an
 * unrelated head of the other, and every paragraph that carries on over the gutter was cut in two there:
 * "…the External Tank experiences during launch and" / "ascent. Therefore…" (p.52), "…critical safety
 * information and" / "stifled professional differences of opinion" (p.9). It carries on when the head of
 * the right column is in the same face as the foot of the left, opens on no label, and the foot either
 * stops mid-sentence or runs full to the column's edge (this document's paragraphs end on a short line).
 * When a caption, a heading or a figure heads the right column instead ("…attached to the Ex-" / "Figure
 * 3.2-2. …" / "ternal Tank by two umbilical fittings", p.50), the first block below it in the foot's face
 * that opens in lower case is the rest, and is brought up to it.
 */
const columnWraps = (): BodyPass => ({
  name: "columnWraps",
  stage: "body",
  run(lines, context, at) {
    const ix = layoutIndex(context, at);
    const brk = lines.findIndex((l) => l.includes("column-break") && l.startsWith("\u0000"));
    if (!ix || brk < 0) return lines;
    let a = brk - 1;
    while (a >= 0 && !lines[a].trim()) a--;
    let b = brk + 1;
    while (b < lines.length && !lines[b].trim()) b++;
    if (a < 0 || b >= lines.length) return lines;
    const foot = ix.line(lines[a]);
    const head = ix.line(lines[b]);
    if (!foot || !foot.family.startsWith("Times")) return lines;
    const lefts = new Map<number, number>();
    for (const l of ix.page.lines)
      if (l.font === foot.font && l.left > foot.left + 10 * foot.size) lefts.set(Math.round(l.left), (lefts.get(Math.round(l.left)) ?? 0) + 1);
    // The right column's edge: the leftmost place two or more of its lines start (a finding's hanging text sits in from it).
    const column = [...lefts].filter(([, n]) => n >= 2).sort((x, y) => x[0] - y[0])[0]?.[0];
    if (column === undefined) return lines;
    // The column's full measure: the least right gap of the lines set at the foot's left edge in its face.
    const measure = Math.min(
      ...ix.page.lines.filter((l) => l.font === foot.font && Math.abs(l.left - foot.left) < foot.size / 2).map((l) => l.rightGapEm),
    );
    const full = foot.rightGapEm <= measure + 0.6;
    // A foot and a head set in by the same amount from their own column's edge are the same paragraph's
    // lines (a bullet's or a finding's hanging text: p.181, p.193). The left column's edge is the right
    // column's less this document's column pitch, 397.5pt on every two-column page (26.5 ems of the 15pt
    // body): a column of nothing but hanging text has no line at its edge to measure.
    const leftEdge = column - 397.5;
    const aligned = head && (Math.abs(head.left - column) <= foot.size / 2 || Math.abs(head.left - column - (foot.left - leftEdge)) <= foot.size / 2);
    if (head && head.font === foot.font && aligned && !LABEL.test(lines[b]) && (open(lines[a]) || full)) {
      return [...lines.slice(0, a + 1), ...lines.slice(b)];
    }
    if (!open(lines[a]) || (head && head.font === foot.font)) return lines;
    // Past what heads the right column, to the first block in the foot's face at the column's left edge
    // (a sidebar boxed inside the column can share the body's face, set in from its edge: p.32).
    for (let i = b; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const l = ix.line(lines[i]);
      if (!l || l.font !== foot.font || Math.abs(l.left - column) > foot.size / 2) continue;
      if (lines[i - 1]?.trim() || !/^\s*[a-z]/.test(lines[i])) return lines;
      let end = i;
      while (end < lines.length && lines[end].trim()) end++;
      return [...lines.slice(0, a + 1), ...lines.slice(i, end), ...lines.slice(a + 1, i), ...lines.slice(end)];
    }
    return lines;
  },
});

/**
 * A paragraph that a sidebar or a caption interrupts within its column (reportsthatmatter-2cf): the text
 * layer gives the paragraph's last line ("…the recovery from the Challenger", p.100), then the sidebar set
 * below it (Times 14pt), then the paragraph's rest ("disaster cost the country $12 billion…", Times 15pt)
 * straight under the sidebar's last bullet. A block whose last line stops mid-sentence, followed within a
 * few blocks by a line in its own face that opens in lower case, with only lines in other faces between, is
 * one paragraph: the rest is brought up to it, and what stood between follows.
 */
const sidebarRunOns = (): BodyPass => ({
  name: "sidebarRunOns",
  stage: "body",
  run(lines, context, at) {
    const ix = layoutIndex(context, at);
    if (!ix) return lines;
    for (let a = 0; a < lines.length; a++) {
      if (!lines[a].trim() || lines[a + 1]?.trim() || !open(lines[a])) continue;
      const face = ix.face(lines[a]);
      if (!face) continue;
      // Lines below, in other faces, up to the first in this one.
      let i = a + 1;
      let between = 0;
      let found = false;
      for (; i < lines.length && i < a + 60; i++) {
        if (!lines[i].trim()) continue;
        const f = ix.face(lines[i]);
        if (f === face) {
          found = true;
          break;
        }
        if (!f || lines[i].startsWith("\u0000")) break;
        between++;
      }
      if (!found || !between || !/^\s*[a-z]/.test(lines[i]) || LABEL.test(lines[i])) continue;
      let end = i;
      while (end < lines.length && lines[end].trim() && !lines[end].startsWith("\u0000")) end++;
      lines = [...lines.slice(0, a + 1), ...lines.slice(i, end), "", ...lines.slice(a + 1, i), ...lines.slice(end)];
    }
    return lines;
  },
});

/**
 * A finding, recommendation or observation always opens its own paragraph ("F7.4-13", "R7.5-2", p.193 and
 * p.227). Set under a hanging label, one that follows the last line of the item above with no space between
 * was read as that item's next sentence once the page's own margin was measured ("…throughout the
 * organization. F7.4-13 There are conflicting roles…"): a blank line goes before each label. So does a
 * bullet set straight under a paragraph ("…that promote risk management. • Hazard Analysis:", p.188).
 */
const labelBreaks = (): BodyPass => ({
  name: "labelBreaks",
  stage: "body",
  run: (lines) => lines.flatMap((line, i) => (i > 0 && lines[i - 1].trim() && /^\s*(?:[FRO]\d+\.\d+-\d+\s|•\s)/.test(line) ? ["", line] : [line])),
});

/**
 * Chapter 6's single-column pages set the body in from the margin and the e-mails they quote out at it
 * (pp.135-165): "Flight Director Steve Stich discussed the debris strike…" stands 25 characters in, "-----Original
 * Message-----" at none (p.149). Measured from the e-mails, every body paragraph on those pages was read as a
 * quotation. A page in one column whose body lines (the body's face, at their own left edge) all stand
 * in by the same amount is moved left by it, so that the body sits at the margin and what is set in
 * further (a quotation) or out (an e-mail) keeps its place against it.
 */
const insetBody = (): BodyPass => ({
  name: "insetBody",
  stage: "body",
  run(lines, context, at) {
    const ix = layoutIndex(context, at);
    if (!ix || lines.some((l) => l.startsWith("\u0000"))) return lines;
    const lead = (t: string) => t.length - t.trimStart().length;
    const counts = new Map<number, number>();
    for (const line of lines) {
      const l = line.trim() && ix.line(line);
      if (l && l.font === ix.page.bodyFont && Math.abs(l.left - ix.page.left) < l.size / 2) counts.set(lead(line), (counts.get(lead(line)) ?? 0) + 1);
    }
    const [shift, n] = [...counts].sort((x, y) => y[1] - x[1])[0] ?? [0, 0];
    if (shift < 4 || n < 5) return lines;
    // A quotation's few columns of inset survive the move: a line the page sets 1.5 ems or more right of the
    // body keeps at least six columns of it (p.159's "Let me assure you…", four columns in).
    return lines.map((line) => {
      const moved = line.slice(Math.min(shift, lead(line)));
      const l = line.trim() && ix.line(line);
      const inset = l && l.left - ix.page.left >= 1.5 * l.size;
      return inset && lead(moved) < 6 ? " ".repeat(6) + moved.trimStart() : moved;
    });
  },
});

/**
 * A bullet whose text runs on into further paragraphs, set at the bullet's hanging indent ("• Hazard Analysis:
 * A fundamental element…", then "United Space Alliance, which is responsible for both" two columns in, p.188).
 * Set in by two columns and no more, each line of those paragraphs was read as a paragraph of its own. They
 * come back to the bullet's own margin, where they read as the paragraphs they are.
 */
const bulletParagraphs = (): BodyPass => ({
  name: "bulletParagraphs",
  stage: "body",
  run(lines) {
    const lead = (t: string) => t.length - t.trimStart().length;
    const out = [...lines];
    let hang = -1;
    for (let i = 0; i < out.length; i++) {
      const line = out[i];
      if (!line.trim()) continue;
      const opens = i === 0 || !out[i - 1].trim();
      if (/^\s*•\s/.test(line)) {
        const next = out[i + 1];
        hang = next?.trim() && lead(next) > lead(line) ? lead(next) : -1;
        continue;
      }
      if (!opens || hang < 0) continue;
      let end = i;
      while (end < out.length && out[end].trim()) end++;
      const block = out.slice(i, end);
      if (block.every((l) => lead(l) === hang)) {
        for (let k = i; k < end; k++) out[k] = out[k].slice(hang);
        i = end - 1;
      } else hang = -1;
    }
    return out;
  },
});

/**
 * How this report is built. Owned by the report: every decision that shaped
 * its text is named here, and the passes it composes are library code, so a
 * fix to a shared pass reaches every report that calls it.
 */
export default pipeline({
  id: "columbia-accident",
  title: "Columbia Accident Investigation Board Report, Volume I",
  authors: "Columbia Accident Investigation Board",
  published_at: "August 2003",
  source_url: "https://www.nasa.gov/wp-content/uploads/2025/04/caib-report.pdf",
  repo: ".",
  volumes: [
    {
      path: "archive/CAIB_lowres_full.pdf",
      sha256: "7b95608d7cbfd071c33790deeade6366a490815afcc5f8abf0edfefaa18c7855",
    },
  ],
  // Set in two columns, with a running header on every page. Both are
  // properties of the document, judged per page — its front matter and
  // full-page figures are single-column and are left alone.
  //
  // Its structure is its contents (pp. 4-5): parts, chapters and appendices
  // by label, sections by number. Each division opens under a banner
  // ("CHAPTER 1") that repeats with only its number changed, so furniture
  // must track the page to be furniture; sidebars, charts and quoted emails
  // carry caps lines the contents does not list, which are minor headings,
  // not sections; and findings, recommendations and observations ("F6.3-1")
  // are set under a hanging label (reportsthatmatter-tk8).
  passes: [
    // A paragraph run over a page break that opens on a capital, a digit or a
    // quotation mark (or follows a full stop on a justified page) joins when the
    // layout says it runs on: no first-line indent, same face (reportsthatmatter-38s.10).
    layoutPageJoins(),
    columns(),
    // The body's margin is measured on each page: chapter 6 sets its pages in one inset column with the
    // e-mails it quotes out at the margin, and measured on the document every body paragraph there was
    // read as a quotation (reportsthatmatter-wck).
    geometry("per-page"),
    // The passes below are this report's own (defined above), each on one page's lines after `columns`:
    // the figures' labels go, chapter 6's inset body comes to the margin, and a paragraph cut by a row
    // of a figure, by the gutter or by a sidebar is put back together (reportsthatmatter-wck,
    // reportsthatmatter-2cf, reportsthatmatter-qehj). The layout oracle's paragraphs-oversplit 268 to 151,
    // quotes-spurious 232 to 57.
    figureLabels(),
    insetBody(),
    closeRowGaps(),
    columnWraps(),
    sidebarRunOns(),
    labelBreaks(),
    bulletParagraphs(),
    runningFurniture({ numbersTrackPages: true }),
    numberedSections(),
    unlistedHeadingsMinor(),
    hangingIndents(),
    // Findings and a body paragraph that stop mid-sentence at a page foot
    // resumed as block quotations (3 cases).
    pageBreakContinuations(),
    // An endnote that wraps after "Project" opens a line "# 18-7503-005",
    // which Markdown read as a heading (reportsthatmatter-6zo).
    escapeLeadingHash(),
    // Each chapter ends with its notes, "ENDNOTES FOR CHAPTER 5", set in two
    // columns that pdftotext runs together line by line; read off the layout,
    // they are notes, labelled by chapter, not wrapped lines in the body
    // (reportsthatmatter-izw).
    layoutEndnotes(),
    // The body's markers are raised in the PDF; each links to its own
    // chapter's note, never by page (reportsthatmatter-kgz8).
    layoutMarkers({ scope: "chapter" }),
    // Words broken at a line end that the document writes whole nowhere ("indel- ible"): closed when the head is no word (reportsthatmatter-g3h).
    hyphenFragments(),
    // A lone "Findings" or "Issue" line is a division label, a heading (reportsthatmatter-liv).
    divisionLabels(),
    // Wrapped lines of a Mission Control transcript turn stay in the turn, not a quotation (reportsthatmatter-98u).
    speakerTurns(),
    // Subheadings set in the body's size: Futura where the text is Times, or Times bold (reportsthatmatter-wck).
    typographicHeadings({ firstLevel: 4, skipRunIns: true, maxChars: 85, faces: [["Futura-Medium|15|#000000", "Times|15|#000000|b"]] }),
  ],
});
