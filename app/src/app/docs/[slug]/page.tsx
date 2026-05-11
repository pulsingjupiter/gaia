"use client";
/**
 * /docs/[slug] — single doc topic page.
 *
 *   - Breadcrumb header with title, description, reading time.
 *   - Two-column layout on lg+: body on the left, "On this page" TOC on the
 *     right. Single column on smaller screens.
 *   - Prev/next navigation between docs at the bottom.
 *
 * Uses the Next 16 `params: Promise<{...}>` + React `use()` pattern (same as
 * the project detail page).
 */
import { use } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Markdown } from "@/components/docs/markdown";
import { Toc } from "@/components/docs/toc";
import { DocIcon } from "@/components/docs/doc-icon";
import {
  DOCS,
  extractHeadings,
  getDoc,
  readingTimeMinutes,
} from "@/lib/docs/content";

export default function DocTopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const doc = getDoc(slug);

  if (!doc) {
    return (
      <div className="px-6 py-6">
        <div className="card-surface p-8 text-center">
          <h2 className="text-lg font-semibold text-primary">
            Doc not found
          </h2>
          <p className="mt-2 text-sm text-secondary">
            No doc with the slug <code className="font-mono">{slug}</code>.
          </p>
          <Link
            href="/docs"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            <ChevronLeft size={14} />
            Back to docs
          </Link>
        </div>
      </div>
    );
  }

  const headings = extractHeadings(doc.body);
  const minutes = readingTimeMinutes(doc.body);

  const idx = DOCS.findIndex((d) => d.slug === doc.slug);
  const prev = idx > 0 ? DOCS[idx - 1] : null;
  const next = idx >= 0 && idx < DOCS.length - 1 ? DOCS[idx + 1] : null;

  return (
    <div className="px-6 py-6">
      {/* Breadcrumb */}
      <div className="mb-3 flex items-center gap-1.5 text-xs text-muted">
        <Link
          href="/docs"
          className="hover:text-secondary"
        >
          Docs
        </Link>
        <ChevronRight size={12} />
        <span className="text-secondary">{doc.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 pb-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <DocIcon name={doc.icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-primary">
            {doc.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <p className="text-secondary">{doc.description}</p>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock size={11} />
              {minutes} min read
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
        {/* Body */}
        <article className="card-surface p-6 lg:p-8">
          <Markdown body={doc.body} />

          {/* Prev / next nav */}
          <div className="mt-10 grid gap-3 border-t border-subtle pt-5 sm:grid-cols-2">
            {prev ? (
              <Link
                href={`/docs/${prev.slug}`}
                className="group flex items-center gap-2 rounded-lg border border-subtle bg-white p-3 transition hover:border-accent hover:bg-accent-soft/40"
              >
                <ChevronLeft
                  size={16}
                  className="shrink-0 text-muted group-hover:text-accent"
                />
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Previous
                  </div>
                  <div className="truncate text-sm font-semibold text-primary">
                    {prev.title}
                  </div>
                </div>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link
                href={`/docs/${next.slug}`}
                className="group flex items-center justify-end gap-2 rounded-lg border border-subtle bg-white p-3 text-right transition hover:border-accent hover:bg-accent-soft/40"
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Next
                  </div>
                  <div className="truncate text-sm font-semibold text-primary">
                    {next.title}
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-muted group-hover:text-accent"
                />
              </Link>
            ) : (
              <div />
            )}
          </div>
        </article>

        {/* Right rail: TOC. Sticky on lg+, hidden on small screens. */}
        <aside className="hidden lg:block">
          <div className="sticky top-6">
            <Toc headings={headings} />
          </div>
        </aside>
      </div>
    </div>
  );
}
