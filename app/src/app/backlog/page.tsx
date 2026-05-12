import { redirect } from "next/navigation";

// The standalone /backlog page was renamed to /tasks. Keep this route as a
// permanent redirect so old links and bookmarks land on the canonical URL.
export default function BacklogPage() {
  redirect("/tasks");
}
