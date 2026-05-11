import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./page-header";

export function ComingSoon({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}) {
  return (
    <div className="px-6 py-6">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="card-surface flex min-h-[60vh] flex-col items-center justify-center px-6 py-16">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon size={24} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-primary">
          Coming soon
        </h2>
        <p className="mt-1 max-w-md text-center text-sm text-secondary">
          We&apos;re still wiring this up. Check back once the prototype lands its next sprint.
        </p>
      </div>
    </div>
  );
}
