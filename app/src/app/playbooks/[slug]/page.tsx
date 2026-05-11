import Link from "next/link";
import {
  Box,
  ChevronRight,
  MoreHorizontal,
  Pencil,
} from "lucide-react";
import { RadialMap } from "@/components/playbooks/radial-map";
import { RADIAL_LEGEND } from "@/components/playbooks/radial-legend";
import { Avatar } from "@/components/ui/avatar";
import { AGENT_COLORS, AGENT_INITIALS, AGENT_NAMES } from "@/lib/constants";

const SKILLS = [
  { label: "System Architecture", pct: 98 },
  { label: "Automation", pct: 95 },
  { label: "AI Orchestration", pct: 93 },
  { label: "Video Engineering", pct: 90 },
  { label: "Data Processing", pct: 88 },
];

const TABS = ["Map View", "List View", "Activity", "Settings"];

export default async function PlaybookDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = AGENT_NAMES[slug] ?? "Professor Adrian";
  const color = AGENT_COLORS[slug] ?? "#5B5BD6";
  const initials = AGENT_INITIALS[slug] ?? "PA";

  return (
    <div className="px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted">
        <Link href="/playbooks" className="hover:text-secondary">
          Playbooks
        </Link>
        <ChevronRight size={12} />
        <span className="text-secondary">{name}</span>
      </div>

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-bold tracking-tight text-primary">
              {name}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D1FAE5] px-2 py-0.5 text-[11px] font-semibold text-[#065F46]">
              <span className="size-1.5 rounded-full bg-status-online" />
              Online
            </span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Founder & Architect • 9 entries • Created May 12, 2024
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border border-strong bg-white p-2 text-muted hover:bg-surface-muted">
            <MoreHorizontal size={14} />
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-white px-3 py-2 text-xs font-semibold text-accent hover:bg-accent-soft">
            <Pencil size={12} />
            Edit Playbook
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex items-center gap-6 border-b border-subtle">
        {TABS.map((t, i) => (
          <button
            key={t}
            className={
              i === 0
                ? "border-b-2 border-accent pb-2 text-sm font-semibold text-accent"
                : "pb-2 text-sm text-secondary hover:text-primary"
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Map */}
        <section className="card-surface flex flex-col items-center p-6 lg:col-span-8">
          <RadialMap centerInitials={initials} centerColor={color} />
          <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2">
            {RADIAL_LEGEND.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5 text-[11px] text-secondary">
                <span
                  className="size-2 rounded-full"
                  style={{ background: l.color }}
                />
                {l.label}
              </div>
            ))}
          </div>
        </section>

        {/* Right rail */}
        <aside className="flex flex-col gap-4 lg:col-span-4">
          {/* About */}
          <div className="card-surface p-4">
            <div className="section-header">About {name}</div>
            <p className="mt-2 text-xs leading-relaxed text-secondary">
              {name} is the architect of the AI workforce. He builds systems, connects tools, and designs scalable automations that power everything.
            </p>
            <dl className="mt-3 space-y-1.5 text-xs">
              <Row k="Role" v="Founder & Architect" />
              <Row k="Status" v="Online" />
              <Row k="Department" v="Core Systems" />
              <Row k="Timezone" v="UTC+8 Singapore" />
              <Row k="Joined" v="May 12, 2024" />
            </dl>
          </div>

          {/* Core Skills */}
          <div className="card-surface p-4">
            <div className="section-header">Core Skills</div>
            <ul className="mt-3 space-y-2.5">
              {SKILLS.map((s) => (
                <li key={s.label}>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-secondary">{s.label}</span>
                    <span className="font-semibold text-primary">{s.pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${s.pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Tools */}
          <div className="card-surface p-4">
            <div className="section-header">Tools & Integrations</div>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div
                  key={i}
                  className="flex aspect-square items-center justify-center rounded-lg border border-subtle bg-surface-muted text-muted"
                >
                  <Box size={16} />
                </div>
              ))}
              <div className="flex aspect-square items-center justify-center rounded-lg border border-subtle bg-surface-muted text-[10px] font-semibold text-secondary">
                +12
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card-surface p-4">
            <div className="section-header">Recent Activity</div>
            <div className="mt-3 flex items-start gap-2">
              <Avatar initials={initials} color={color} size={26} />
              <div className="text-xs">
                <div className="font-semibold text-primary">Updated playbook</div>
                <div className="text-muted">2h ago • video-motion-graphics</div>
              </div>
            </div>
            <button className="mt-3 text-[11px] font-medium text-accent hover:underline">
              View all
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium text-secondary">{v}</dd>
    </div>
  );
}
