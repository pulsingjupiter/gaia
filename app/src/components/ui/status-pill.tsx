import type { EmployeeStatus } from "@/lib/types";

export function StatusDot({ status }: { status: EmployeeStatus | "Running" | "Queued" | "Failed" }) {
  const color =
    status === "Online" || status === "Running"
      ? "var(--status-online)"
      : status === "Busy" || status === "Queued"
        ? "var(--status-busy)"
        : status === "Failed"
          ? "var(--status-error)"
          : "var(--status-idle)";
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ background: color }}
    />
  );
}

export function StatusPill({ status }: { status: EmployeeStatus | "Running" | "Queued" | "Failed" }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
      <StatusDot status={status} />
      {status}
    </span>
  );
}
