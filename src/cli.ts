#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readConfig } from "./config.js";
import { compile } from "./compiler.js";
import { ConfigError, CompileError, ResolveError } from "./errors.js";
import { resolveSkills } from "./resolver.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8")
);

function printHelp(): void {
  console.log(`skillfold v${pkg.version}

Usage: skillfold [options]

Options:
  --config <path>   Config file (default: skillfold.yaml)
  --out-dir <path>  Output directory (default: build)
  --help            Show this help
  --version         Show version`);
}

function parseArgs(argv: string[]): {
  configPath: string;
  outDir: string;
  help: boolean;
  version: boolean;
} {
  let configPath = "skillfold.yaml";
  let outDir = "build";
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
    } else if (argv[i] === "--help") {
      help = true;
    } else if (argv[i] === "--version") {
      version = true;
    }
  }

  return { configPath: resolve(configPath), outDir: resolve(outDir), help, version };
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
