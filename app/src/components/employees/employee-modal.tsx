"use client";
import { useEffect, useState } from "react";
import type { Employee, EmployeeStatus } from "@/lib/types";
import { useEmployees } from "./employees-context";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { IconPicker } from "@/components/shared/icon-picker";

const ACCENT_OPTIONS = [
  { name: "Indigo", value: "#5B5BD6" },
  { name: "Pink", value: "#F472B6" },
  { name: "Green", value: "#10B981" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Blue", value: "#3B82F6" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Teal", value: "#14B8A6" },
];

const STATUS_OPTIONS: EmployeeStatus[] = ["Online", "Busy", "Idle"];

export function EmployeeModal({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee?: Employee | null;
}) {
  const { add, update } = useEmployees();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<EmployeeStatus>("Online");
  const [accent, setAccent] = useState(ACCENT_OPTIONS[0].value);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(employee?.name ?? "");
      setRole(employee?.role ?? "");
      setStatus(employee?.status ?? "Online");
      setAccent(employee?.accent ?? ACCENT_OPTIONS[0].value);
      setAvatar(employee?.avatar ?? null);
      setPickerOpen(false);
    }
  }, [open, employee]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (employee) {
      update(employee.id, { name, role, status, accent, avatar });
    } else {
      add({ name, role, status, accent, avatar });
    }
    onOpenChange(false);
  };

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="card-surface w-full max-w-md p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-primary">
          {employee ? "Edit Agent" : "Add Agent"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {employee ? "Update agent details below." : "Add a new AI agent to your workforce."}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-secondary">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. Lyra"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">Avatar</label>
            <div className="mt-1 flex items-center gap-3">
              <AgentAvatar
                value={avatar}
                name={name || "?"}
                size={40}
                accent={accent}
              />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-lg border border-strong bg-white px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-muted"
              >
                Choose…
              </button>
              {avatar ? (
                <button
                  type="button"
                  onClick={() => setAvatar(null)}
                  className="text-[11px] font-medium text-muted hover:underline"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">Role</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. Data Engineer"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
              className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">Accent</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccent(opt.value)}
                  className="size-8 rounded-full border-2 transition"
                  style={{
                    background: opt.value,
                    borderColor: accent === opt.value ? "#111827" : "transparent",
                  }}
                  aria-label={opt.name}
                  title={opt.name}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-strong px-3 py-2 text-sm font-medium text-secondary hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {employee ? "Save changes" : "Add agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
    <IconPicker
      open={pickerOpen}
      current={avatar}
      name={name || "Agent"}
      accent={accent}
      onSelect={(id) => {
        setAvatar(id);
        setPickerOpen(false);
      }}
      onClose={() => setPickerOpen(false)}
      title="Choose an avatar"
    />
    </>
  );
}
