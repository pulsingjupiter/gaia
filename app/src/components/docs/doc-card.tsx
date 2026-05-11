/**
 * Single tile in the /docs grid. Mirrors the visual contract of the
 * project-card: card-surface, hover lift, icon glyph, title, one-line
 * description, footer meta (reading time).
 */
import Link from "next/link";
import { Clock } from "lucide-react";
import { DocIcon } from "./doc-icon";
import type { Doc } from "@/lib/docs/content";

export function DocCard({
  doc,
  minutes,
}: {
  doc: Doc;
  minutes: number;
}) {
  return (
    <Link
      href={`/docs/${doc.slug}`}
      className="card-surface group relative flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="h-[5px] w-full bg-accent" />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <DocIcon name={doc.icon} size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-primary">
              {doc.title}
            </div>
            <p className="mt-1 text-[13px] leading-snug text-secondary">
              {doc.description}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-1.5 pt-4 text-[11px] text-muted">
          <Clock size={11} />
          <span>
            {minutes} min read
          </span>
        </div>
      </div>
    </Link>
  );
}
