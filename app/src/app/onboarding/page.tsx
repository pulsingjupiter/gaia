"use client";
/**
 * Test-instance onboarding wizard. Four steps, fully client-side state.
 *
 *   1. Welcome      — hero + "Get started" / "Skip"
 *   2. Persona      — pick from 5 prebuilt personas + 1 "Custom"
 *   3. Project      — name + optional description
 *   4. Done         — confirmation card + 3s auto-redirect
 *
 * On step 3 → 4 the wizard POSTs /api/onboarding which creates the employee
 * (with persona-seeded CLAUDE.md), scaffolds agents-test/<id>/, and creates
 * the first project. Errors surface inline on step 3 so the user can retry.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { GaiaLogo } from "@/components/shell/gaia-logo";
import { AgentAvatar } from "@/components/shared/agent-avatar";
import { cn } from "@/lib/cn";

type PersonaId =
  | "king-henry"
  | "atlas"
  | "nova"
  | "rack"
  | "gaia"
  | "custom";

type Persona = {
  id: PersonaId;
  name: string;
  role: string;
  tagline: string;
  avatar: string | null;
  accent: string;
};

const PERSONAS: Persona[] = [
  {
    id: "king-henry",
    name: "King Henry",
    role: "Chief of Staff",
    tagline: "Decides, prioritises, unblocks.",
    avatar: "paladin",
    accent: "#F59E0B",
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Planner",
    tagline: "Long-range planning & decomposition.",
    avatar: "wizard",
    accent: "#10B981",
  },
  {
    id: "nova",
    name: "Nova",
    role: "Writer",
    tagline: "Copy, comms, and marketing.",
    avatar: "bard",
    accent: "#F472B6",
  },
  {
    id: "rack",
    name: "Rack",
    role: "Operator",
    tagline: "Files, schedules, ops.",
    avatar: "monk",
    accent: "#3B82F6",
  },
  {
    id: "gaia",
    name: "Gaia",
    role: "Meta-Agent & Architect",
    tagline: "Briefs, architecture, deep-dives.",
    avatar: "sorcerer",
    accent: "#5B5BD6",
  },
  {
    id: "custom",
    name: "Custom",
    role: "Build from scratch",
    tagline: "Define your own persona.",
    avatar: "knight",
    accent: "#6B7280",
  },
];

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage(): React.ReactNode {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [customName, setCustomName] = useState("");
  const [customRole, setCustomRole] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] = useState<{
    persona: string;
    project: string;
  } | null>(null);

  const selectedPersona = useMemo(
    () => PERSONAS.find((p) => p.id === persona) ?? null,
    [persona],
  );

  // Step 4: 3s countdown + auto-redirect to dashboard.
  useEffect(() => {
    if (step !== 4) return;
    const t = window.setTimeout(() => {
      router.push("/");
    }, 3000);
    return () => window.clearTimeout(t);
  }, [step, router]);

  async function skip(): Promise<void> {
    try {
      await fetch("/api/onboarding/skip", { method: "POST" });
    } catch {
      // best-effort — even if the server call fails, navigate so the user
      // isn't trapped. They'll bounce back here on next request, which is
      // acceptable.
    }
    router.push("/");
  }

  async function submit(): Promise<void> {
    if (submitting) return;
    if (!persona) return;
    if (!projectName.trim()) return;
    if (persona === "custom" && !customName.trim()) {
      setError("Custom agent needs a name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona,
          custom:
            persona === "custom"
              ? { name: customName.trim(), role: customRole.trim() }
              : undefined,
          project: {
            name: projectName.trim(),
            description: projectDesc.trim() || undefined,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const personaLabel =
        persona === "custom" ? customName.trim() : selectedPersona?.name ?? "Agent";
      setCreatedSummary({
        persona: personaLabel,
        project: projectName.trim(),
      });
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-page px-6 py-10">
      <div className="card-surface w-full max-w-3xl p-8 shadow-sm sm:p-10">
        {/* Header strip — logo + step indicator */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GaiaLogo size={26} />
            <span className="text-sm font-semibold text-primary">Gaia</span>
            <span className="ml-2 rounded-full border border-strong bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              Test instance
            </span>
          </div>
          <StepDots step={step} />
        </div>

        {step === 1 && <WelcomeStep onContinue={() => setStep(2)} onSkip={skip} />}
        {step === 2 && (
          <PersonaStep
            persona={persona}
            onPick={setPersona}
            customName={customName}
            customRole={customRole}
            onCustomName={setCustomName}
            onCustomRole={setCustomRole}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <ProjectStep
            projectName={projectName}
            projectDesc={projectDesc}
            onProjectName={setProjectName}
            onProjectDesc={setProjectDesc}
            onBack={() => setStep(2)}
            onContinue={submit}
            submitting={submitting}
            error={error}
          />
        )}
        {step === 4 && createdSummary && (
          <DoneStep
            personaName={createdSummary.persona}
            projectName={createdSummary.project}
            onGoNow={() => router.push("/")}
          />
        )}
      </div>
    </div>
  );
}

