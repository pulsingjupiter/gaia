"use client";
/**
 * /docs — hub page. Grid of doc cards plus a client-side fuzzy search that
 * filters by title, description, and the first paragraph of each body.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DocCard } from "@/components/docs/doc-card";
import {
  DOCS,
  firstParagraph,
  readingTimeMinutes,
} from "@/lib/docs/content";

export default function DocsPage() {
  const [query, setQuery] = useState("");

  const enriched = useMemo(
    () =>
      DOCS.map((d) => ({
        doc: d,
        minutes: readingTimeMinutes(d.body),
        haystack: `${d.title}\n${d.description}\n${firstParagraph(d.body)}`.toLowerCase(),
      })),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return enriched;
    const tokens = q.split(/\s+/).filter(Boolean);
    return enriched.filter(({ haystack }) =>
      tokens.every((t) => haystack.includes(t)),
    );
  }, [enriched, query]);

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Docs"
        subtitle="Reference and guides for Gaia."
      />

      <div className="relative max-w-md">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs"
          className="w-full rounded-lg border border-strong bg-white py-2 pl-9 pr-3 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
          aria-label="Search docs"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card-surface mt-6 flex flex-col items-center justify-center gap-2 p-12 text-center">
          <div className="text-sm font-semibold text-primary">
            No docs match your search.
          </div>
          <p className="max-w-md text-xs text-secondary">
            Try a different keyword, or clear the search to see everything.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ doc, minutes }) => (
            <DocCard key={doc.slug} doc={doc} minutes={minutes} />
          ))}
        </div>
      )}
    </div>
  );
}
