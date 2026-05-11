"use client";
/**
 * DailyChart — raw-SVG bar chart of last 30 days of spend.
 *
 * No charting library: bars are sized linearly to the max day, hover state
 * shows the day + amount in a small tooltip. If every day is zero we render
 * an empty-state card instead. Re-renders on `days` change only.
 */
import { useMemo, useState } from "react";

export type DailyChartPoint = { date: string; cost_usd: number; runs: number };

const WIDTH = 720;
const HEIGHT = 120;
const PADDING_X = 8;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 22;

function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function fmtDate(iso: string): string {
  // iso = YYYY-MM-DD
  const [y, m, d] = iso.split("-").map((s) => Number(s));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function DailyChart({ days }: { days: DailyChartPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const stats = useMemo(() => {
    const max = days.reduce((m, d) => (d.cost_usd > m ? d.cost_usd : m), 0);
    const total = days.reduce((s, d) => s + d.cost_usd, 0);
    return { max, total };
  }, [days]);

  if (days.length === 0 || stats.total === 0) {
    return (
      <div className="card-surface p-6 text-center">
        <div className="section-header text-[10px]">Daily spend (30d)</div>
        <p className="mt-3 text-sm text-secondary">
          No spend recorded in the last 30 days.
        </p>
      </div>
    );
  }

  const innerW = WIDTH - PADDING_X * 2;
  const innerH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const slotW = innerW / days.length;
  const barW = Math.max(2, slotW - 2);

  const hover = hoverIdx !== null ? days[hoverIdx] : null;
  const hoverX =
    hoverIdx !== null ? PADDING_X + slotW * hoverIdx + slotW / 2 : 0;

  return (
    <div className="card-surface p-4">
      <div className="flex items-baseline justify-between">
        <div className="section-header text-[10px]">Daily spend (30d)</div>
        <div className="text-[11px] text-muted">
          Total {fmtCost(stats.total)} · peak {fmtCost(stats.max)}
        </div>
      </div>

      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-[140px] w-full"
          role="img"
          aria-label="Daily spend over the last 30 days"
        >
          {/* Baseline */}
          <line
            x1={PADDING_X}
            x2={WIDTH - PADDING_X}
            y1={HEIGHT - PADDING_BOTTOM}
            y2={HEIGHT - PADDING_BOTTOM}
            stroke="var(--border-subtle)"
            strokeWidth={1}
          />
          {/* Bars */}
          {days.map((d, i) => {
            const ratio = stats.max > 0 ? d.cost_usd / stats.max : 0;
            const h = ratio * innerH;
            const x = PADDING_X + slotW * i + (slotW - barW) / 2;
            const y = HEIGHT - PADDING_BOTTOM - h;
            const active = i === hoverIdx;
            return (
              <g key={d.date}>
                {/* Invisible hit-area covers the full slot height */}
                <rect
                  x={PADDING_X + slotW * i}
                  y={PADDING_TOP}
                  width={slotW}
                  height={HEIGHT - PADDING_TOP - PADDING_BOTTOM}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(1, h)}
                  rx={1.5}
                  fill={active ? "var(--accent-primary)" : "var(--accent-primary-soft)"}
                  stroke={active ? "var(--accent-primary)" : "transparent"}
                  pointerEvents="none"
                />
                {!active && d.cost_usd > 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(1, h)}
                    fill="var(--accent-primary)"
                    fillOpacity={0.55}
                    rx={1.5}
                    pointerEvents="none"
                  />
                ) : null}
              </g>
            );
          })}
          {/* X-axis ticks: first, middle, last */}
          {[0, Math.floor(days.length / 2), days.length - 1]
            .filter((i, idx, arr) => arr.indexOf(i) === idx)
            .map((i) => {
              const d = days[i];
              if (!d) return null;
              const x = PADDING_X + slotW * i + slotW / 2;
              return (
                <text
                  key={`tick-${i}`}
                  x={x}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text-muted)"
                >
                  {fmtDate(d.date)}
                </text>
              );
            })}
          {/* Hover guideline */}
          {hover && hoverIdx !== null ? (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PADDING_TOP}
              y2={HEIGHT - PADDING_BOTTOM}
              stroke="var(--accent-primary)"
              strokeOpacity={0.25}
              strokeDasharray="2 2"
            />
          ) : null}
        </svg>
        {hover ? (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-strong bg-white px-2 py-1 text-[11px] shadow-sm"
            style={{ left: `${(hoverX / WIDTH) * 100}%` }}
          >
            <div className="font-semibold text-primary">
              {fmtDate(hover.date)}
            </div>
            <div className="text-secondary">
              {fmtCost(hover.cost_usd)} · {hover.runs} run
              {hover.runs === 1 ? "" : "s"}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
