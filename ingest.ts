import { pipeline, escapeLeadingHash, pageBreakContinuations, columns, runningFurniture, numberedSections, unlistedHeadingsMinor, hangingIndents } from "@rtm/ingest";

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
  source_url: "https://www.nasa.gov/columbia/home/CAIB_Vol1.html",
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
    columns(),
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
  ],
});
