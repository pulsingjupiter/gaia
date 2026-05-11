"use client";
/**
 * /projects/[id]/sessions/[sid] — the session observability surface.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Header (breadcrumb · title · status · meta · CTAs) │
 *   ├──────────────────────────────┬───────────────────────┤
 *   │ Transcript timeline          │ Context rail          │
 *   │ (scrollable)                 │ (Project / Tools /    │
 *   │                              │  Files / Cost)        │
 *   ├──────────────────────────────┴───────────────────────┤
 *   │ Composer                                             │
 *   └──────────────────────────────────────────────────────┘
 *
 * Wires three hooks: useSessionDetail, useSessionTranscript, useSessionEvents.
 * Live SSE events are appended to the transcript view; header counters
 * update by piggy-backing on the live frame ts and refreshing the detail row
 * on resume / prompt actions.
 */
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ContextRail } from "@/components/projects/session/context-rail";
import { SessionComposer } from "@/components/projects/session/session-composer";
import { SessionHeader } from "@/components/projects/session/session-header";
import { TranscriptTimeline } from "@/components/projects/session/transcript-timeline";
import { useProjectDetail } from "@/lib/hooks/use-project-detail";
import { useResumeSession } from "@/lib/hooks/use-resume-session";
import { useSessionDetail } from "@/lib/hooks/use-session-detail";
import { useSessionEvents } from "@/lib/hooks/use-session-events";
import {
  useSessionTranscript,
  type ParsedEvent,
} from "@/lib/hooks/use-session-transcript";

type PageParams = Promise<{ id: string; sid: string }>;

export default function SessionPage({ params }: { params: PageParams }) {
  // Next 16: params is a Promise — unwrap with React.use.
  const { id: projectId, sid: sessionId } = use(params);
  const router = useRouter();
  void router; // reserved for future navigation flows

  const {
    session,
    loading: sessionLoading,
    error: sessionError,
    refresh: refreshSession,
  } = useSessionDetail(sessionId);
  const { project } = useProjectDetail(projectId);
  const {
    events: historicalEvents,
    total,
    loading: transcriptLoading,
    appendLive,
    loadEarlier,
  } = useSessionTranscript(sessionId);
  const { liveEvents, lastFrame } = useSessionEvents(sessionId);

  // Fold live events into the transcript view as they arrive. We only call
  // appendLive once per fresh batch — track how many we've consumed.
  const [liveCursor, setLiveCursor] = useState(0);
  useEffect(() => {
    if (liveEvents.length > liveCursor) {
      const batch = liveEvents.slice(liveCursor);
      appendLive(batch);
      setLiveCursor(liveEvents.length);
    }
  }, [liveEvents, liveCursor, appendLive]);

  // When status frames arrive (or counts change), pull the detail row.
  useEffect(() => {
    if (!lastFrame) return;
    if (
      lastFrame.type === "session:status" ||
      lastFrame.type === "session:end" ||
      lastFrame.type === "session:start"
    ) {
      void refreshSession();
    }
  }, [lastFrame, refreshSession]);

  // Optimistic user events (added when the user hits Send before transcript
  // appends arrive on the bus).
  const [optimistic, setOptimistic] = useState<ParsedEvent[]>([]);

  const allEvents = useMemo<ParsedEvent[]>(
    () => [...historicalEvents, ...optimistic],
    [historicalEvents, optimistic],
  );

  // Toast: short status message that auto-dismisses.
  const [toast, setToast] = useState<string | null>(null);
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  }, []);

  // ── Resume action ────────────────────────────────────────────────────────
  // Per-click terminal selection lives inside ResumeSessionButton (in the
  // header). The page only needs `copy()` for the kebab-menu shortcut.
  const { copy } = useResumeSession();

  const onCopyCommand = useCallback(async () => {
    if (!session) return;
    const result = await copy(session.id);
    if (!result.ok) {
      flashToast(`Copy failed: ${result.error ?? "unknown error"}`);
      return;
    }
    flashToast("Resume command copied.");
  }, [session, flashToast, copy]);

  const onShowTranscriptPath = useCallback(async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.transcript_path).catch(() => {});
      flashToast(`Transcript path copied: ${session.transcript_path}`);
    } catch {
      flashToast(session.transcript_path);
    }
  }, [session, flashToast]);

  const onShowRawJsonl = useCallback(() => {
    flashToast("Raw JSONL viewer not yet wired (TODO).");
  }, [flashToast]);

  // ── Composer send ────────────────────────────────────────────────────────
  const onSend = useCallback(
    async (prompt: string): Promise<boolean> => {
      if (!session) return false;
      // Optimistic prepend.
      const optimisticEvent: ParsedEvent = {
        ts: Date.now(),
        role: "user",
        text: prompt,
      };
      setOptimistic((prev) => [...prev, optimisticEvent]);
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(session.id)}/prompt`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ prompt }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          flashToast(`Send failed: ${err.error ?? res.status}`);
          // roll back the optimistic event
          setOptimistic((prev) => prev.filter((e) => e !== optimisticEvent));
          return false;
        }
        flashToast("Prompt sent. Watching for transcript updates…");
        // Eventually refresh the detail row to pull updated counters.
        window.setTimeout(() => void refreshSession(), 1500);
        return true;
      } catch (err) {
        flashToast(
          `Send error: ${err instanceof Error ? err.message : String(err)}`,
        );
        setOptimistic((prev) => prev.filter((e) => e !== optimisticEvent));
        return false;
      }
    },
    [session, flashToast, refreshSession],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  if (sessionLoading && !session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Loading session…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
        <p>Session not found.</p>
        {sessionError ? (
          <p className="text-xs text-status-error">{sessionError}</p>
        ) : null}
      </div>
    );
  }

  const projectColor = project?.color ?? "#5B5BD6";
  const projectIcon = project?.icon ?? null;
  const projectFallback = project?.name?.slice(0, 1) ?? "P";
  const agentName = project?.agent_name ?? project?.name ?? "Assistant";
  const ended = session.status === "ended";

  return (
    <div className="flex h-screen w-full flex-col bg-page">
      <SessionHeader
        project={project}
        session={session}
        onCopyCommand={onCopyCommand}
        onShowTranscriptPath={onShowTranscriptPath}
        onShowRawJsonl={onShowRawJsonl}
        toast={toast}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <TranscriptTimeline
              events={allEvents}
              total={total}
              loading={transcriptLoading}
              onLoadEarlier={() => void loadEarlier()}
              projectColor={projectColor}
              projectIcon={projectIcon}
              projectFallback={projectFallback}
              agentName={agentName}
            />
          </div>
        </div>
        <ContextRail
          project={project}
          events={allEvents}
          totalCost={session.total_cost_usd}
        />
      </div>
      <SessionComposer ended={ended} onSend={onSend} />
    </div>
  );
}
