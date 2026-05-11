export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="section-header">{title}</h3>
      {action ? <div className="text-xs">{action}</div> : null}
    </div>
  );
}
