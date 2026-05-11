/**
 * POST /api/approvals/test  → { approval: ApprovalRow } 201
 *
 * Creates a synthetic pending approval picked from a small set of canned
 * examples. Used by the "Test approval" button in Settings → Data so users
 * can see the autonomy loop end-to-end without wiring up a real agent run.
 */
import { insertApproval, listEmployees } from "@/server/db.ts";
import { ensureSeeded } from "@/server/seed.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Sample = {
  action_type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

const SAMPLES: Sample[] = [
  {
    action_type: "send_email",
    title: "Send draft email to mom@example.com",
    body: "Subject: Lunch tomorrow\n\nHey Mom — wanted to confirm 12pm at the usual spot. Let me know if that still works.",
    payload: {
      recipient: "mom@example.com",
      subject: "Lunch tomorrow",
      body: "Hey Mom — wanted to confirm 12pm at the usual spot. Let me know if that still works.",
    },
  },
  {
    action_type: "post_content",
    title: "Publish draft tweet about Gaia launch",
    body: "Just shipped Gaia v0.1 — your AI workforce, in one inbox. Approvals, autonomy, and an inbox that finally feels human. https://gaia.example",
    payload: {
      platform: "twitter",
      text: "Just shipped Gaia v0.1 — your AI workforce, in one inbox.",
    },
  },
  {
    action_type: "deploy",
    title: "Deploy redpulse-test to Cloud Run",
    body: "About to ship 3 commits to redpulse-test in asia-southeast1. No schema migrations. Estimated downtime: <30s.",
    payload: {
      service: "redpulse-test",
      region: "asia-southeast1",
      commits: 3,
    },
  },
  {
    action_type: "custom",
    title: "Approve generated cover image",
    body: "Generated a hero image for the homepage refresh. 1920x1080, JPG. Want me to upload to /public/og.jpg?",
    payload: { kind: "image", path: "/tmp/hero.jpg", size: "1920x1080" },
  },
];

function pickAgentId(): string {
  // Prefer a non-system, non-internal agent. Fall back to whatever exists.
  const employees = listEmployees().filter(
    (e) => e.id !== "system" && e.internal_only !== 1,
  );
  if (employees.length === 0) return "king-henry";
  // Prefer king-henry when present (matches the smoke-test in the brief).
  const kh = employees.find((e) => e.id === "king-henry");
  if (kh) return kh.id;
  const random = employees[Math.floor(Math.random() * employees.length)]!;
  return random.id;
}

export async function POST(): Promise<Response> {
  ensureSeeded();
  const agent_id = pickAgentId();
  const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)]!;

  const approval = insertApproval({
    agent_id,
    action_type: sample.action_type,
    title: sample.title,
    body: sample.body,
    payload: sample.payload,
  });

  return Response.json({ approval }, { status: 201 });
}
