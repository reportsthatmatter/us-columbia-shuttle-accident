import { pipeline, columns, runningFurniture } from "@rtm/ingest";

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
  passes: [columns(), runningFurniture()],
});
