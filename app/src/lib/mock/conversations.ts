import type { Conversation } from "../types";

export const CONVERSATIONS: Conversation[] = [
  { id: "c1", participants: ["professor-adrian"], preview: "I've completed the analysis...", time: "9:41 AM", pinned: true },
  { id: "c2", participants: ["nova"], preview: "Trend digest is up.", time: "8:50 AM", pinned: true },
  { id: "c3", participants: ["professor-adrian"], preview: "Today's report ready", time: "7m" },
  { id: "c4", participants: ["nova"], preview: "Drafted hooks for #5", time: "12m" },
  { id: "c5", participants: ["atlas"], preview: "Competitor scan complete", time: "32m" },
  { id: "c6", participants: ["king-henry"], preview: "Carousel v2 attached", time: "1h" },
  { id: "c7", participants: ["rack"], preview: "Webhook deployed", time: "2h" },
  { id: "c8", participants: ["atlas", "nova"], preview: "Joint trend playbook?", time: "3h" },
  { id: "c9", participants: ["professor-adrian", "king-henry"], preview: "Carousel review", time: "5h" },
  { id: "c10", participants: ["nova", "rack"], preview: "Pipeline status", time: "1d" },
];
