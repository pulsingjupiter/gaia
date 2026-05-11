"use client";
/**
 * useSharedFiles — list, preview and delete files from the shared bucket.
 *
 * Wave 2D — feeds the Files page.
 *
 * Polls /api/files every 30s. `preview(name)` lazy-fetches the file's text
 * content (markdown/text/json/csv) via /api/files/[name]?preview=1. `remove`
 * issues a DELETE and refreshes the list optimistically.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type FileEntry = {
  name: string;
  size: number;
  modified_at: number;
  mime_type: string;
  ext: string;
  preview_kind: "text" | "markdown" | "image" | "binary";
};

export type FilePreview = {
  name: string;
  content_text: string;
  mime_type: string;
  size: number;
  preview_kind: FileEntry["preview_kind"];
  modified_at: number;
};

export type UploadResult =
  | { ok: true; file: FileEntry }
  | { ok: false; error: string };

export type UseSharedFiles = {
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  remove: (name: string) => Promise<boolean>;
  preview: (name: string) => Promise<FilePreview | null>;
  upload: (file: File) => Promise<UploadResult>;
};

const POLL_MS = 30_000;

export function useSharedFiles(): UseSharedFiles {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/files", { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/files ${res.status}`);
      const data = (await res.json()) as { files?: FileEntry[] };
      if (cancelled.current) return;
      setFiles(data.files ?? []);
      setError(null);
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled.current = true;
      clearInterval(id);
    };
  }, [refresh]);

  const remove = useCallback<UseSharedFiles["remove"]>(
    async (name) => {
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`DELETE /api/files/${name} ${res.status}`);
        // Optimistic remove + background refresh.
        setFiles((prev) => prev.filter((f) => f.name !== name));
        void refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [refresh],
  );

  const upload = useCallback<UseSharedFiles["upload"]>(
    async (file) => {
      try {
        const fd = new FormData();
        fd.append("file", file, file.name);
        const res = await fetch("/api/files", { method: "POST", body: fd });
        const data = (await res
          .json()
          .catch(() => ({}))) as { ok?: boolean; file?: FileEntry; error?: string };
        if (!res.ok || !data.ok || !data.file) {
          const msg = data.error ?? `POST /api/files ${res.status}`;
          setError(msg);
          return { ok: false, error: msg };
        }
        // Refresh the list so size/mtime stay consistent with the disk read.
        void refresh();
        return { ok: true, file: data.file };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [refresh],
  );

  const preview = useCallback<UseSharedFiles["preview"]>(async (name) => {
    try {
      const res = await fetch(
        `/api/files/${encodeURIComponent(name)}?preview=1`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error(`GET /api/files/${name} ${res.status}`);
      }
      const data = (await res.json()) as FilePreview;
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  return { files, loading, error, refresh, remove, preview, upload };
}
