export type OverviewTask = {
  id: string;
  title: string;
  cadence: string;
  chips?: number[];
  body?: string;
  time?: string;
  tags?: string[];
  days?: boolean[]; // 7-day pattern S M T W T F S
};

export const OVERVIEW_TASKS: OverviewTask[] = [
  {
    id: "t1",
    title: "Follow-up check",
    cadence: "Daily",
    chips: [2, 11, 1],
    body: "Proposals for client responses, have been sitting longer than expected.",
    time: "08:00 AM",
    days: [true, true, true, true, true, true, true],
  },
  {
    id: "t2",
    title: "Running the trending.",
    cadence: "Daily",
    body: "Pull rising signals across TikTok, Reddit, and X to surface today's drivers.",
    time: "9:00 AM",
    tags: ["/trending", "#trending"],
    days: [false, true, true, true, true, true, false],
  },
  {
    id: "t3",
    title: "Inbox triage",
    cadence: "Daily",
    chips: [3, 9, 2],
    body: "Sort, label, and route inbound messages to the right agent or queue.",
    time: "09:00 AM",
    days: [true, true, true, true, true, true, true],
  },
  {
    id: "t4",
    title: "Approvals poll (every 30 min, 9am–9pm)",
    cadence: "Every 30 min",
    body: "Poll pending approvals and ping owners with a quick status summary.",
    time: "Recurring",
    days: [false, true, true, true, true, true, false],
  },
];
