import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";

import { extractRulesBlock } from "./agentsmd.js";
import {
  composeOrder,
  generateComposedSkill,
  type ComposeInput,
} from "./compose.js";
import { InstallError } from "./errors.js";
import { installedDrift, type InstalledLookup } from "./installed.js";
import { lockfileProblems, type Lockfile } from "./lock.js";
import type { Manifest } from "./manifest.js";
import { parseSource } from "./source.js";
import type { ResolvedRule, ResolvedSkill } from "./resolve.js";
import { lockForTarget, manifestForTarget, type TargetLayout } from "./targets.js";
import {
  computeFileIntegrity,
  computeIntegrity,
  normalizeSkillName,
  parseAllowedTools,
  parseFrontmatter,
  readDirFiles,
  type SkillFile,
} from "./skill.js";

export interface SyncResult {
  /** Skills written or rewritten. */
  installed: string[];
  /** Skills already up to date on disk. */
  unchanged: string[];
  /** Previously managed skills removed because they left the manifest. */
  pruned: string[];
}

export interface SyncOptions {
  /** Absolute path to the skills directory. */
  skillsDir: string;
  resolved: ResolvedSkill[];
  /** Lockfile from before this run; its names are the dirs skillfold manages. */
  previousLock: Lockfile | null;
  /** Overwrite directories skillfold does not manage. */
  force?: boolean;
}

/** GitHub's contents API has no mode metadata; shebangs identify runnable helpers. */
export function nonExecutableScripts(dir: string, files: SkillFile[]): string[] {
  if (process.platform === "win32") return [];
  return files.filter((file) =>
    file.content[0] === 35 && file.content[1] === 33 &&
    (statSync(join(dir, file.path)).mode & 0o100) === 0
  ).map((file) => file.path);
}

function makeScriptsExecutable(dir: string, files: SkillFile[]): boolean {
  const scripts = nonExecutableScripts(dir, files);
  for (const script of scripts) {
    const path = join(dir, script);
    const mode = statSync(path).mode;
    // Grant execution to the owner and anyone already allowed to read the script.
    chmodSync(path, mode | 0o100 | ((mode & 0o444) >> 2));
  }
  return scripts.length > 0;
}

