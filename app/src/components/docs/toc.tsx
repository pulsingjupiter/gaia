"use client";
/**
 * "On this page" table of contents — lives in the right rail of the topic
 * page. Listens to scroll position via IntersectionObserver so the active
 * section highlights as the reader moves through the body.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export function Toc({
  headings,
}: {
  headings: { id: string; text: string }[];
}) {
  const [activeId, setActiveId] = useState<string>(headings[0]?.id ?? "");

  useEffect(() => {
    if (typeof window === "undefined" || headings.length === 0) return;
    const ids = headings.map((h) => h.id).filter(Boolean);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting heading.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: [0, 1],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="text-xs">
      <div className="section-header mb-2">On this page</div>
      <ul className="space-y-1.5 border-l border-subtle">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "block border-l-2 pl-3 py-0.5 -ml-px transition",
                activeId === h.id
                  ? "border-accent font-semibold text-primary"
                  : "border-transparent text-muted hover:text-secondary",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
