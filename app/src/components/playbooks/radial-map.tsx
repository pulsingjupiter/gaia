"use client";
import {
  Activity,
  Camera,
  Film,
  Layers,
  Palette,
  Search,
  Sparkles,
  Type,
  Video,
  Zap,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

const NODES = [
  { id: "build-tiktok-video", label: "Video Creation", color: "#F472B6", icon: Video },
  { id: "carousel-glitch-brand", label: "Branding", color: "#F59E0B", icon: Palette },
  { id: "carousel-text-post", label: "Content", color: "#10B981", icon: Type },
  { id: "fast-render", label: "Rendering", color: "#8B5CF6", icon: Zap },
  { id: "ffmpeg-grep", label: "Video Processing", color: "#3B82F6", icon: Film },
  { id: "infographic-mvp", label: "Design", color: "#14B8A6", icon: Layers },
  { id: "media-gen", label: "Media Generation", color: "#EC4899", icon: Camera },
  { id: "research-tool", label: "Research", color: "#7C3AED", icon: Search },
  { id: "script", label: "Scripting", color: "#F59E0B", icon: Sparkles },
  { id: "trending", label: "Trend Analysis", color: "#34D399", icon: Activity },
];

export function RadialMap({
  centerInitials,
  centerColor,
}: {
  centerInitials: string;
  centerColor: string;
}) {
  const SIZE = 540;
  const CENTER = SIZE / 2;
  const RADIUS = 210;

  return (
    <div className="relative w-full" style={{ aspectRatio: "1 / 1", maxWidth: SIZE }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        height="100%"
        className="overflow-visible"
      >
        {/* glow */}
        <defs>
          <radialGradient id="glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#EEEAFD" stopOpacity="1" />
            <stop offset="100%" stopColor="#EEEAFD" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={140} fill="url(#glow)" />

        {/* connectors */}
        {NODES.map((node, i) => {
          const angle = (i * 36 - 90) * (Math.PI / 180);
          const x = CENTER + RADIUS * Math.cos(angle);
          const y = CENTER + RADIUS * Math.sin(angle);
          const cx1 = CENTER + (RADIUS / 2) * Math.cos(angle);
          const cy1 = CENTER + (RADIUS / 2) * Math.sin(angle);
          return (
            <path
              key={`line-${node.id}`}
              d={`M ${CENTER} ${CENTER} Q ${cx1} ${cy1} ${x} ${y}`}
              stroke={node.color}
              strokeWidth={1.2}
              fill="none"
              opacity={0.45}
            />
          );
        })}
      </svg>

      {/* center avatar */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <Avatar initials={centerInitials} color={centerColor} size={92} />
      </div>

      {/* nodes */}
      {NODES.map((node, i) => {
        const angle = (i * 36 - 90) * (Math.PI / 180);
        const x = 50 + ((RADIUS / SIZE) * 100) * Math.cos(angle);
        const y = 50 + ((RADIUS / SIZE) * 100) * Math.sin(angle);
        const Icon = node.icon;
        return (
          <div
            key={node.id}
            className="absolute"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
              width: 110,
            }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="flex size-12 items-center justify-center rounded-full bg-white"
                style={{
                  border: `1.5px solid ${node.color}`,
                  color: node.color,
                  boxShadow: "0 4px 12px rgba(17,24,39,0.06)",
                }}
              >
                <Icon size={20} />
              </div>
              <div className="mt-1 text-[10px] font-bold text-primary">
                {node.id}
              </div>
              <div className="text-[9px] text-muted">
                {node.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

