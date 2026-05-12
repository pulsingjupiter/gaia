import type { ScheduleEvent } from "../types";

// Day index: 0 = Thu (today, May 23), 1 = Fri May 24, 2 = Sat May 25, 3 = Sun, 4 = Mon, 5 = Tue, 6 = Wed
export const SCHEDULE_DAYS = [
  { label: "Thu", date: "May 23", today: true },
  { label: "Fri", date: "May 24" },
  { label: "Sat", date: "May 25" },
  { label: "Sun", date: "May 26" },
  { label: "Mon", date: "May 27" },
  { label: "Tue", date: "May 28" },
  { label: "Wed", date: "May 29" },
];

export const SCHEDULE_EVENTS: ScheduleEvent[] = [
  // All-day pills
  { id: "ad1", title: "R2 Usage Report", day: 0, startHour: 0, durationHours: 1, tone: "blue", allDay: true },
  { id: "ad2", title: "R2 Usage Report", day: 1, startHour: 0, durationHours: 1, tone: "blue", allDay: true },
  { id: "ad3", title: "R2 Usage Report", day: 2, startHour: 0, durationHours: 1, tone: "blue", allDay: true },
  { id: "ad4", title: "Weekly Trend Digest", day: 4, startHour: 0, durationHours: 1, tone: "violet", allDay: true },
  { id: "ad5", title: "Approvals Digest", day: 5, startHour: 0, durationHours: 1, tone: "amber", allDay: true },

  // 8 AM Approvals digest (every weekday)
  { id: "e1", title: "Approvals digest", day: 0, startHour: 8, durationHours: 1, tone: "amber", ownerSlug: "gaia" },
  { id: "e2", title: "Approvals digest", day: 1, startHour: 8, durationHours: 1, tone: "amber", ownerSlug: "gaia" },
  { id: "e3", title: "Approvals digest", day: 4, startHour: 8, durationHours: 1, tone: "amber", ownerSlug: "gaia" },
  { id: "e4", title: "Approvals digest", day: 5, startHour: 8, durationHours: 1, tone: "amber", ownerSlug: "gaia" },
  { id: "e5", title: "Approvals digest", day: 6, startHour: 8, durationHours: 1, tone: "amber", ownerSlug: "gaia" },

  // 9 AM Running the trending Mon–Wed
  { id: "e6", title: "Running the trending", day: 4, startHour: 9, durationHours: 1, tone: "violet", ownerSlug: "gaia" },
  { id: "e7", title: "Running the trending", day: 5, startHour: 9, durationHours: 1, tone: "violet", ownerSlug: "gaia" },
  { id: "e8", title: "Running the trending", day: 6, startHour: 9, durationHours: 1, tone: "violet", ownerSlug: "gaia" },
  { id: "e8b", title: "Running the trending", day: 0, startHour: 9, durationHours: 1, tone: "violet", ownerSlug: "gaia" },

  // 10 AM Inbox triage
  { id: "e9", title: "Inbox triage", day: 0, startHour: 10, durationHours: 1, tone: "green", ownerSlug: "nova" },
  { id: "e10", title: "Inbox triage", day: 1, startHour: 10, durationHours: 1, tone: "green", ownerSlug: "nova" },
  { id: "e11", title: "Inbox triage", day: 4, startHour: 10, durationHours: 1, tone: "green", ownerSlug: "nova" },
  { id: "e12", title: "Inbox triage", day: 5, startHour: 10, durationHours: 1, tone: "green", ownerSlug: "nova" },

  // Sunday Inbox triage 11 AM
  { id: "e13", title: "Inbox triage", day: 3, startHour: 11, durationHours: 1, tone: "green", ownerSlug: "nova" },

  // 11:30 AM Approvals poll
  { id: "e14", title: "Approvals poll", day: 0, startHour: 11.5, durationHours: 0.5, tone: "peach", ownerSlug: "king-henry" },
  { id: "e15", title: "Approvals poll", day: 1, startHour: 11.5, durationHours: 0.5, tone: "peach", ownerSlug: "king-henry" },
  { id: "e16", title: "Approvals poll", day: 4, startHour: 11.5, durationHours: 0.5, tone: "peach", ownerSlug: "king-henry" },
  { id: "e17", title: "Approvals poll", day: 5, startHour: 11.5, durationHours: 0.5, tone: "peach", ownerSlug: "king-henry" },

  // 2 PM Atlas/Rack/Atlas
  { id: "e18", title: "Trend analysis report", day: 0, startHour: 14, durationHours: 1, tone: "violet", ownerSlug: "atlas" },
  { id: "e19", title: "Render queue audit", day: 1, startHour: 14, durationHours: 1, tone: "blue", ownerSlug: "rack" },
  { id: "e20", title: "Trend analysis report", day: 4, startHour: 14, durationHours: 1, tone: "violet", ownerSlug: "atlas" },
  { id: "e21", title: "Render queue audit", day: 5, startHour: 14, durationHours: 1, tone: "blue", ownerSlug: "rack" },
  { id: "e22", title: "Trend analysis report", day: 6, startHour: 14, durationHours: 1, tone: "violet", ownerSlug: "atlas" },

  // 5 PM R2 usage Thu-Wed
  { id: "e23", title: "R2 usage report", day: 0, startHour: 17, durationHours: 1, tone: "blue", ownerSlug: "rack" },
  { id: "e24", title: "R2 usage report", day: 1, startHour: 17, durationHours: 1, tone: "blue", ownerSlug: "rack" },
  { id: "e25", title: "R2 usage report", day: 4, startHour: 17, durationHours: 1, tone: "blue", ownerSlug: "rack" },
  { id: "e26", title: "R2 usage report", day: 5, startHour: 17, durationHours: 1, tone: "blue", ownerSlug: "rack" },
  { id: "e27", title: "R2 usage report", day: 6, startHour: 17, durationHours: 1, tone: "blue", ownerSlug: "rack" },
];

export const TONE_STYLES: Record<string, { bg: string; border: string; fg: string }> = {
  amber: { bg: "#FEF3C7", border: "#FDE68A", fg: "#92400E" },
  blue: { bg: "#DBEAFE", border: "#BFDBFE", fg: "#1E40AF" },
  green: { bg: "#D1FAE5", border: "#A7F3D0", fg: "#065F46" },
  peach: { bg: "#FFE4D6", border: "#FED7AA", fg: "#9A3412" },
  violet: { bg: "#EDE9FE", border: "#DDD6FE", fg: "#5B21B6" },
};
