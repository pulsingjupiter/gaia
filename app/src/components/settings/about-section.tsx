"use client";
import { ExternalLink } from "lucide-react";
import { SectionPanel } from "@/components/settings/settings-shell";

export function AboutSection() {
  return (
    <SectionPanel
      title="About Gaia"
      description="The calm cockpit for your AI workforce."
    >
      <div className="space-y-3 text-xs text-secondary">
        <div>
          <span className="font-semibold text-primary">Version</span>{" "}
          <span className="font-mono">0.1.0</span>
        </div>
        <div>
          Built with{" "}
          <a
            href="https://claude.com/claude-code"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
          >
            Claude Code <ExternalLink size={10} />
          </a>
          .
        </div>
        <ul className="flex flex-col gap-1.5 pt-1">
          <li>
            <a
              href="#"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Documentation <ExternalLink size={10} />
            </a>
          </li>
          <li>
            <a
              href="#"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Source <ExternalLink size={10} />
            </a>
          </li>
          <li>
            <a
              href="#"
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              Report an issue <ExternalLink size={10} />
            </a>
          </li>
        </ul>
      </div>
    </SectionPanel>
  );
}
