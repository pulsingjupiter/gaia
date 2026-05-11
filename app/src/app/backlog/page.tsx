import { ListTodo } from "lucide-react";
import { ComingSoon } from "@/components/shell/coming-soon";

export default function BacklogPage() {
  return (
    <ComingSoon
      title="Backlog"
      subtitle="Capture, prioritize, and groom upcoming work for your AI workforce."
      icon={ListTodo}
    />
  );
}
