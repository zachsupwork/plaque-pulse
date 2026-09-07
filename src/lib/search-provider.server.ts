/**
 * Public web-search abstraction (server only).
 *
 * TapLocal never scrapes a search engine's result page from the browser. This
 * module talks to a legitimate search API when one is configured, and simply
 * reports "not configured" when none is — discovery still works from the
 * business's own website in that case.
 *
 * Configure exactly one of:
 *   SERPER_API_KEY                        (serper.dev)
 *   BRAVE_SEARCH_API_KEY                  (Brave Search API)
 *   GOOGLE_CSE_KEY + GOOGLE_CSE_CX        (Google Programmable Search)
 *   BING_SEARCH_KEY                       (Bing Web Search)
 */

export type WebSearchResult = { title: string; url: string; snippet: string };

export type SearchProvider = {
  name: string;
  search(query: string, limit: number): Promise<WebSearchResult[]>;
};

function env(name: string) {
  return process.env[name] ?? null;
}

export function searchProvider(): SearchProvider | null {
  const serper = env("SERPER_API_KEY");
  if (serper) {
    return {
      name: "serper",
      async search(query, limit) {
        const res = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serper, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: limit }),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
        return (json.organic ?? [])
          .filter((r) => r.link)
          .map((r) => ({ title: r.title ?? "", url: r.link!, snippet: r.snippet ?? "" }));
      },
    };
  }

  const brave = env("BRAVE_SEARCH_API_KEY");
  if (brave) {
    return {
      name: "brave",
      async search(query, limit) {
        const url = new URL("https://api.search.brave.com/res/v1/web/search");
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(limit));
        const res = await fetch(url, { headers: { "X-Subscription-Token": brave, Accept: "application/json" } });
        if (!res.ok) return [];
        const json = (await res.json()) as {
          web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
        };
        return (json.web?.results ?? [])
          .filter((r) => r.url)
          .map((r) => ({ title: r.title ?? "", url: r.url!, snippet: r.description ?? "" }));
      },
    };
  }

  const cseKey = env("GOOGLE_CSE_KEY");
  const cseCx = env("GOOGLE_CSE_CX");
  if (cseKey && cseCx) {
    return {
      name: "google_cse",
      async search(query, limit) {
        const url = new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.set("key", cseKey);
        url.searchParams.set("cx", cseCx);
        url.searchParams.set("q", query);
        url.searchParams.set("num", String(Math.min(limit, 10)));
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = (await res.json()) as {
          items?: Array<{ title?: string; link?: string; snippet?: string }>;
        };
        return (json.items ?? [])
          .filter((r) => r.link)
          .map((r) => ({ title: r.title ?? "", url: r.link!, snippet: r.snippet ?? "" }));
      },
    };
  }

  const bing = env("BING_SEARCH_KEY");
  if (bing) {
    return {
      name: "bing",
      async search(query, limit) {
        const url = new URL("https://api.bing.microsoft.com/v7.0/search");
        url.searchParams.set("q", query);
        url.searchParams.set("count", String(limit));
        const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": bing } });
        if (!res.ok) return [];
        const json = (await res.json()) as {
          webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string }> };
        };
        return (json.webPages?.value ?? [])
          .filter((r) => r.url)
          .map((r) => ({ title: r.name ?? "", url: r.url!, snippet: r.snippet ?? "" }));
      },
    };
  }

  return null;
}

export function searchProviderName() {
  return searchProvider()?.name ?? null;
}
