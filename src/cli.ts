#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readConfig } from "./config.js";
import { compile } from "./compiler.js";
import { ConfigError, CompileError, ResolveError } from "./errors.js";
import { initProject } from "./init.js";
import { resolveSkills } from "./resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

function printHelp(): void {
  console.log(`skillfold v${pkg.version}

Usage: skillfold [command] [options]

Commands:
  init              Scaffold a new pipeline project
  (default)         Compile the pipeline config

Options:
  --config <path>   Config file (default: skillfold.yaml)
  --out-dir <path>  Output directory (default: build)
  --dir <path>      Target directory for init (default: .)
  --help            Show this help
  --version         Show version`);
}

interface Args {
  command: "init" | "compile";
  configPath: string;
  outDir: string;
  dir: string;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  let command: "init" | "compile" = "compile";
  let configPath = "skillfold.yaml";
  let outDir = "build";
  let dir = ".";
  let help = false;
  let version = false;

  let i = 0;

  // Check for subcommand as first positional arg
  if (argv.length > 0 && argv[0] === "init") {
    command = "init";
    i = 1;
  }

  for (; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
    } else if (argv[i] === "--dir" && argv[i + 1]) {
      dir = argv[++i];
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
    help,
    version,
  };
}

function main(): void {
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
      const files = initProject(args.dir);
      console.log("skillfold: project initialized");
      for (const file of files) {
        console.log(`  -> ${file}`);
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error(`skillfold error: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    return;
  }

  try {
    const config = readConfig(args.configPath);
    const baseDir = dirname(args.configPath);
    const bodies = resolveSkills(config, baseDir);
    const results = compile(config, bodies, args.outDir);

    console.log(`skillfold: compiled ${config.name}`);
    for (const result of results) {
      console.log(`  -> ${result.path}`);
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
