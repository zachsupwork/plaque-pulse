import { createFileRoute } from "@tanstack/react-router";
import { resolveAndRedirect } from "@/lib/redirect.server";

export const Route = createFileRoute("/q/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => resolveAndRedirect(params.slug, "qr", request),
    },
  },
});
