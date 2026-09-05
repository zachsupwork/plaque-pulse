import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { enterDemo } from "@/lib/demo";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "TapLocal demo portal — sample business" },
      {
        name: "description",
        content: "Look around a sample TapLocal portal with example plaques, taps and results.",
      },
      { property: "og:title", content: "TapLocal demo portal — sample business" },
      { property: "og:description", content: "Example data from a sample local business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DemoEntry,
});

function DemoEntry() {
  const navigate = useNavigate();
  useEffect(() => {
    enterDemo();
    navigate({ to: "/app", search: { demo: true }, replace: true });
  }, [navigate]);

  return <p className="p-6 text-[13px] text-muted-foreground">Opening the sample business…</p>;
}
