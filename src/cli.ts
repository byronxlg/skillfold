#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type CompileTarget, check, compile, computeStats } from "./compiler.js";
import { isAtomic, isComposed, loadConfig } from "./config.js";
import { ConfigError, CompileError, GraphError, ResolveError } from "./errors.js";
import { initFromTemplate, initProject, TEMPLATES } from "./init.js";
import { listPipeline } from "./list.js";
import { resolveSkills } from "./resolver.js";
import { generateMermaid } from "./visualize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

function printHelp(): void {
  console.log(`skillfold v${pkg.version}

Usage: skillfold [command] [options]

Commands:
  init [dir]        Scaffold a new pipeline project
  adopt             Adopt existing Claude Code agents into a pipeline
  validate          Validate config without compiling
  list              Display a structured summary of the pipeline
  graph             Output Mermaid flowchart of the team flow
  watch             Compile and watch for changes
  plugin            Package compiled output as a Claude Code plugin
  search [query]    Search npm for skillfold skill packages
  (default)         Compile the pipeline config

Options:
  --config <path>      Config file (default: skillfold.yaml)
  --out-dir <path>     Output directory (default: build, or .claude for claude-code target)
  --dir <path>         Target directory for init (default: .)
  --target <mode>      Output mode: skill (default) or claude-code
  --template <name>    Start from a library template (init only)
  --check              Verify compiled output is up-to-date (exit 1 if stale)
  --help               Show this help
  --version            Show version

Templates: ${TEMPLATES.join(", ")}`);
}

type Command = "init" | "adopt" | "compile" | "graph" | "list" | "validate" | "watch" | "plugin" | "search";

interface Args {
  command: Command;
  configPath: string;
  outDir: string;
  outDirExplicit: boolean;
  dir: string;
  target: CompileTarget;
  template: string | undefined;
  query: string | undefined;
  check: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  let command: Command = "compile";
  let configPath = "skillfold.yaml";
  let outDir = "build";
  let outDirExplicit = false;
  let dir = ".";
  let target: CompileTarget = "skill";
  let template: string | undefined;
  let query: string | undefined;
  let checkMode = false;
  let help = false;
  let version = false;

  let i = 0;

  // Check for subcommand as first positional arg
  if (argv.length > 0 && argv[0] === "init") {
    command = "init";
    i = 1;
    // Support positional dir: skillfold init <dir>
    if (argv.length > 1 && argv[1] && !argv[1].startsWith("-")) {
      dir = argv[1];
      i = 2;
    }
  } else if (argv.length > 0 && argv[0] === "adopt") {
    command = "adopt";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "graph") {
    command = "graph";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "list") {
    command = "list";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "validate") {
    command = "validate";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "watch") {
    command = "watch";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "plugin") {
    command = "plugin";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "search") {
    command = "search";
    i = 1;
    // Capture remaining non-flag args as search query
    const queryParts: string[] = [];
    while (i < argv.length && !argv[i].startsWith("-")) {
      queryParts.push(argv[i]);
      i++;
    }
    if (queryParts.length > 0) {
      query = queryParts.join(" ");
    }
  }

