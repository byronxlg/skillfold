import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { isAtomic, loadConfig } from "./config.js";
import { compile } from "./compiler.js";
import { ConfigError, CompileError, GraphError, ResolveError } from "./errors.js";
import { resolveSkills } from "./resolver.js";

async function runCompile(
  configPath: string,
  outDir: string,
  version: string
): Promise<string[]> {
  const config = await loadConfig(configPath);
  const baseDir = dirname(configPath);
  const bodies = await resolveSkills(config, baseDir);
  const results = compile(config, bodies, outDir, version, basename(configPath));

  console.log(`skillfold: compiled ${config.name}`);
  for (const result of results) {
    console.log(`  -> ${result.path}`);
  }

  // Return local atomic skill directories for watching
  const skillDirs: string[] = [];
  for (const skill of Object.values(config.skills)) {
    if (isAtomic(skill) && !skill.path.startsWith("https://")) {
      skillDirs.push(resolve(baseDir, skill.path));
    }
  }
  return skillDirs;
}

export async function watchPipeline(
  configPath: string,
  outDir: string,
  version: string
): Promise<void> {
  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function closeAll(): void {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    for (const w of watchers) {
      w.close();
    }
    watchers.length = 0;
  }

  function scheduleRecompile(): void {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      debounceTimer = undefined;
      try {
        closeAll();
        const skillDirs = await runCompile(configPath, outDir, version);
        startWatching(skillDirs);
      } catch (err) {
        if (
          err instanceof ConfigError ||
          err instanceof ResolveError ||
          err instanceof CompileError ||
          err instanceof GraphError
        ) {
          console.error(`skillfold error: ${err.message}`);
          startWatching([]);
        } else {
          throw err;
        }
      }
    }, 100);
  }

  function startWatching(skillDirs: string[]): void {
    const onChange = (): void => {
      scheduleRecompile();
    };

    const configWatcher = watch(configPath, onChange);
    watchers.push(configWatcher);

    for (const dir of skillDirs) {
      try {
        const dirWatcher = watch(dir, { recursive: true }, onChange);
        watchers.push(dirWatcher);
      } catch {
        // Directory may not exist or be inaccessible
      }
    }
  }

  const onSigint = (): void => {
    closeAll();
    process.exit(0);
  };
  process.on("SIGINT", onSigint);

  let skillDirs: string[];
  try {
    skillDirs = await runCompile(configPath, outDir, version);
  } catch (err) {
    if (
      err instanceof ConfigError ||
      err instanceof ResolveError ||
      err instanceof CompileError ||
      err instanceof GraphError
    ) {
      console.error(`skillfold error: ${err.message}`);
      skillDirs = [];
    } else {
      throw err;
    }
  }

  console.log("skillfold: watching for changes...");
  startWatching(skillDirs);

  // Keep the process alive
  await new Promise<void>(() => {
    // Never resolves - process exits via SIGINT handler
  });
}
