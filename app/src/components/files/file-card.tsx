"use client";
/**
 * FileCard — grid tile for a single file.
 */
import { FileIcon } from "@/components/files/file-icon";
import type { FileEntry } from "@/lib/hooks/use-shared-files";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function FileCard({
  file,
  onClick,
}: {
  file: FileEntry;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card-surface group flex flex-col gap-3 p-4 text-left transition hover:border-accent hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <FileIcon file={file} size={18} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {file.ext || "—"}
        </span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-primary">
          {file.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
          <span>{formatSize(file.size)}</span>
          <span>·</span>
          <span>{relativeTime(file.modified_at)}</span>
        </div>
      </div>
    </button>
  );
}
