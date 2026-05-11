"use client";
/**
 * TranscriptTimeline — owns the scrollable list of TranscriptBlock items.
 *
 * Auto-scrolls to bottom on new events, but only if the user is already
 * pinned within ~100px of the bottom (otherwise we respect their scroll
 * position so they can read history).
 */
import { useEffect, useRef } from "react";

import type { ParsedEvent } from "@/lib/hooks/use-session-transcript";

import { TranscriptBlock } from "./transcript-block";

const PIN_THRESHOLD_PX = 100;

export function TranscriptTimeline({
  events,
  total,
  loading,
  onLoadEarlier,
  projectColor,
  projectIcon,
  projectFallback,
  agentName,
}: {
  events: ParsedEvent[];
  total: number;
  loading: boolean;
  onLoadEarlier: () => void;
  projectColor: string;
  projectIcon: string | null | undefined;
  projectFallback: string;
  agentName: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const lastLenRef = useRef(0);

  // Track whether user is "pinned" near the bottom.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distanceFromBottom < PIN_THRESHOLD_PX;
  };

  // Auto-scroll on new events when pinned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (events.length > lastLenRef.current && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastLenRef.current = events.length;
  }, [events.length]);

  // Initial scroll-to-bottom on first load.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;
    el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
  }, [loading]);

  const olderRemaining = Math.max(0, total - events.length);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="scroll-thin h-full overflow-y-auto px-6 py-6"
    >
      {olderRemaining > 0 ? (
        <div className="mb-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadEarlier}
            className="rounded-full border border-subtle bg-white px-4 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover"
          >
            Load earlier ({olderRemaining} older event{olderRemaining === 1 ? "" : "s"})
          </button>
        </div>
      ) : null}

      {loading && events.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-surface-muted"
            />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-sm text-muted">
          <p>No transcript events yet.</p>
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          {events.map((ev, i) => (
            <TranscriptBlock
              key={`${ev.ts}-${i}`}
              event={ev}
              projectColor={projectColor}
              projectIcon={projectIcon}
              projectFallback={projectFallback}
              agentName={agentName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
