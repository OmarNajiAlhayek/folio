import { redirect } from "next/navigation";

/**
 * No page lives at /submissions/compose — redirect to the create flow.
 * This stub gives the Next.js DevTools segment explorer a valid page node
 * for the intermediate "compose" segment so it can build its route tree.
 */
export default function ComposeIndexPage() {
  redirect("/submissions/compose/create");
}
