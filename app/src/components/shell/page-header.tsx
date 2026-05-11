export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-6">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-primary">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-secondary">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
