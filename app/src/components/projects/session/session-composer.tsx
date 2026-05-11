"use client";
/**
 * SessionComposer — sticky bottom prompt input. Disabled when session ended.
 * Enter to send, Shift+Enter for newline. Optimistic user-event prepend is
 * handled by the parent via the onSend callback.
 */
import { useRef, useState } from "react";
import { Send } from "lucide-react";

export function SessionComposer({
  ended,
  onSend,
}: {
  ended: boolean;
  onSend: (prompt: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const send = async () => {
    const prompt = value.trim();
    if (!prompt || busy || ended) return;
    setBusy(true);
    const ok = await onSend(prompt);
    setBusy(false);
    if (ok) {
      setValue("");
      taRef.current?.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="border-t border-subtle bg-white px-6 py-3">
      <div
        className="flex items-end gap-2 rounded-xl border border-subtle bg-surface-muted px-3 py-2 focus-within:border-accent"
        title={
          ended
            ? "Resuming with a new prompt will start a fresh session under the original ID — the transcript may continue."
            : ""
        }
      >
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          disabled={ended || busy}
          placeholder={
            ended
              ? "Session ended — resuming will start a fresh process under this ID"
              : "Send a prompt to this session…"
          }
          className="min-h-[44px] flex-1 resize-none bg-transparent text-sm leading-6 text-primary outline-none placeholder:text-muted disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={ended || busy || !value.trim()}
          className="flex size-9 items-center justify-center rounded-lg bg-accent text-white shadow-sm hover:opacity-90 disabled:opacity-40"
          aria-label="Send"
        >
          <Send size={14} />
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
        <span>Enter to send · Shift+Enter for newline</span>
        {ended ? (
          <span>Session ended · Resume to continue</span>
        ) : busy ? (
          <span>Sending…</span>
        ) : null}
      </div>
    </div>
  );
}
