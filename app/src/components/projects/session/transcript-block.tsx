"use client";
/**
 * TranscriptBlock — renders one ParsedEvent in the session timeline.
 *
 * Visual treatment per role:
 *  - user:      right-aligned bubble (lavender soft) with "You" badge.
 *  - assistant: left-aligned, no bubble, project icon avatar, prose with
 *               a simple fenced-code-block splitter (no markdown lib).
 *  - tool (with tool_name): inset card "Used <tool>" with collapsible
 *               JSON details. Bash highlights the command. Read/Write/Edit
 *               highlight the file path.
 *  - tool (with tool_result_preview only): small "Tool result" card.
 *  - system:    italic muted line with ℹ︎ prefix.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

import { IconGlyph } from "@/components/projects/icon-glyph";
import type { ParsedEvent } from "@/lib/hooks/use-session-transcript";

function relativeTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Split text into prose / fenced-code blocks. */
type Segment = { kind: "prose"; text: string } | { kind: "code"; lang: string; text: string };

function splitFences(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "prose", text: text.slice(last, m.index) });
    out.push({ kind: "code", lang: m[1] ?? "", text: m[2] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "prose", text: text.slice(last) });
  return out;
}

function renderProse(text: string) {
  // Lightweight prose renderer: preserve newlines, render `inline code`.
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-primary">
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length >= 2 ? (
          <code
            key={i}
            className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[12px] text-primary"
          >
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function CodeBlock({ text, lang }: { text: string; lang?: string }) {
  return (
    <pre className="font-mono whitespace-pre-wrap text-xs bg-surface-muted rounded p-3 overflow-x-auto border border-subtle">
      {lang ? (
        <div className="mb-2 text-[10px] uppercase tracking-wider text-muted">
          {lang}
        </div>
      ) : null}
      <code>{text}</code>
    </pre>
  );
}

function AssistantContent({ text }: { text: string }) {
  const segs = splitFences(text);
  return (
    <div className="space-y-3">
      {segs.map((s, i) =>
        s.kind === "code" ? (
          <CodeBlock key={i} text={s.text} lang={s.lang} />
        ) : (
          renderProse(s.text)
        ),
      )}
    </div>
  );
}

function ToolDetail({ name, input }: { name: string; input: unknown }) {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (name === "Bash" && typeof obj.command === "string") {
    return <CodeBlock text={obj.command} lang="bash" />;
  }
  for (const k of ["file_path", "path", "notebook_path", "filename"]) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) {
      return (
        <div className="flex items-center gap-2 rounded bg-surface-muted px-2 py-1.5 font-mono text-[12px] text-primary">
          <span className="text-muted">{k}:</span>
          <span className="truncate">{v}</span>
        </div>
      );
    }
  }
  // Fallback: pretty-print JSON
  let pretty = "";
  try {
    pretty = JSON.stringify(input, null, 2);
  } catch {
    pretty = String(input);
  }
  return <CodeBlock text={pretty.slice(0, 2000)} lang="json" />;
}

export function TranscriptBlock({
  event,
  defaultExpanded = false,
  projectColor,
  projectIcon,
  projectFallback,
  agentName,
}: {
  event: ParsedEvent;
  defaultExpanded?: boolean;
  projectColor: string;
  projectIcon: string | null | undefined;
  projectFallback: string;
  agentName: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const ts = relativeTime(event.ts);

  if (event.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-accent-soft px-4 py-3 shadow-sm">
          <div className="mb-1 flex items-center justify-end gap-2 text-[11px] text-muted">
            <span>{ts}</span>
            <span className="rounded bg-white px-1.5 py-0.5 font-medium text-accent">
              You
            </span>
          </div>
          {event.text ? renderProse(event.text) : null}
        </div>
      </div>
    );
  }

  if (event.role === "system") {
    return (
      <div className="flex items-center gap-2 px-1 text-xs italic text-muted">
        <Info size={12} />
        <span className="truncate">
          {event.text || event.type || "system event"}
        </span>
      </div>
    );
  }

  if (event.role === "tool") {
    const toolName = event.tool_name ?? "tool";
    const isResult = !event.tool_name && !!event.tool_result_preview;

    if (isResult) {
      const [showMore, setShowMore] = [expanded, setExpanded] as const;
      const preview = event.tool_result_preview ?? "";
      const truncated = preview.length >= 200;
      return (
        <div className="ml-9 rounded-lg border border-subtle bg-surface-muted px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted">
            <span>Tool result</span>
            <span>{ts}</span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-secondary">
            {showMore ? preview : preview.slice(0, 200)}
          </pre>
          {truncated ? (
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="mt-1 text-xs text-accent hover:underline"
            >
              {showMore ? "Show less" : "Show more"}
            </button>
          ) : null}
        </div>
      );
    }

    return (
      <div className="ml-9 rounded-lg border border-subtle bg-white">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-hover"
        >
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-muted">Used</span>
            <span className="font-medium text-primary">{toolName}</span>
          </div>
          <span className="text-[11px] text-muted">{ts}</span>
        </button>
        {expanded ? (
          <div className="border-t border-subtle p-3">
            <ToolDetail name={toolName} input={event.tool_input} />
            {event.tool_result_preview ? (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-secondary">
                {event.tool_result_preview}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // assistant
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">
        <IconGlyph
          icon={projectIcon ?? null}
          fallback={projectFallback}
          color={projectColor}
          size={28}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-primary">{agentName}</span>
          <span className="text-[11px] text-muted">{ts}</span>
        </div>
        {event.text ? <AssistantContent text={event.text} /> : null}
      </div>
    </div>
  );
}
