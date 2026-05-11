"use client";
import { useCallback, useState, type KeyboardEvent } from "react";
import { Paperclip, Send, Smile, Sparkles } from "lucide-react";

const SHORTCUTS = [
  { icon: "👍", label: "Great, thanks!" },
  { icon: "🔍", label: "Can you dig deeper?" },
  { icon: "📋", label: "Add to report" },
  { icon: "✅", label: "Create task" },
];

export function Composer({
  name,
  onSend,
  disabled,
}: {
  name: string;
  onSend: (body: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const send = useCallback(async () => {
    const body = value.trim();
    if (!body || busy || disabled) return;
    setBusy(true);
    setValue(""); // optimistic clear
    try {
      await onSend(body);
    } finally {
      setBusy(false);
    }
  }, [value, busy, disabled, onSend]);

  const insertShortcut = (label: string) => {
    setValue((prev) => (prev ? `${prev} ${label}` : label));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="border-t border-subtle bg-white p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => insertShortcut(`${s.icon} ${s.label}`)}
            className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-muted px-2 py-1 text-[11px] text-secondary hover:bg-surface-hover"
          >
            <span>{s.icon}</span>
            {s.label}
          </button>
        ))}
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-full border border-subtle text-muted hover:bg-surface-muted"
        >
          <Smile size={12} />
        </button>
      </div>
      <div className="flex items-end gap-2 rounded-xl border border-strong bg-white p-2">
        <button
          type="button"
          className="rounded-md p-1.5 text-muted hover:bg-surface-muted"
        >
          <Smile size={14} />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted hover:bg-surface-muted"
        >
          <Paperclip size={14} />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-muted hover:bg-surface-muted"
        >
          <Sparkles size={14} />
        </button>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={`Message ${name}…`}
          disabled={disabled}
          className="min-h-[28px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-primary outline-none placeholder:text-muted disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!value.trim() || busy || disabled}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
