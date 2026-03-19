import { resolve, dirname } from "node:path";
import { readConfig } from "./config.js";
import { resolveSkills } from "./resolver.js";
import { compile } from "./compiler.js";
import { ConfigError, ResolveError, CompileError } from "./errors.js";

function parseArgs(argv: string[]): { configPath: string; outDir: string } {
  let configPath = "skillfold.yaml";
  let outDir = "dist";

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = argv[++i];
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i];
    }
  }

  return { configPath: resolve(configPath), outDir: resolve(outDir) };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

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
