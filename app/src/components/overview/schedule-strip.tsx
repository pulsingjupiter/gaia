import { ChevronLeft, ChevronRight } from "lucide-react";
import { SCHEDULE_DAYS, SCHEDULE_EVENTS, TONE_STYLES } from "@/lib/mock/schedule";

export function ScheduleStrip() {
  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between">
        <div className="section-header">Schedule</div>
        <div className="flex items-center gap-1 text-xs">
          <button className="rounded-md p-1 text-muted hover:bg-surface-muted">
            <ChevronLeft size={14} />
          </button>
          <button className="rounded-md px-2 py-0.5 font-medium text-secondary hover:bg-surface-muted">
            Today
          </button>
          <button className="rounded-md p-1 text-muted hover:bg-surface-muted">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-2">
        {SCHEDULE_DAYS.map((d, i) => {
          const events = SCHEDULE_EVENTS.filter(
            (e) => e.day === i && !e.allDay,
          ).slice(0, 3);
          return (
            <div
              key={i}
              className={`rounded-lg border p-2 ${
                d.today
                  ? "border-[#FDE68A] bg-[#FFFBEB]"
                  : "border-subtle bg-white"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {d.today ? "Today" : d.label}
                </span>
                <span className="text-[10px] text-muted">
                  {d.date}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {events.map((ev) => {
                  const tone = TONE_STYLES[ev.tone];
                  return (
                    <div
                      key={ev.id}
                      className="rounded-md border px-1.5 py-1 text-[10px] font-medium leading-tight"
                      style={{
                        background: tone.bg,
                        borderColor: tone.border,
                        color: tone.fg,
                      }}
                    >
                      {ev.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