function StepDots({ step }: { step: Step }): React.ReactNode {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all",
            i === step ? "w-6 bg-accent" : "w-2 bg-strong/60",
          )}
        />
      ))}
    </div>
  );
}

function WelcomeStep({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-accent-soft">
        <GaiaLogo size={40} />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-primary">
        Welcome to Gaia
      </h1>
      <p className="mt-2 max-w-md text-sm text-secondary">
        Let&apos;s set up your first agent.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mt-8 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        Get started
        <ArrowRight size={14} />
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="mt-3 text-[11px] font-medium text-muted hover:text-secondary hover:underline"
      >
        Skip — explore on my own
      </button>
    </div>
  );
}

function PersonaStep({
  persona,
  onPick,
  customName,
  customRole,
  onCustomName,
  onCustomRole,
  onBack,
  onContinue,
}: {
  persona: PersonaId | null;
  onPick: (id: PersonaId) => void;
  customName: string;
  customRole: string;
  onCustomName: (v: string) => void;
  onCustomRole: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
}): React.ReactNode {
  const canContinue =
    persona !== null && (persona !== "custom" || customName.trim().length > 0);
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-primary">
        Pick a persona
      </h2>
      <p className="mt-1 text-sm text-secondary">
        Each persona ships with a CLAUDE.md that shapes how they behave. You can
        edit it later.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PERSONAS.map((p) => {
          const on = persona === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              className={cn(
                "flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition",
                on
                  ? "border-accent bg-accent-soft ring-2 ring-accent/30"
                  : "border-strong bg-white hover:border-accent/40 hover:bg-surface-muted",
              )}
            >
              <div className="flex w-full items-center gap-3">
                <AgentAvatar
                  value={p.avatar}
                  name={p.name}
                  size={36}
                  accent={p.accent}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-primary">
                    {p.name}
                  </div>
                  <div className="truncate text-[11px] text-muted">{p.role}</div>
                </div>
                {on ? (
                  <CheckCircle2
                    size={16}
                    className="ml-auto shrink-0 text-accent"
                  />
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-secondary">
                {p.tagline}
              </p>
            </button>
          );
        })}
      </div>

      {persona === "custom" ? (
        <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-strong bg-surface-muted p-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-secondary">
              Agent name
            </label>
            <input
              value={customName}
              onChange={(e) => onCustomName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. Lyra"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-secondary">
              Role (optional)
            </label>
            <input
              value={customRole}
              onChange={(e) => onCustomRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="e.g. Data analyst"
            />
          </div>
        </div>
      ) : null}

      <div className="mt-7 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted"
        >
          <ArrowLeft size={12} />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

function ProjectStep({
  projectName,
  projectDesc,
  onProjectName,
  onProjectDesc,
  onBack,
  onContinue,
  submitting,
  error,
}: {
  projectName: string;
  projectDesc: string;
  onProjectName: (v: string) => void;
  onProjectDesc: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
  submitting: boolean;
  error: string | null;
}): React.ReactNode {
  const canContinue = projectName.trim().length > 0 && !submitting;
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-primary">
        Name your first project
      </h2>
      <p className="mt-1 text-sm text-secondary">
        Projects group runs and conversations so your agent has context.
      </p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-secondary">
            Project name
          </label>
          <input
            value={projectName}
            onChange={(e) => onProjectName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
            placeholder="My first project"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">
            Description (optional)
          </label>
          <input
            value={projectDesc}
            onChange={(e) => onProjectDesc(e.target.value)}
            className="mt-1 w-full rounded-lg border border-strong bg-white px-3 py-2.5 text-sm outline-none focus:border-accent"
            placeholder="One-line summary"
          />
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]">
          {error}
        </div>
      ) : null}

      <div className="mt-7 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-strong bg-white px-3 py-2 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
        >
          <ArrowLeft size={12} />
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Creating…
            </>
          ) : (
            <>
              Continue
              <ArrowRight size={12} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function DoneStep({
  personaName,
  projectName,
  onGoNow,
}: {
  personaName: string;
  projectName: string;
  onGoNow: () => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Sparkles size={28} />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-primary">
        You&apos;re all set!
      </h2>
      <p className="mt-1 text-sm text-secondary">
        Redirecting you to the dashboard in a moment.
      </p>

      <div className="mt-6 w-full max-w-sm rounded-xl border border-strong bg-surface-muted px-4 py-3 text-left">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Created
        </div>
        <div className="mt-1 text-sm font-semibold text-primary">
          {personaName}
          <span className="text-secondary"> + </span>
          {projectName}
        </div>
      </div>

      <button
        type="button"
        onClick={onGoNow}
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
      >
        Go to dashboard
        <ArrowRight size={12} />
      </button>
    </div>
  );
}
