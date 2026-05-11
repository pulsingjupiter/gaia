"use client";
/**
 * Files — shared workspace bucket (agents/_shared/files/).
 *
 * Header → toolbar (search, sort, view toggle, upload) → grid|list → drawer.
 */
import { useMemo, useRef, useState } from "react";
import { LayoutGrid, List, Loader2, Search, Upload } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { FileCard } from "@/components/files/file-card";
import { FileList } from "@/components/files/file-list";
import { FilePreviewDrawer } from "@/components/files/file-preview-drawer";
import { useSharedFiles, type FileEntry } from "@/lib/hooks/use-shared-files";
import { cn } from "@/lib/cn";

type SortKey = "newest" | "largest" | "name";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "largest", label: "Largest" },
  { id: "name", label: "Name" },
];

export default function FilesPage() {
  const { files, loading, refresh, remove, preview, upload } = useSharedFiles();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openName, setOpenName] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFiles(list: FileList | null): Promise<void> {
    if (!list || list.length === 0) return;
    setUploadBusy(true);
    setUploadMsg(null);
    let okCount = 0;
    let firstError: string | null = null;
    for (const f of Array.from(list)) {
      const r = await upload(f);
      if (r.ok) okCount += 1;
      else if (firstError === null) firstError = r.error;
    }
    setUploadBusy(false);
    if (firstError && okCount === 0) {
      setUploadMsg({ tone: "err", text: firstError });
    } else if (firstError) {
      setUploadMsg({
        tone: "err",
        text: `Uploaded ${okCount}; ${firstError}`,
      });
    } else {
      setUploadMsg({
        tone: "ok",
        text: `Uploaded ${okCount} file${okCount === 1 ? "" : "s"}`,
      });
    }
    window.setTimeout(() => setUploadMsg(null), 4000);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = files;
    if (q) arr = arr.filter((f) => f.name.toLowerCase().includes(q));
    arr = [...arr];
    if (sort === "newest") arr.sort((a, b) => b.modified_at - a.modified_at);
    else if (sort === "largest") arr.sort((a, b) => b.size - a.size);
    else arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [files, search, sort]);

  const openFile: FileEntry | null = useMemo(
    () => files.find((f) => f.name === openName) ?? null,
    [files, openName],
  );

  return (
    <div className="px-6 py-6">
      <PageHeader
        title="Files"
        subtitle="Shared workspace for agent outputs."
        right={
          <div className="flex items-center gap-2">
            {uploadMsg ? (
              <span
                className={cn(
                  "text-[11px] font-medium",
                  uploadMsg.tone === "ok"
                    ? "text-status-success"
                    : "text-status-error",
                )}
              >
                {uploadMsg.text}
              </span>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                // Reset so re-selecting the same file fires onChange again.
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploadBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploadBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {uploadBusy ? "Uploading…" : "Upload"}
            </button>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full rounded-lg border border-strong bg-white py-1.5 pl-8 pr-3 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-lg border border-strong bg-white p-0.5">
          {SORTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSort(s.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                sort === s.id
                  ? "bg-accent-soft text-accent"
                  : "text-secondary hover:bg-surface-muted",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="ml-auto inline-flex items-center gap-0.5 rounded-lg border border-strong bg-white p-0.5">
          <button
            onClick={() => setView("grid")}
            className={cn(
              "rounded-md p-1.5",
              view === "grid"
                ? "bg-accent-soft text-accent"
                : "text-secondary hover:bg-surface-muted",
            )}
            aria-label="Grid view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "rounded-md p-1.5",
              view === "list"
                ? "bg-accent-soft text-accent"
                : "text-secondary hover:bg-surface-muted",
            )}
            aria-label="List view"
          >
            <List size={14} />
          </button>
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded-lg border border-strong bg-white px-2.5 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      {loading && files.length === 0 ? (
        <div className="card-surface flex items-center justify-center py-16 text-xs text-muted">
          Loading files…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="text-sm font-semibold text-primary">
            {search ? "No files match your search" : "No files yet"}
          </div>
          <p className="max-w-sm text-xs text-secondary">
            {search
              ? "Try a different search term."
              : "Files agents create or you upload will appear here."}
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((f) => (
            <FileCard
              key={f.name}
              file={f}
              onClick={() => setOpenName(f.name)}
            />
          ))}
        </div>
      ) : (
        <FileList files={filtered} onOpen={(n) => setOpenName(n)} />
      )}

      <FilePreviewDrawer
        file={openFile}
        open={!!openFile}
        onClose={() => setOpenName(null)}
        loadPreview={preview}
        onDelete={remove}
      />
    </div>
  );
}
