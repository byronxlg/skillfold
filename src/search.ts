/**
 * Search the npm registry for packages that publish skills
 * (tagged with the `skillfold-skill` keyword).
 */

export interface SearchHit {
  name: string;
  version: string;
  description: string;
  skills: string[];
}

interface NpmSearchResult {
  objects: Array<{
    package: {
      name: string;
      description?: string;
      version: string;
      keywords?: string[];
    };
  }>;
  total: number;
}

export async function searchSkills(
  query?: string,
  fetcher: typeof fetch = fetch
): Promise<SearchHit[]> {
  const terms = ["keywords:skillfold-skill", query].filter(Boolean).join("+");
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(terms)}&size=25`;
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`npm registry returned ${response.status}`);
  }
  const data = (await response.json()) as NpmSearchResult;
  return data.objects.map(({ package: pkg }) => ({
    name: pkg.name,
    version: pkg.version,
    description: pkg.description ?? "",
    skills: [],
  }));
}

export function renderSearchHits(hits: SearchHit[], query?: string): string {
  if (hits.length === 0) {
    return query
      ? `no published skills match "${query}"`
      : "no published skills found";
  }
  const lines: string[] = [];
  for (const hit of hits) {
    lines.push(`  ${hit.name}  ${hit.version}`);
    if (hit.description) lines.push(`    ${hit.description}`);
  }
  lines.push("");
  lines.push("  add one with: skillfold add npm:<package>/<skill-name>");
  return lines.join("\n");
}
