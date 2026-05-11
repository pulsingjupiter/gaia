"use client";
/**
 * IconPicker — modal that lets the user pick one of the preset RPG avatars,
 * upload a custom image from their Mac, pick a previously-uploaded custom
 * avatar, or clear back to "Initials only" (returns null).
 *
 * Backdrop click and ESC dismiss the modal. The selection animates with a
 * brief pulse before firing `onSelect` so the user gets visual feedback
 * confirming the click.
 *
 * Custom uploads (Feature: custom avatars) — clicking the "Upload from Mac"
 * tile opens a native Finder file-picker via /api/system/pick-file, then
 * POSTs the resulting path to /api/avatars/upload for server-side resize +
 * crop to 256×256 PNG. The result is auto-selected.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, FolderOpen, X } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";
import { PRESET_AVATARS } from "@/lib/avatars";

export interface IconPickerProps {
  open: boolean;
  current?: string | null;
  /** Display name — used for the Initials tile preview. */
  name: string;
  /** Hex/CSS color used for the selected ring + Initials tile bg. */
  accent?: string;
  /** Receives the chosen avatar id, or null when "Initials only" is picked. */
  onSelect: (avatarId: string | null) => void;
  onClose: () => void;
  title?: string;
}

type CustomAvatar = { id: string; src: string; uploaded_at: number };

const DEFAULT_ACCENT = "#6366f1"; // indigo-500
const SELECTION_DELAY_MS = 200;
const UPLOAD_KEY = "__upload__";

function deriveInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function IconPicker({
  open,
  current,
  name,
  accent = DEFAULT_ACCENT,
  onSelect,
  onClose,
  title = "Choose an avatar",
}: IconPickerProps) {
  const [pulsing, setPulsing] = useState<string | null>(null);
  const [customAvatars, setCustomAvatars] = useState<CustomAvatar[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ESC key dismiss.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset transient picker state whenever the modal closes / re-opens.
  useEffect(() => {
    if (!open) {
      setPulsing(null);
      setUploadError(null);
    }
  }, [open]);

  const fetchCustom = useCallback(async () => {
    try {
      const res = await fetch("/api/avatars/custom", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { avatars?: CustomAvatar[] };
      if (Array.isArray(data.avatars)) setCustomAvatars(data.avatars);
    } catch {
      // Non-fatal — picker still works with presets only.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetchCustom();
  }, [open, fetchCustom]);

  if (!open) return null;

  const initials = deriveInitials(name);
  const initialsKey = "__initials__";
  const currentKey = current ?? initialsKey;

  const choose = (id: string | null) => {
    const key = id ?? initialsKey;
    setPulsing(key);
    window.setTimeout(() => {
      onSelect(id);
      setPulsing(null);
    }, SELECTION_DELAY_MS);
  };

  const handleUploadClick = async () => {
    if (uploading) return;
    setUploadError(null);
    setPulsing(UPLOAD_KEY);
    try {
      const pickRes = await fetch("/api/system/pick-file", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "Choose an avatar image",
          of_type: ["public.image"],
        }),
      });
      if (!pickRes.ok) {
        setUploadError(
          "Couldn't open the file picker — try again or pick a preset.",
        );
        return;
      }
      const pickData = (await pickRes.json()) as
        | { cancelled?: boolean }
        | { path?: string };
      if ("cancelled" in pickData && pickData.cancelled) return;
      const sourcePath =
        "path" in pickData && typeof pickData.path === "string"
          ? pickData.path
          : "";
      if (!sourcePath) return;

      setUploading(true);
      const uploadRes = await fetch("/api/avatars/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_path: sourcePath }),
      });
      if (!uploadRes.ok) {
        setUploadError(
          "Couldn't upload that image — try a JPEG or PNG under 10 MB",
        );
        return;
      }
      const uploaded = (await uploadRes.json()) as {
        id?: string;
        src?: string;
      };
      if (!uploaded.id) {
        setUploadError("Upload finished but the server didn't return an id.");
        return;
      }
      await fetchCustom();
      // Auto-select the freshly uploaded avatar.
      onSelect(uploaded.id);
    } catch {
      setUploadError(
        "Couldn't upload that image — try a JPEG or PNG under 10 MB",
      );
    } finally {
      setUploading(false);
      setPulsing(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close avatar picker"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <h2 className="text-base font-semibold text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary transition hover:bg-surface-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Upload tile + preset grid */}
          <div className="grid grid-cols-4 gap-3">
            {/* Upload from Mac — visually distinct dashed-border tile */}
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploading}
              title="Upload an image from your Mac"
              className={cn(
                "group relative col-span-1 flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-white p-1.5 transition hover:border-accent hover:bg-surface-muted/40 disabled:cursor-progress disabled:opacity-70",
                pulsing === UPLOAD_KEY && "scale-95",
              )}
              style={{ borderColor: "var(--border-strong, #e5e7eb)" }}
            >
              <FolderOpen
                className="h-5 w-5 text-secondary group-hover:text-accent"
                strokeWidth={1.5}
              />
              <span className="text-center text-[10px] font-medium leading-tight text-secondary">
                {uploading ? "Uploading…" : "Upload from Mac"}
              </span>
            </button>

            {PRESET_AVATARS.map((avatar) => {
              const selected = currentKey === avatar.id;
              const pulsingThis = pulsing === avatar.id;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => choose(avatar.id)}
                  title={`${avatar.name}${avatar.description ? ` — ${avatar.description}` : ""}`}
                  className={cn(
                    "group relative flex h-20 w-full items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-subtle transition hover:ring-2",
                    selected ? "ring-2" : "hover:ring-tertiary",
                    pulsingThis && "scale-95",
                  )}
                  style={
                    selected
                      ? ({
                          boxShadow: `0 0 0 2px ${accent}`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <Image
                    src={avatar.src}
                    alt={avatar.name}
                    width={64}
                    height={64}
                    unoptimized
                    className="h-full w-full rounded-lg object-cover"
                  />
                  {selected && (
                    <span
                      className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: accent }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}

            {/* Initials / "no avatar" tile */}
            <button
              type="button"
              onClick={() => choose(null)}
              title="Initials only — no avatar"
              className={cn(
                "group relative flex h-20 w-full flex-col items-center justify-center gap-1 rounded-xl bg-white p-1.5 ring-1 ring-subtle transition hover:ring-2",
                currentKey === initialsKey ? "ring-2" : "hover:ring-tertiary",
                pulsing === initialsKey && "scale-95",
              )}
              style={
                currentKey === initialsKey
                  ? ({ boxShadow: `0 0 0 2px ${accent}` } as React.CSSProperties)
                  : undefined
              }
            >
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: accent }}
              >
                {initials}
              </span>
              <span className="text-[10px] font-medium text-secondary">
                No avatar
              </span>
              {currentKey === initialsKey && (
                <span
                  className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: accent }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
            </button>
          </div>

          {uploadError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {uploadError}
            </div>
          ) : null}

          {customAvatars.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
                Your uploads
              </h3>
              <div className="grid grid-cols-4 gap-3">
                {customAvatars.map((avatar) => {
                  const selected = currentKey === avatar.id;
                  const pulsingThis = pulsing === avatar.id;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => choose(avatar.id)}
                      title="Your upload"
                      className={cn(
                        "group relative flex h-20 w-full items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-subtle transition hover:ring-2",
                        selected ? "ring-2" : "hover:ring-tertiary",
                        pulsingThis && "scale-95",
                      )}
                      style={
                        selected
                          ? ({
                              boxShadow: `0 0 0 2px ${accent}`,
                            } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <Image
                        src={avatar.src}
                        alt="Custom avatar"
                        width={64}
                        height={64}
                        unoptimized
                        className="h-full w-full rounded-lg object-cover"
                      />
                      {selected && (
                        <span
                          className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: accent }}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-subtle bg-surface-muted px-5 py-3">
          <p className="text-[11px] text-tertiary">
            Presets by{" "}
            <a
              href="https://www.dicebear.com"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              DiceBear
            </a>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-secondary transition hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
