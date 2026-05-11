"use client";
/**
 * FilesTab — V1 wraps the global /api/files (shared workspace dir).
 *
 * Shows a banner noting it's not yet project-scoped. Each row opens a preview
 * drawer that handles text, markdown (basic rendering), JSON pretty-print,
 * CSV table, and binary fallback (Download).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  File as FileIcon,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/cn";
import {
  useProjectFiles,
  type FileEntry,
  type FilePreview,
} from "@/lib/hooks/use-project-files";
import { formatBytes, relativeTime } from "./format";

function iconForFile(file: FileEntry) {
  if (file.preview_kind === "image") return FileImage;
  if (file.preview_kind === "markdown") return FileText;
  if (file.ext === "json") return FileJson;
  if (["js", "ts", "html", "xml", "yaml", "yml", "toml"].includes(file.ext))
    return FileCode;
  if (file.preview_kind === "text") return FileText;
  return FileIcon;
}

function ownerFromName(name: string): string {
  const m = name.match(/^([a-z0-9-]+)__/i);
  return m ? m[1] : "—";
}

export function FilesTab() {
  const { files, loading, error, refresh, fetchPreview, remove, downloadUrl } =
    useProjectFiles();
  const [openFile, setOpenFile] = useState<FileEntry | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-subtle bg-surface-muted px-3 py-2 text-xs text-secondary">
        Shared workspace files. Project-specific files coming soon.
      </div>

      {error ? (
        <div className="rounded-lg border border-status-error bg-red-50 px-3 py-2 text-xs text-status-error">
          {error}
        </div>
      ) : null}

      <div className="card-surface overflow-hidden">
        {loading && files.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-muted">
            Loading files…
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-muted">
            No files yet. Outputs your agents save to{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
              agents/_shared/files/
            </code>{" "}
            will appear here.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-surface-muted text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Owner</th>
                <th className="px-3 py-2 text-right font-semibold">Size</th>
                <th className="px-3 py-2 text-left font-semibold">Modified</th>
                <th className="w-24 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const Icon = iconForFile(f);
                return (
                  <tr
                    key={f.name}
                    className="border-t border-subtle hover:bg-surface-muted"
                  >
                    <td className="px-3 py-2 align-middle">
                      <Icon size={16} className="text-muted" />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setOpenFile(f)}
                        className="font-medium text-primary hover:text-accent"
                      >
                        {f.name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {ownerFromName(f.name)}
                    </td>
                    <td className="px-3 py-2 text-right text-secondary">
                      {formatBytes(f.size)}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {relativeTime(f.modified_at)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <a
                          href={downloadUrl(f.name)}
                          download
                          className="rounded-md border border-strong bg-white p-1.5 text-secondary hover:bg-surface-muted"
                          aria-label="Download"
                        >
                          <Download size={11} />
                        </a>
                        <button
                          type="button"
                          aria-label="Delete"
                          onClick={async () => {
                            if (
                              typeof window !== "undefined" &&
                              !window.confirm(`Delete '${f.name}'?`)
                            )
                              return;
                            await remove(f.name);
                          }}
                          className="rounded-md border border-strong bg-white p-1.5 text-status-error hover:bg-red-50"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {openFile ? (
        <FilePreviewDrawer
          file={openFile}
          fetchPreview={fetchPreview}
          downloadUrl={downloadUrl(openFile.name)}
          onClose={() => setOpenFile(null)}
          onDelete={async () => {
            const ok = await remove(openFile.name);
            if (ok) setOpenFile(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function FilePreviewDrawer({
  file,
  fetchPreview,
  downloadUrl,
  onClose,
  onDelete,
}: {
  file: FileEntry;
  fetchPreview: (name: string) => Promise<FilePreview | null>;
  downloadUrl: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    if (file.preview_kind === "text" || file.preview_kind === "markdown") {
      void fetchPreview(file.name).then((p) => {
        if (cancelled) return;
        setPreview(p);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [file, fetchPreview]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/30"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-strong bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-primary">
              {file.name}
            </div>
            <div className="text-[11px] text-muted">
              {file.mime_type} • {formatBytes(file.size)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              download
              className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-secondary hover:bg-surface-muted"
            >
              <Download size={11} /> Download
            </a>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md border border-strong bg-white px-2 py-1 text-[11px] font-medium text-status-error hover:bg-red-50"
            >
              <Trash2 size={11} /> Delete
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-surface-muted"
            >
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted">
              Loading preview…
            </div>
          ) : (
            <PreviewContent file={file} preview={preview} />
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewContent({
  file,
  preview,
}: {
  file: FileEntry;
  preview: FilePreview | null;
}) {
  if (file.preview_kind === "image") {
    return (
      <div className="text-center text-xs text-muted">
        Image preview not implemented in V1. Use Download to view.
      </div>
    );
  }

  if (file.preview_kind === "binary") {
    return (
      <div className="rounded-lg border border-dashed border-strong bg-surface-muted p-8 text-center text-xs text-muted">
        Binary file. Download to view.
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="text-xs text-muted">No preview available.</div>
    );
  }

  // CSV / TSV
  if (file.ext === "csv" || file.ext === "tsv") {
    return <CsvTable text={preview.content_text} delimiter={file.ext === "tsv" ? "\t" : ","} />;
  }

  // JSON pretty-print
  if (file.ext === "json") {
    let pretty = preview.content_text;
    try {
      pretty = JSON.stringify(JSON.parse(preview.content_text), null, 2);
    } catch {
      // leave raw
    }
    return (
      <pre className="overflow-auto whitespace-pre rounded-lg bg-surface-muted p-3 font-mono text-[12px] leading-relaxed text-primary">
        {pretty}
      </pre>
    );
  }

  if (file.preview_kind === "markdown") {
    return <Markdown text={preview.content_text} />;
  }

  // Plain text fallback.
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-primary">
      {preview.content_text}
    </pre>
  );
}

function CsvTable({
  text,
  delimiter = ",",
}: {
  text: string;
  delimiter?: string;
}) {
  const rows = useMemo(() => {
    return text
      .split(/\r?\n/)
      .filter((l) => l.length > 0)
      .map((line) => splitCsvLine(line, delimiter));
  }, [text, delimiter]);

  if (rows.length === 0) {
    return <div className="text-xs text-muted">Empty file.</div>;
  }
  const [head, ...body] = rows;
  return (
    <div className="overflow-auto rounded-lg border border-subtle">
      <table className="w-full text-xs">
        <thead className="bg-surface-muted text-[10px] uppercase tracking-wider text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr
              key={i}
              className="border-t border-subtle hover:bg-surface-muted"
            >
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5 text-secondary">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Tiny CSV splitter — handles quoted cells with embedded delimiter.
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        buf += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

/**
 * Tiny markdown renderer — headings, lists, code blocks, paragraphs.
 * Not a full parser; deliberately minimal per Wave brief.
 */
