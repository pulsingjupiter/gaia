"use client";
/**
 * ThermalWidget — Overview card showing live SoC temperature, usage, and
 * power draw from the local `macmon serve` HTTP endpoint via
 * `useThermal()`. Mirrors the visual weight of <KPICard /> but lays out
 * CPU/GPU rows + footer instead of a single big number.
 */
import { Thermometer } from "lucide-react";

import { useThermal, type ThermalPressure } from "@/lib/hooks/use-thermal";

const PRESSURE_STYLES: Record<ThermalPressure, { bg: string; fg: string; label: string }> = {
  Nominal: { bg: "#D1FAE5", fg: "#047857", label: "Nominal" },
  Moderate: { bg: "#FEF3C7", fg: "#B45309", label: "Moderate" },
  Heavy: { bg: "#FEE2E2", fg: "#B91C1C", label: "Heavy" },
  Unknown: { bg: "#F3F4F6", fg: "#4B5563", label: "Unknown" },
};

function tempColor(c: number): string {
  if (c < 60) return "#047857";
  if (c < 80) return "#B45309";
  return "#B91C1C";
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function UsageBar({ pct, color }: { pct: number; color: string }) {
  const w = clampPct(pct);
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E5E7EB]">
      <div
        className="h-full rounded-full"
        style={{ width: `${w}%`, background: color }}
      />
    </div>
  );
}

function MetricRow({
  label,
  tempC,
  usagePct,
}: {
  label: string;
  tempC: number;
  usagePct: number;
}) {
  const color = tempColor(tempC);
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        className="w-14 text-[18px] font-bold leading-none tabular-nums"
        style={{ color }}
      >
        {Math.round(tempC)}°C
      </div>
      <UsageBar pct={usagePct} color={color} />
      <div className="w-10 text-right text-[11px] font-medium tabular-nums text-secondary">
        {Math.round(usagePct)}%
      </div>
    </div>
  );
}

export function ThermalWidget() {
  const { data } = useThermal();

  if (!data || data.available === false) {
    const reason =
      data && data.available === false
        ? data.reason
        : "Waiting for macmon…";
    return (
      <div className="card-surface flex h-full flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded-xl"
              style={{ background: "#F3F4F6" }}
            >
              <Thermometer size={16} color="#6B7280" />
            </div>
            <div className="min-w-0">
              <div className="section-header">Thermals</div>
              <div className="mt-0.5 truncate text-[13px] font-semibold text-primary">
                —
              </div>
            </div>
          </div>
        </div>
        <div className="text-[11px] leading-relaxed text-muted">
          Install macmon for thermal data:
          <code className="mt-1 block select-all rounded-md border border-subtle bg-[#F9FAFB] px-2 py-1 font-mono text-[10.5px] text-secondary">
            brew install macmon && macmon serve --install
          </code>
          {data && data.available === false ? (
            <div className="mt-1 text-[10px] text-muted">{reason}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const pressure = PRESSURE_STYLES[data.thermal_pressure];

  return (
    <div className="card-surface flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="flex size-8 items-center justify-center rounded-xl"
            style={{ background: "#FEE2E2" }}
          >
            <Thermometer size={16} color="#DC2626" />
          </div>
          <div className="min-w-0">
            <div className="section-header">Thermals</div>
            <div className="mt-0.5 truncate text-[13px] font-semibold text-primary">
              {data.chip_name}
            </div>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: pressure.bg, color: pressure.fg }}
          title={`pmset thermal pressure: ${pressure.label}`}
        >
          {pressure.label}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <MetricRow label="CPU" tempC={data.cpu_temp_c} usagePct={data.cpu_usage_pct} />
        <MetricRow label="GPU" tempC={data.gpu_temp_c} usagePct={data.gpu_usage_pct} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="tabular-nums">{data.power_w.toFixed(1)} W</span>
        <span className="tabular-nums">
          {data.ram_usage_gb.toFixed(1)} / {data.ram_total_gb.toFixed(0)} GB RAM
        </span>
      </div>
    </div>
  );
}
