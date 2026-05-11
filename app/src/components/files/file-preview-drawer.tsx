"use client";
/**
 * FilePreviewDrawer — right-side drawer that renders the file's content.
 *
 * Markdown / text → simple inline renderer (no third-party lib). JSON →
 * pretty-printed in <pre>. CSV → quoted-aware client-side parser to a
 * <table>. Image / binary → friendly placeholder + Download button.
 */
import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Trash2,
  X,
  Image as ImageIcon,
  FileWarning,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { FileEntry, FilePreview } from "@/lib/hooks/use-shared-files";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function FilePreviewDrawer({
  file,
  open,
  onClose,
  loadPreview,
  onDelete,
}: {
  file: FileEntry | null;
  open: boolean;
  onClose: () => void;
  loadPreview: (name: string) => Promise<FilePreview | null>;
  onDelete: (name: string) => Promise<boolean>;
}) {
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setPreview(null);
    setConfirmDelete(false);
    if (!open || !file) return;
    if (file.preview_kind !== "markdown" && file.preview_kind !== "text") {
      // No JSON preview endpoint for binary/image — render placeholder.
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const p = await loadPreview(file.name);
      if (!cancelled) {
        setPreview(p);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, open, loadPreview]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        "pointer-events-none fixed inset-0 z-40 transition",
        open ? "pointer-events-auto" : "",
      )}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/10 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
        aria-label="Close drawer"
      />
      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-[600px] flex-col border-l border-subtle bg-white shadow-xl transition-transform",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-primary">
              {file?.name ?? "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              {file ? `${formatSize(file.size)} · ${file.mime_type}` : "—"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-subtle bg-white text-secondary hover:bg-surface-muted hover:text-primary"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action bar */}
        {file ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-surface-muted px-5 py-2">
            {preview?.content_text != null ? (
              <CopyButton text={preview.content_text} />
            ) : null}
            <a
              href={`/api/files/${encodeURIComponent(file.name)}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-white px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-hover"
            >
              <Download size={12} />
              Download
            </a>
            {confirmDelete ? (
              <span className="ml-auto inline-flex items-center gap-1.5">
                <span className="text-[11px] text-secondary">
                  Delete file?
                </span>
                <button
                  onClick={async () => {
                    const ok = await onDelete(file.name);
                    if (ok) onClose();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-status-error px-2 py-1 text-[11px] font-semibold text-white"
                >
                  <Trash2 size={12} /> Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-subtle bg-white px-2 py-1 text-[11px] text-secondary"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-subtle bg-white px-2.5 py-1 text-[11px] font-medium text-status-error hover:bg-surface-hover"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 scroll-thin">
          {!file ? (
            <div className="text-xs text-muted">
              Select a file to preview.
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="animate-spin" size={14} /> Loading preview…
            </div>
          ) : (
            <PreviewBody file={file} preview={preview} />
          )}
        </div>
      </aside>
    </div>
  );
}

function PreviewBody({
  file,
  preview,
}: {
  file: FileEntry;
  preview: FilePreview | null;
}) {
  if (file.preview_kind === "image") {
    return (
      <Placeholder
        icon={ImageIcon}
        title="Image preview not available"
        body="Use Download to view the image locally."
      />
    );
  }
  if (file.preview_kind === "binary") {
    return (
      <Placeholder
        icon={FileWarning}
        title="Preview not available"
        body="This file looks binary. Use Download to inspect it."
      />
    );
  }
  if (!preview) {
    return (
      <div className="text-xs text-muted">
        Could not load preview.
      </div>
    );
  }
  if (file.ext === "json") {
    return <JsonPreview text={preview.content_text} />;
  }
  if (file.ext === "csv" || file.ext === "tsv") {
    return (
      <CsvPreview text={preview.content_text} delim={file.ext === "tsv" ? "\t" : ","} />
    );
  }
  if (file.preview_kind === "markdown") {
    return <MarkdownPreview text={preview.content_text} />;
  }
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-primary">
      {preview.content_text}
    </pre>
  );
}

function Placeholder({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ImageIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-subtle bg-surface-muted py-12 text-center">
      <Icon size={28} className="text-muted" />
      <div>
        <div className="text-sm font-semibold text-primary">
          {title}
        </div>
        <p className="mt-1 max-w-sm text-xs text-secondary">
          {body}
        </p>
      </div>
    </div>
  );
}

function JsonPreview({ text }: { text: string }) {
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // keep raw
  }
  return (
    <pre className="overflow-auto rounded-lg border border-subtle bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-primary scroll-thin">
      {pretty}
    </pre>
  );
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function CsvPreview({ text, delim }: { text: string; delim: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return (
      <div className="text-xs text-muted">Empty file.</div>
    );
  }
  const rows = lines.slice(0, 200).map((l) => parseCsvLine(l, delim));
  const header = rows[0];
  const body = rows.slice(1);
  return (
    <div className="overflow-auto rounded-lg border border-subtle scroll-thin">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-surface-muted text-muted">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="px-3 py-1.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr
              key={ri}
              className="border-t border-subtle odd:bg-white even:bg-surface-muted/40"
            >
              {r.map((c, ci) => (
                <td key={ci} className="px-3 py-1.5 align-top text-secondary">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {lines.length > 200 ? (
        <div className="border-t border-subtle bg-surface-muted px-3 py-1.5 text-[10px] text-muted">
          Showing first 200 rows of {lines.length}.
        </div>
      ) : null}
    </div>
  );
}

// ---- Markdown ----
//
// Minimal renderer — no library. We split fenced ``` blocks first, then for
// the remaining prose handle: H1/H2/H3, lists (ul/ol), blockquotes, and
// paragraphs. Inline backticks become <code> spans. Links and bold are kept
// as plain text since we want no third-party lib but still readable output.

type MdBlock =
  | { kind: "code"; lang: string; text: string }
  | { kind: "prose"; text: string };

function splitFencedBlocks(text: string): MdBlock[] {
  const out: MdBlock[] = [];
  const re = /```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      out.push({ kind: "prose", text: text.slice(last, m.index) });
    }
    out.push({ kind: "code", lang: m[1] ?? "", text: m[2] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ kind: "prose", text: text.slice(last) });
  }
  return out;
}

function renderInline(text: string, key: string): React.ReactNode {
  // Replace inline `code` with <code> spans.
  const parts: React.ReactNode[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <code
        key={`${key}-c-${i++}`}
        className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px] text-primary"
      >
        {m[1]}
      </code>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderProse(text: string, blockIdx: number): React.ReactNode {
  const lines = text.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let buffer: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let key = 0;

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    out.push(
      <p
        key={`b-${blockIdx}-${key++}`}
        className="text-sm leading-relaxed text-primary"
      >
        {renderInline(buffer.join(" "), `b-${blockIdx}-${key}`)}
      </p>,
    );
    buffer = [];
  };
  const flushList = () => {
    if (!listKind || listItems.length === 0) return;
    const Tag = listKind;
    out.push(
      <Tag
        key={`l-${blockIdx}-${key++}`}
        className={`pl-5 text-sm text-primary ${listKind === "ul" ? "list-disc" : "list-decimal"} space-y-1`}
      >
        {listItems.map((li, i) => (
          <li key={i}>{renderInline(li, `li-${blockIdx}-${key}-${i}`)}</li>
        ))}
      </Tag>,
    );
    listKind = null;
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) {
      flushBuffer();
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushBuffer();
      flushList();
      const level = h[1].length;
      const cls =
        level === 1
          ? "text-lg font-bold text-primary mt-3"
          : level === 2
            ? "text-base font-bold text-primary mt-3"
            : "text-sm font-bold text-primary mt-2";
      out.push(
        <div key={`h-${blockIdx}-${key++}`} className={cls}>
          {renderInline(h[2], `h-${blockIdx}-${key}`)}
        </div>,
      );
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ul) {
      flushBuffer();
      if (listKind && listKind !== "ul") flushList();
      listKind = "ul";
      listItems.push(ul[1]);
      continue;
    }
    if (ol) {
      flushBuffer();
      if (listKind && listKind !== "ol") flushList();
      listKind = "ol";
      listItems.push(ol[1]);
      continue;
    }
    if (line.startsWith("> ")) {
      flushBuffer();
      flushList();
      out.push(
        <blockquote
          key={`q-${blockIdx}-${key++}`}
          className="border-l-2 border-strong pl-3 text-sm italic text-secondary"
        >
          {renderInline(line.slice(2), `q-${blockIdx}-${key}`)}
        </blockquote>,
      );
      continue;
    }
    buffer.push(line);
  }
  flushBuffer();
  flushList();
  return out;
}

function MarkdownPreview({ text }: { text: string }) {
  const blocks = splitFencedBlocks(text);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => {
        if (b.kind === "code") {
          return (
            <pre
              key={i}
              className="overflow-auto rounded-lg border border-subtle bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-primary scroll-thin"
            >
              {b.text}
            </pre>
          );
        }
        return (
          <div key={i} className="flex flex-col gap-2">
            {renderProse(b.text, i)}
          </div>
        );
      })}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-white px-2.5 py-1 text-[11px] font-medium text-secondary hover:bg-surface-hover"
    >
      {copied ? (
        <>
          <Check size={12} /> Copied
        </>
      ) : (
        <>
          <Copy size={12} /> Copy contents
        </>
      )}
    </button>
  );
}
