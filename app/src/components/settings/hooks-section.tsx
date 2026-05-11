"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { SectionPanel } from "@/components/settings/settings-shell";

const SNIPPET = `{
  "hooks": {
    "UserPromptSubmit": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:7878/api/hook -H 'content-type: application/json' -d '{\\"event\\":\\"UserPromptSubmit\\",\\"session_id\\":\\"$CLAUDE_SESSION_ID\\",\\"cwd\\":\\"$PWD\\"}' >/dev/null 2>&1 &" }] }
    ],
    "PreToolUse": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:7878/api/hook -H 'content-type: application/json' -d '{\\"event\\":\\"PreToolUse\\",\\"session_id\\":\\"$CLAUDE_SESSION_ID\\",\\"cwd\\":\\"$PWD\\",\\"tool_name\\":\\"$CLAUDE_TOOL_NAME\\"}' >/dev/null 2>&1 &" }] }
    ],
    "Stop": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://localhost:7878/api/hook -H 'content-type: application/json' -d '{\\"event\\":\\"Stop\\",\\"session_id\\":\\"$CLAUDE_SESSION_ID\\",\\"cwd\\":\\"$PWD\\"}' >/dev/null 2>&1 &" }] }
    ]
  }
}`;

type TestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export function HooksSection() {
  const [copied, setCopied] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  async function runTest() {
    setTest({ kind: "loading" });
    try {
      const res = await fetch("/api/hook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "TestPing",
          session_id: `test-${Date.now()}`,
          cwd: "/tmp",
        }),
      });
      if (res.status === 204 || res.ok) {
        setTest({ kind: "ok" });
      } else {
        const text = await res.text().catch(() => "");
        setTest({
          kind: "error",
          message: `HTTP ${res.status}${text ? ` — ${text}` : ""}`,
        });
      }
    } catch (err) {
      setTest({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <SectionPanel
      title="Hooks (advanced)"
      description="Optional Claude Code hook installer for instant, push-based session updates."
    >
      <div className="space-y-3 text-xs leading-relaxed text-secondary">
        <p>
          Gaia tails session transcripts off disk every second, so updates are
          near-real-time without any setup. For sub-50ms push, paste the
          snippet below into your{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px]">
            ~/.claude/settings.json
          </code>
          .
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={test.kind === "loading"}
            className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-white px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {test.kind === "loading" ? "Testing…" : "Test connection"}
          </button>
          {test.kind === "ok" ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-status-online">
              <Check size={11} /> Hook endpoint is reachable
            </span>
          ) : null}
          {test.kind === "error" ? (
            <span
              className="text-[11px] font-medium text-status-error"
              title={test.message}
            >
              ✗ {test.message}
            </span>
          ) : null}
        </div>
        <div className="relative rounded-lg border border-subtle bg-surface-muted">
          <pre className="overflow-auto p-3 font-mono text-[11px] leading-relaxed text-primary scroll-thin">
            {SNIPPET}
          </pre>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(SNIPPET);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // ignore
              }
            }}
            className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-subtle bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-hover"
          >
            {copied ? (
              <>
                <Check size={11} /> Copied
              </>
            ) : (
              <>
                <Copy size={11} /> Copy snippet
              </>
            )}
          </button>
        </div>
      </div>
    </SectionPanel>
  );
}