function writeSkillFiles(dir: string, files: SkillFile[]): void {
  for (const file of files) {
    const target = join(dir, ...file.path.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  makeScriptsExecutable(dir, files);
}

/**
 * Materialize resolved skills into the skills directory and prune skills
 * that left the manifest. A directory is "managed" (safe to overwrite or
 * remove) when its name appears in the lockfile; anything else is treated
 * as hand-authored and never touched without --force.
 */
export function syncSkillsDir(options: SyncOptions): SyncResult {
  const { skillsDir, resolved, previousLock, force } = options;
  const managed = new Set<string>([
    ...Object.keys(previousLock?.skills ?? {}),
    ...Object.keys(previousLock?.compose ?? {}),
  ]);
  const result: SyncResult = { installed: [], unchanged: [], pruned: [] };
  const currentNames = new Set(resolved.map((skill) => skill.name));

  for (const skill of resolved) {
    const target = join(skillsDir, skill.name);
    if (existsSync(target)) {
      const existingIntegrity = computeIntegrity(readDirFiles(target));
      const newIntegrity = computeIntegrity(skill.skill.files);
      if (existingIntegrity === newIntegrity) {
        const repaired = makeScriptsExecutable(target, skill.skill.files);
        (repaired ? result.installed : result.unchanged).push(skill.name);
        continue;
      }
      if (!managed.has(skill.name) && !force) {
        throw new InstallError(
          `${target} already exists and was not installed by skillfold. ` +
            `Move it aside, pick another name, or rerun with --force to overwrite it.`
        );
      }
      rmSync(target, { recursive: true, force: true });
    }
    writeSkillFiles(target, skill.skill.files);
    result.installed.push(skill.name);
  }

  for (const name of managed) {
    if (currentNames.has(name)) continue;
    const target = join(skillsDir, name);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      result.pruned.push(name);
    }
  }

  return result;
}

export interface SyncRulesOptions {
  /** Absolute path to the rules directory. */
  rulesDir: string;
  rules: ResolvedRule[];
  previousLock: Lockfile | null;
  /** Write Cursor-compatible always-on .mdc files. */
  cursorRules?: boolean;
  /** Overwrite files skillfold does not manage. */
  force?: boolean;
}

/** Rule file path inside the rules directory. */
export function ruleFile(rulesDir: string, name: string, cursorRules = false): string {
  return join(rulesDir, `${name}.${cursorRules ? "mdc" : "md"}`);
}

function cursorRulePrefix(name: string): Buffer {
  return Buffer.from(
    `---\ndescription: "Managed by skillfold: ${name}"\nalwaysApply: true\n---\n\n`,
    "utf-8"
  );
}

/** Encode plain rule source as an always-on Cursor project rule. */
export function encodeCursorRule(name: string, content: Buffer): Buffer {
  return Buffer.concat([cursorRulePrefix(name), content]);
}

/** Return the source body only when the generated Cursor metadata is intact. */
export function decodeCursorRule(name: string, content: Buffer): Buffer | null {
  const prefix = cursorRulePrefix(name);
  return content.subarray(0, prefix.length).equals(prefix)
    ? content.subarray(prefix.length)
    : null;
}

/**
 * Materialize resolved rules and prune rules that left the manifest, with the
 * same managed-vs-hand-authored semantics as syncSkillsDir. Cursor rules are
 * written as always-on `.mdc`; other rule directories use plain `.md`. The
 * rules directory is only created when rules exist.
 */
export function syncRulesDir(options: SyncRulesOptions): SyncResult {
  const { rulesDir, rules, previousLock, cursorRules = false, force } = options;
  const managed = new Set<string>(Object.keys(previousLock?.rules ?? {}));
  const result: SyncResult = { installed: [], unchanged: [], pruned: [] };
  const currentNames = new Set(rules.map((rule) => rule.name));

  for (const rule of rules) {
    const target = ruleFile(rulesDir, rule.name, cursorRules);
    const content = cursorRules ? encodeCursorRule(rule.name, rule.content) : rule.content;
    if (existsSync(target)) {
      if (readFileSync(target).equals(content)) {
        result.unchanged.push(rule.name);
        continue;
      }
      if (!managed.has(rule.name) && !force) {
        throw new InstallError(
          `${target} already exists and was not installed by skillfold. ` +
            `Move it aside, pick another name, or rerun with --force to overwrite it.`
        );
      }
    }
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(target, content);
    result.installed.push(rule.name);
  }

  for (const name of managed) {
    if (currentNames.has(name)) continue;
    const target = ruleFile(rulesDir, name, cursorRules);
    if (existsSync(target)) {
      rmSync(target, { force: true });
      result.pruned.push(name);
    }
  }

  return result;
}

/**
 * Verify one rule's installed content against its source (local) or the
 * lockfile hash (remote). `where` names the install location for messages.
 */
function ruleProblem(
  name: string,
  sourceString: string,
  installed: Buffer,
  lock: Lockfile,
  baseDir: string,
  where: string
): string | null {
  const source = parseSource(sourceString);
  if (source.kind === "local") {
    const sourcePath = resolvePath(baseDir, source.path);
    if (!existsSync(sourcePath)) {
      return `rule "${name}" source file is missing: ${source.path}`;
    }
    if (!readFileSync(sourcePath).equals(installed)) {
      return `rule "${name}" in ${where} is out of date with ${source.path} (run "skillfold install")`;
    }
    return null;
  }
  const entry = lock.rules[name];
  if (entry?.integrity && entry.integrity !== computeFileIntegrity(installed)) {
    return `rule "${name}" in ${where} does not match the lockfile (run "skillfold install")`;
  }
  return null;
}

function checkSkillsDir(
  manifest: Manifest,
  lock: Lockfile,
  baseDir: string,
  skillsDir: string,
  label: string,
  problems: string[]
): void {
  const bodies = new Map<string, ComposeInput>();

  for (const [name, sourceString] of Object.entries(manifest.skills)) {
    const target = join(skillsDir, name);
    const installedFiles = readDirFiles(target);
    if (installedFiles.length === 0) {
      problems.push(`${label}"${name}" is not installed (run "skillfold install")`);
      continue;
    }
    for (const script of nonExecutableScripts(target, installedFiles)) {
      problems.push(`${label}"${name}/${script}" is not executable (run "skillfold install")`);
    }
    const installedIntegrity = computeIntegrity(installedFiles);
    const source = parseSource(sourceString);
    if (source.kind === "local") {
      const sourceFiles = readDirFiles(resolvePath(baseDir, source.path));
      if (sourceFiles.length === 0) {
        problems.push(`${label}"${name}" source directory is missing: ${source.path}`);
        continue;
      }
      // Installs rewrite the frontmatter name to the manifest name; apply
      // the same normalization before comparing against the source.
      if (computeIntegrity(normalizeSkillName(sourceFiles, name)) !== installedIntegrity) {
        problems.push(
          `${label}"${name}" is out of date with ${source.path} (run "skillfold install")`
        );
      }
    } else {
      const entry = lock.skills[name];
      if (entry?.integrity && entry.integrity !== installedIntegrity) {
        problems.push(
          `${label}"${name}" installed files do not match the lockfile (run "skillfold install")`
        );
      }
    }
    const skillMd = installedFiles.find((f) => f.path === "SKILL.md");
    if (skillMd) {
      const { attrs, body } = parseFrontmatter(skillMd.content.toString("utf-8"));
      bodies.set(name, {
        name,
        description: typeof attrs.description === "string" ? attrs.description : "",
        body,
        allowedTools: parseAllowedTools(attrs),
        files: installedFiles.filter((f) => f.path !== "SKILL.md"),
      });
    }
  }

  // Regenerate composed skills from the installed inputs and compare.
  for (const name of composeOrder(manifest.compose)) {
    const entry = manifest.compose[name];
    const target = join(skillsDir, name);
    const installedFiles = readDirFiles(target);
    if (installedFiles.length === 0) {
      problems.push(`${label}composed skill "${name}" is not installed (run "skillfold install")`);
      continue;
    }
    for (const script of nonExecutableScripts(target, installedFiles)) {
      problems.push(`${label}"${name}/${script}" is not executable (run "skillfold install")`);
    }
    const inputs: ComposeInput[] = [];
    let missingInput = false;
    for (const dep of entry.use) {
      const input = bodies.get(dep);
      if (!input) {
        missingInput = true;
        break;
      }
      inputs.push(input);
    }
    if (missingInput) continue; // the missing dep is already reported
    let regenerated;
    try {
      regenerated = generateComposedSkill(name, entry, inputs);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
      continue;
    }
    bodies.set(name, {
      name,
      description: regenerated.description,
      body: regenerated.body,
      allowedTools: parseAllowedTools(regenerated.attrs),
      files: regenerated.files.filter((f) => f.path !== "SKILL.md"),
    });
    if (computeIntegrity(regenerated.files) !== computeIntegrity(installedFiles)) {
      problems.push(
        `${label}composed skill "${name}" is out of date (run "skillfold install")`
      );
    }
  }
}

function checkRulesDir(
  manifest: Manifest,
  lock: Lockfile,
  baseDir: string,
  rulesDir: string,
  cursorRules: boolean,
  label: string,
  problems: string[]
): void {
  for (const name of Object.keys(lock.rules)) {
    if (!manifest.rules[name] && existsSync(ruleFile(rulesDir, name, cursorRules))) {
      problems.push(`${label}rule "${name}" is installed but not selected (run "skillfold install")`);
    }
  }
  for (const [name, sourceString] of Object.entries(manifest.rules)) {
    const target = ruleFile(rulesDir, name, cursorRules);
    if (!existsSync(target)) {
      problems.push(`${label}rule "${name}" is not installed (run "skillfold install")`);
      continue;
    }
    const installed = readFileSync(target);
    const sourceContent = cursorRules ? decodeCursorRule(name, installed) : installed;
    if (!sourceContent) {
      problems.push(`${label}rule "${name}" has invalid Cursor metadata (run "skillfold install")`);
      continue;
    }
    const problem = ruleProblem(name, sourceString, sourceContent, lock, baseDir, "the rules directory");
    if (problem) problems.push(label + problem);
  }
}

function checkAgentsMdRules(
  manifest: Manifest,
  lock: Lockfile,
  baseDir: string,
  agentsMdPath: string,
  label: string,
  problems: string[]
): void {
  const ruleNames = Object.keys(manifest.rules);
  const exists = existsSync(agentsMdPath);
  if (!exists) {
    if (ruleNames.length > 0) {
      problems.push(`${label}${agentsMdPath} is missing the rules block (run "skillfold install")`);
    }
    return;
  }
  let block;
  try {
    block = extractRulesBlock(readFileSync(agentsMdPath, "utf-8"), agentsMdPath);
  } catch (err) {
    problems.push(label + (err instanceof Error ? err.message : String(err)));
    return;
  }
  if (ruleNames.length === 0) {
    if (block) {
      problems.push(
        `${label}${agentsMdPath} still contains a skillfold rules block (run "skillfold install")`
      );
    }
    return;
  }
  if (!block) {
    problems.push(`${label}${agentsMdPath} is missing the rules block (run "skillfold install")`);
    return;
  }
  const installed = new Map(block.map((rule) => [rule.name, rule.content]));
  for (const [name, sourceString] of Object.entries(manifest.rules)) {
    const content = installed.get(name);
    if (!content) {
      problems.push(
        `${label}rule "${name}" is missing from ${agentsMdPath} (run "skillfold install")`
      );
      continue;
    }
    const problem = ruleProblem(name, sourceString, content, lock, baseDir, agentsMdPath);
    if (problem) problems.push(label + problem);
  }
  for (const rule of block) {
    if (!manifest.rules[rule.name]) {
      problems.push(
        `${label}rule "${rule.name}" in ${agentsMdPath} is not in the manifest (run "skillfold install")`
      );
    }
  }
}

/**
 * Offline verification that manifest, lockfile, and installed files agree,
 * across every target layout. Returns human-readable problems; empty means
 * everything is in sync.
 *
 * Checks, in order:
 *   - the lockfile covers exactly the manifest (sources unchanged)
 *   - every skill is installed in every layout's skills directory
 *   - remote skills on disk match the lockfile's content hash
 *   - local skills on disk match their source directory
 *   - composed skills on disk match what the installed inputs would generate
 *   - rules match their source / lock hash, in the rules directory and in
 *     the AGENTS.md managed block, per layout
 *   - `@installed` npm sources are pinned to the installed package version
 */
export function checkProject(
  manifest: Manifest,
  lock: Lockfile | null,
  baseDir: string,
  layouts: TargetLayout[],
  installed: InstalledLookup = {}
): string[] {
  const problems = lockfileProblems(manifest, lock);
  if (!lock) return problems;
  for (const section of ["skills", "rules"] as const) {
    for (const [name, sourceString] of Object.entries(manifest[section])) {
      const entry = lock[section][name];
      if (!entry || entry.source !== sourceString) continue;
      const label = section === "skills" ? `"${name}"` : `rule "${name}"`;
      const drift = installedDrift(label, sourceString, entry.resolved, baseDir, installed);
      if (drift) problems.push(drift);
    }
  }
  for (const layout of layouts) {
    const label = layouts.length > 1 ? `[${layout.target}] ` : "";
    const selected = manifestForTarget(manifest, layout.target);
    const selectedLock = lockForTarget(lock, layout.target) ?? { ...lock, rules: {} };
    checkSkillsDir(selected, lock, baseDir, layout.skillsDir, label, problems);
    if (layout.rulesDir) {
      checkRulesDir(
        selected,
        selectedLock,
        baseDir,
        layout.rulesDir,
        layout.cursorRules ?? false,
        label,
        problems
      );
    }
    if (layout.agentsMdPath) {
      checkAgentsMdRules(selected, lock, baseDir, layout.agentsMdPath, label, problems);
    }
    if (!layout.rulesDir && !layout.agentsMdPath && Object.keys(selected.rules).length > 0) {
      problems.push(
        `${label}${layout.target} rules cannot be installed in global mode; ` +
          "Cursor user rules are managed in Customize > Rules"
      );
    }
  }
  return problems;
}