function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <div className="prose prose-sm max-w-none space-y-3 text-primary">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h1":
            return (
              <h1
                key={i}
                className="text-xl font-bold tracking-tight text-primary"
              >
                {b.text}
              </h1>
            );
          case "h2":
            return (
              <h2 key={i} className="text-base font-semibold text-primary">
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="text-sm font-semibold text-primary">
                {b.text}
              </h3>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-auto whitespace-pre rounded-lg bg-surface-muted p-3 font-mono text-[12px] leading-relaxed text-primary"
              >
                {b.text}
              </pre>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc pl-6 text-sm text-secondary">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal pl-6 text-sm text-secondary">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ol>
            );
          case "p":
          default:
            return (
              <p key={i} className="text-sm text-secondary">
                {b.text}
              </p>
            );
        }
      })}
    </div>
  );
}

type MdBlock =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "code"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parseMarkdown(text: string): MdBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }
    let m = /^# +(.+)$/.exec(line);
    if (m) {
      blocks.push({ kind: "h1", text: m[1] });
      i++;
      continue;
    }
    m = /^## +(.+)$/.exec(line);
    if (m) {
      blocks.push({ kind: "h2", text: m[1] });
      i++;
      continue;
    }
    m = /^### +(.+)$/.exec(line);
    if (m) {
      blocks.push({ kind: "h3", text: m[1] });
      i++;
      continue;
    }
    if (/^[-*] +/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] +/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*] +/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\. +/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. +/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. +/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Paragraph: collect contiguous non-empty, non-special lines
    const paraBuf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```|^# |^## |^### |^[-*] |^\d+\. /.test(lines[i])
    ) {
      paraBuf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "p", text: paraBuf.join(" ") });
  }
  return blocks;
}
