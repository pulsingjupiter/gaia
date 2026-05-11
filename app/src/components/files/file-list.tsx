"use client";
/**
 * FileList — dense table view alternative to FileCard grid.
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

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FileList({
  files,
  onOpen,
}: {
  files: FileEntry[];
  onOpen: (name: string) => void;
}) {
  return (
    <div className="card-surface overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead className="bg-surface-muted text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Size</th>
            <th className="px-4 py-2 font-medium">Modified</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {files.map((f) => (
            <tr
              key={f.name}
              onClick={() => onOpen(f.name)}
              className="cursor-pointer hover:bg-surface-muted"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <FileIcon file={f} size={14} />
                  <span className="truncate font-medium text-primary">
                    {f.name}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 uppercase text-secondary">
                {f.ext || "—"}
              </td>
              <td className="px-4 py-2.5 text-secondary">
                {formatSize(f.size)}
              </td>
              <td className="px-4 py-2.5 text-muted">
                {fmtDate(f.modified_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