  for (; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
      outDirExplicit = true;
    } else if (argv[i] === "--dir" && argv[i + 1]) {
      dir = argv[++i];
    } else if (argv[i] === "--target" && argv[i + 1]) {
      const val = argv[++i];
      if (val !== "skill" && val !== "claude-code") {
        console.error(`skillfold error: unknown target "${val}" (expected: skill, claude-code)`);
        process.exit(1);
      }
      target = val;
    } else if (argv[i] === "--template" && argv[i + 1]) {
      template = argv[++i];
    } else if (argv[i] === "--check") {
      checkMode = true;
    } else if (argv[i] === "--help") {
      help = true;
    } else if (argv[i] === "--version") {
      version = true;
    }
  }

  // Default outDir changes based on target when not explicitly set
  if (!outDirExplicit) {
    if (target === "claude-code") {
      outDir = ".claude";
    } else if (command === "plugin") {
      outDir = "plugin";
    }
  }

  return {
    command,
    configPath: resolve(configPath),
    outDir: resolve(outDir),
    outDirExplicit,
    dir: resolve(dir),
    target,
    template,
    query,
    check: checkMode,
    help,
    version,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    console.log(pkg.version);
    return;
  }

  if (args.command === "init") {
    try {
      const files = args.template
        ? initFromTemplate(args.dir, args.template)
        : initProject(args.dir);
      console.log("skillfold: project initialized");
      for (const file of files) {
        console.log(`  -> ${file}`);
      }
      const abs = resolve(args.dir);
      const rel = relative(process.cwd(), abs);
      const cdTarget = rel === "" ? "" : rel.startsWith("..") ? abs : rel;
      const cdPrefix = cdTarget ? `cd ${cdTarget} && ` : "";
      console.log(`\nNext: ${cdPrefix}npx skillfold`);
      if (!args.template) {
        console.log(
          "\nTip: import shared skills from the library by uncommenting the imports line in skillfold.yaml"
        );
      }
      console.log(
        `\nTemplates: skillfold init --template <name> (${TEMPLATES.join(", ")})`
      );
    } catch (err) {
      if (err instanceof Error) {
        console.error(`skillfold error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }

  if (args.command === "adopt") {
    const { adoptProject } = await import("./adopt.js");
    try {
      const result = adoptProject(args.dir);
      console.log("skillfold: adopted agents");
      for (const agent of result.agents) {
        console.log(`  -> ${agent.name} (${agent.skillPath})`);
      }
      console.log(`\nConfig: ${result.configPath}`);
      console.log("\nNext: npx skillfold --target claude-code");
    } catch (err) {
      if (err instanceof Error) {
        console.error(`skillfold error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }

  if (args.command === "search") {
    const { searchSkills } = await import("./search.js");
    await searchSkills(args.query);
    return;
  }

  if (args.command === "graph") {
    try {
      const config = await loadConfig(args.configPath);
      if (!config.team) {
        console.error("skillfold error: No team defined in config");
        process.exit(1);
      }
      const output = generateMermaid(config);
      process.stdout.write(output);
    } catch (err) {
      if (err instanceof ConfigError || err instanceof GraphError) {
        console.error(`skillfold error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }

  if (args.command === "list") {
    try {
      const config = await loadConfig(args.configPath);
      process.stdout.write(listPipeline(config));
    } catch (err) {
      if (err instanceof ConfigError || err instanceof GraphError) {
        console.error(`skillfold error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }

  if (args.command === "validate") {
    try {
      const config = await loadConfig(args.configPath);
      const baseDir = dirname(args.configPath);
      await resolveSkills(config, baseDir);

      const skills = Object.values(config.skills);
      const atomicCount = skills.filter(isAtomic).length;
      const composedCount = skills.filter(isComposed).length;
      const fieldCount = config.state ? Object.keys(config.state.fields).length : 0;
      const typeCount = config.state ? Object.keys(config.state.types).length : 0;

      const parts = [`${atomicCount} atomic`, `${composedCount} composed`];
      if (fieldCount > 0) parts.push(`${fieldCount} state fields`);
      if (typeCount > 0) parts.push(`${typeCount} types`);
      if (config.team) parts.push("team flow");

      console.log(`skillfold: ${config.name} is valid (${parts.join(", ")})`);
    } catch (err) {
      if (
        err instanceof ConfigError ||
        err instanceof ResolveError ||
        err instanceof GraphError
      ) {
        console.error(`skillfold error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }

  if (args.command === "watch") {
    const { watchPipeline } = await import("./watch.js");
    await watchPipeline(args.configPath, args.outDir, pkg.version, args.target);
    return;
  }

  if (args.command === "plugin") {
    const { buildPlugin } = await import("./plugin.js");
    try {
      await buildPlugin(args.configPath, args.outDir, pkg.version);
    } catch (err) {
      if (
        err instanceof ConfigError ||
        err instanceof ResolveError ||
        err instanceof CompileError
      ) {
        console.error(`skillfold error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }

  try {
    const config = await loadConfig(args.configPath);
    const baseDir = dirname(args.configPath);
    const bodies = await resolveSkills(config, baseDir);

    if (args.check) {
      const results = check(config, bodies, args.outDir, pkg.version, basename(args.configPath), args.target);
      const stale = results.filter((r) => r.status !== "ok");

      if (stale.length === 0) {
        console.log(`skillfold: ${config.name} output is up-to-date (${results.length} files)`);
      } else {
        console.error(`skillfold: ${config.name} output is stale`);
        for (const result of stale) {
          console.error(`  ${result.status}: ${result.path}`);
        }
        process.exit(1);
      }
    } else {
      const results = compile(config, bodies, args.outDir, pkg.version, basename(args.configPath), args.target);

      console.log(`skillfold: compiled ${config.name}`);
      for (const result of results) {
        console.log(`  -> ${result.path}`);
      }

      const stats = computeStats(config, bodies);
      if (stats.agents > 0) {
        const parts: string[] = [`${stats.agents} agents`, `${stats.skills} skills`];
        if (stats.shared > 0) {
          parts[parts.length - 1] += ` (${stats.shared} shared)`;
        }
        let line = `  ${parts.join(", ")}.`;
        if (stats.linesDeduplicated > 0) {
          line += ` ~${stats.linesDeduplicated} lines deduplicated.`;
        }
        console.log(line);
      }
    }
  } catch (err) {
    if (
      err instanceof ConfigError ||
      err instanceof ResolveError ||
      err instanceof CompileError
    ) {
      console.error(`skillfold error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main();
