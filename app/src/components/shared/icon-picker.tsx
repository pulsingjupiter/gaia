"use client";
/**
 * IconPicker — modal that lets the user pick one of the 10 preset RPG
 * avatars or clear it back to "Initials only" (returns null).
 *
 * Backdrop click and ESC dismiss the modal. The selection animates with a
 * brief pulse before firing `onSelect` so the user gets visual feedback
 * confirming the click.
 */
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
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

const DEFAULT_ACCENT = "#6366f1"; // indigo-500
const SELECTION_DELAY_MS = 200;

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

  // ESC key dismiss.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset pulse whenever the modal closes / re-opens so a stale pulse
  // doesn't carry over between sessions.
  useEffect(() => {
    if (!open) setPulsing(null);
  }, [open]);

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
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
          <h2 className="text-base font-semibold text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-secondary transition hover:bg-surface-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 4 columns x 3 rows = 12 slots; we use 11 (10 avatars + initials) */}
        <div className="grid grid-cols-4 gap-3 p-5">
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
                        // Inline style wins over the `hover:ring-*` class so
                        // selected state shows the accent color even on hover.
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
              currentKey === initialsKey
                ? "ring-2"
                : "hover:ring-tertiary",
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

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-subtle bg-surface-muted px-5 py-3">
          <p className="text-[11px] text-tertiary">
            Powered by{" "}
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
