import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parse, stringify } from "yaml";

export interface AdoptedAgent {
  name: string;
  description: string;
  sourcePath: string;
  skillPath: string;
}

export interface AdoptResult {
  configPath: string;
  agents: AdoptedAgent[];
}

interface ParsedFrontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

function parseFrontmatter(content: string): { frontmatter: ParsedFrontmatter | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: content };

  const parsed = parse(match[1]) as ParsedFrontmatter | null;
  return { frontmatter: parsed, body: match[2] };
}

function deriveDescription(name: string, body: string): string {
  // Try to extract from the first non-heading paragraph
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;
    if (trimmed.startsWith("You ") || trimmed.startsWith("This ") || trimmed.length > 20) {
      return trimmed.length > 100 ? trimmed.slice(0, 97) + "..." : trimmed;
    }
  }
  return `${name} agent.`;
}

export function adoptProject(dir: string): AdoptResult {
  const agentsDir = join(dir, ".claude", "agents");
  const configPath = join(dir, "skillfold.yaml");

  if (!existsSync(agentsDir)) {
    throw new Error(
      "No .claude/agents/ directory found. Create Claude Code agents first, then run skillfold adopt."
    );
  }

  if (existsSync(configPath)) {
    throw new Error(
      "skillfold.yaml already exists. Remove it first or use a different directory."
    );
  }

  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort();

  if (files.length === 0) {
    throw new Error(
      "No .md files found in .claude/agents/. Add agent files first, then run skillfold adopt."
    );
  }

  const agents: AdoptedAgent[] = [];
  const atomicSkills: Record<string, string> = {};
  const composedSkills: Record<string, { compose: string[]; description: string }> = {};

  for (const file of files) {
    const sourcePath = join(agentsDir, file);
    const content = readFileSync(sourcePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    const baseName = file.replace(/\.md$/, "");
    const name = (frontmatter?.name as string) ?? baseName;
    const description =
      (frontmatter?.description as string) ?? deriveDescription(name, body);

    // Write the skill SKILL.md with proper frontmatter
    const skillDir = join(dir, "skills", name);
    mkdirSync(skillDir, { recursive: true });

    const atomicName = `${name}-skill`;
    const skillContent = `---\nname: ${atomicName}\ndescription: ${description}\n---\n\n${body.replace(/^\n+/, "")}`;
    const skillPath = join(skillDir, "SKILL.md");
    writeFileSync(skillPath, skillContent, "utf-8");

    atomicSkills[atomicName] = `./skills/${name}`;
    composedSkills[name] = { compose: [atomicName], description };

    agents.push({ name, description, sourcePath, skillPath });
  }

  // Generate the config
  const config = {
    name: "my-pipeline",
    skills: {
      atomic: atomicSkills,
      composed: composedSkills,
    },
  };

  const schemaComment = "# yaml-language-server: $schema=node_modules/skillfold/skillfold.schema.json\n";
  writeFileSync(configPath, schemaComment + stringify(config), "utf-8");

  return { configPath, agents };
}
