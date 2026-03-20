#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isAtomic, isComposed, loadConfig } from "./config.js";
import { check, compile } from "./compiler.js";
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
  validate          Validate config without compiling
  list              Display a structured summary of the pipeline
  graph             Output Mermaid flowchart of the team flow
  (default)         Compile the pipeline config

Options:
  --config <path>      Config file (default: skillfold.yaml)
  --out-dir <path>     Output directory (default: build)
  --dir <path>         Target directory for init (default: .)
  --template <name>    Start from a library template (init only)
  --check              Verify compiled output is up-to-date (exit 1 if stale)
  --help               Show this help
  --version            Show version

Templates: ${TEMPLATES.join(", ")}`);
}

interface Args {
  command: "init" | "compile" | "graph" | "list" | "validate";
  configPath: string;
  outDir: string;
  dir: string;
  template: string | undefined;
  check: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  let command: "init" | "compile" | "graph" | "list" | "validate" = "compile";
  let configPath = "skillfold.yaml";
  let outDir = "build";
  let dir = ".";
  let template: string | undefined;
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
  } else if (argv.length > 0 && argv[0] === "graph") {
    command = "graph";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "list") {
    command = "list";
    i = 1;
  } else if (argv.length > 0 && argv[0] === "validate") {
    command = "validate";
    i = 1;
  }

  for (; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
    } else if (argv[i] === "--dir" && argv[i + 1]) {
      dir = argv[++i];
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

  return {
    command,
    configPath: resolve(configPath),
    outDir: resolve(outDir),
    dir: resolve(dir),
    template,
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
      const rel = relative(process.cwd(), args.dir);
      const cdPrefix = rel ? `cd ${rel} && ` : "";
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

  try {
    const config = await loadConfig(args.configPath);
    const baseDir = dirname(args.configPath);
    const bodies = await resolveSkills(config, baseDir);

    if (args.check) {
      const results = check(config, bodies, args.outDir, pkg.version, basename(args.configPath));
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
      const results = compile(config, bodies, args.outDir, pkg.version, basename(args.configPath));

      console.log(`skillfold: compiled ${config.name}`);
      for (const result of results) {
        console.log(`  -> ${result.path}`);
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
