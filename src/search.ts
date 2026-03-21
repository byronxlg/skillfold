interface NpmPackage {
  name: string;
  description: string;
  version: string;
  keywords: string[];
  links: { npm: string; homepage?: string };
}

interface NpmSearchResult {
  objects: Array<{
    package: NpmPackage;
    score: { detail: { popularity: number } };
  }>;
  total: number;
}

export async function searchSkills(query?: string): Promise<void> {
  const searchTerms = ["keywords:skillfold-skill", query]
    .filter(Boolean)
    .join("+");
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchTerms)}&size=25`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    console.error("Error: could not reach npm registry");
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`Error: npm registry returned ${response.status}`);
    process.exit(1);
  }

  const data = (await response.json()) as NpmSearchResult;

  if (data.total === 0 || data.objects.length === 0) {
    console.log(
      query
        ? `No skillfold skills found matching "${query}"`
        : "No skillfold skills found",
    );
    return;
  }

  console.log(
    `\n  Found ${data.objects.length} skill${data.objects.length === 1 ? "" : "s"}:\n`,
  );

  for (const { package: pkg } of data.objects) {
    const desc = pkg.description || "No description";
    console.log(`  ${pkg.name}  v${pkg.version}`);
    console.log(`    ${desc}\n`);
  }

  console.log("  Install: npm install <package>");
  console.log("  Import:  imports: [npm:<package>]\n");
}
