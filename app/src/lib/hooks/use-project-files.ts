"use client";
/**
 * useProjectFiles — V1 not yet project-scoped. Wraps the global /api/files
 * endpoint which returns the entire `agents/_shared/files/` directory.
 *
 * Exposes preview + delete helpers so the Files tab doesn't have to know
 * about the API surface directly.
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
  preview_kind: "text" | "markdown" | "image" | "binary";
  modified_at: number;
};

export type UseProjectFiles = {
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  fetchPreview: (name: string) => Promise<FilePreview | null>;
  remove: (name: string) => Promise<boolean>;
  downloadUrl: (name: string) => string;
};

export function useProjectFiles(): UseProjectFiles {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/files`, { cache: "no-store" });
      if (!res.ok) throw new Error(`GET /api/files ${res.status}`);
      const data = (await res.json()) as { files: FileEntry[] };
      if (!mounted.current) return;
      setFiles(Array.isArray(data.files) ? data.files : []);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const fetchPreview = useCallback<UseProjectFiles["fetchPreview"]>(
    async (name) => {
      try {
        const res = await fetch(
          `/api/files/${encodeURIComponent(name)}?preview=1`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`GET preview ${name} ${res.status}`);
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          return (await res.json()) as FilePreview;
        }
        // Non-text/markdown — server returned a binary stream. Caller should
        // use downloadUrl() instead.
        return null;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      }
    },
    [],
  );

  const remove = useCallback<UseProjectFiles["remove"]>(
    async (name) => {
      try {
        const res = await fetch(`/api/files/${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`DELETE ${name} ${res.status}`);
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [refresh],
  );

  const downloadUrl = useCallback<UseProjectFiles["downloadUrl"]>((name) => {
    return `/api/files/${encodeURIComponent(name)}`;
  }, []);

  return { files, loading, error, refresh, fetchPreview, remove, downloadUrl };
}
