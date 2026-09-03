import { createFileRoute } from "@tanstack/react-router";
import { resolveAndRedirect } from "@/lib/redirect.server";

export const Route = createFileRoute("/n/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => resolveAndRedirect(params.slug, "nfc", request),
    },
  },
});
