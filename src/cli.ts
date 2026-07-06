#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

import { SkillfoldError } from "./errors.js";
import { initProject } from "./init.js";
import { checkProject, syncRulesDir, syncSkillsDir, type SyncResult } from "./install.js";
import { LOCK_FILENAME, readLockfile, writeLockfile, type Lockfile } from "./lock.js";
import {
  addSkillToManifest,
  DEFAULT_RULES_DIR,
  DEFAULT_SKILLS_DIR,
  loadManifest,
  MANIFEST_FILENAME,
  removeSkillFromManifest,
  validateSkillName,
  type Manifest,
} from "./manifest.js";
import { renderRows, skillRows } from "./list.js";
import {
  resolveManifest,
  resolveSingle,
  type ResolvedRule,
  type ResolvedSkill,
} from "./resolve.js";
import { renderSearchHits, searchSkills } from "./search.js";
import { defaultSkillName, parseSource } from "./source.js";

const HELP = `skillfold - declarative skill manager for Claude config

Declare skills (and rules) in ${MANIFEST_FILENAME}, pin them in ${LOCK_FILENAME},
install them into .claude/skills and .claude/rules.

Usage
  skillfold <command> [options]

Commands
  init                Create a starter ${MANIFEST_FILENAME}
  add <source>        Add a skill to the manifest and install it
  remove <name>       Remove a skill and uninstall it
  install             Install every declared skill and write the lockfile
  update [name...]    Re-resolve pinned refs (all skills, or just the named ones)
  check               Verify manifest, lockfile, and installed skills agree
  list                Show declared skills and their status
  info <name>         Show details for one skill
  search [query]      Search npm for published skills

Options
  --dir <path>        Project directory (default: current directory)
  -g, --global        Manage ~/.claude/skills instead of the project
  --name <name>       Skill name for "add" (default: from SKILL.md)
  --frozen            Install exactly what the lockfile pins; fail on drift (CI)
  --force             Overwrite skill directories skillfold does not manage
  -v, --version       Print version
  -h, --help          Show this help

Sources
  ./skills/my-skill                         local directory
  github:owner/repo/path/to/skill@v1.2.0    GitHub (tag, branch, or commit SHA)
  npm:package/skill-name@1.0.0              npm package

Examples
  skillfold init
  skillfold add github:anthropics/skills/frontend-design
  skillfold add npm:skillfold/code-review --name reviewer
  skillfold install --frozen
`;

interface Flags {
  dir?: string;
  global: boolean;
  name?: string;
  frozen: boolean;
  force: boolean;
  help: boolean;
  version: boolean;
}

interface Parsed {
  command?: string;
  args: string[];
  flags: Flags;
}

function parseArgs(argv: string[]): Parsed {
  const flags: Flags = {
    global: false,
    frozen: false,
    force: false,
    help: false,
    version: false,
  };
  const args: string[] = [];
  let command: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dir":
        flags.dir = argv[++i];
        if (!flags.dir) throw new SkillfoldError("--dir needs a path");
        break;
      case "-g":
      case "--global":
        flags.global = true;
        break;
      case "--name":
        flags.name = argv[++i];
        if (!flags.name) throw new SkillfoldError("--name needs a value");
        break;
      case "--frozen":
        flags.frozen = true;
        break;
      case "--force":
        flags.force = true;
        break;
      case "-h":
      case "--help":
        flags.help = true;
        break;
      case "-v":
      case "--version":
        flags.version = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new SkillfoldError(`unknown option "${arg}" (see skillfold --help)`);
        }
        if (command === undefined) command = arg;
        else args.push(arg);
    }
  }
  return { command, args, flags };
}

interface Paths {
  root: string;
  manifestPath: string;
  lockPath: string;
  global: boolean;
}

function projectPaths(flags: Flags): Paths {
  const root = flags.global
    ? join(homedir(), ".claude")
    : resolvePath(flags.dir ?? process.cwd());
  return {
    root,
    manifestPath: join(root, MANIFEST_FILENAME),
    lockPath: join(root, LOCK_FILENAME),
    global: flags.global,
  };
}

function skillsDirFor(paths: Paths, manifest: Manifest): string {
  const dir = manifest.skillsDir ?? (paths.global ? "skills" : DEFAULT_SKILLS_DIR);
  return resolvePath(paths.root, dir);
}

function rulesDirFor(paths: Paths, manifest: Manifest): string {
  const dir = manifest.rulesDir ?? (paths.global ? "rules" : DEFAULT_RULES_DIR);
  return resolvePath(paths.root, dir);
}

function version(): string {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8")
  ) as { version: string };
  return pkg.version;
}

function describePin(skill: ResolvedSkill | ResolvedRule): string {
  if (skill.kind === "compose") return "";
  if (!skill.resolved) return "";
  const source = parseSource(skill.resolved);
  if (source.kind === "github" && source.ref) return ` -> ${source.ref.slice(0, 7)}`;
  if (source.kind === "npm" && source.version) return ` -> ${source.version}`;
  return "";
}

function printSync(
  resolved: ResolvedSkill[],
  sync: SyncResult,
  skillsDir: string,
  root: string,
  rules: ResolvedRule[] = [],
  rulesSync: SyncResult | null = null,
  rulesDir?: string
): void {
  const unchanged = new Set(sync.unchanged);
  for (const skill of resolved) {
    const marker = unchanged.has(skill.name) ? "=" : "+";
    const label =
      skill.kind === "compose" ? "composed" : skill.source + describePin(skill);
    console.log(`  ${marker} ${skill.name.padEnd(24)} ${label}`);
  }
  for (const name of sync.pruned) {
    console.log(`  - ${name.padEnd(24)} removed`);
  }
  const rulesUnchanged = new Set(rulesSync?.unchanged ?? []);
  for (const rule of rules) {
    const marker = rulesUnchanged.has(rule.name) ? "=" : "+";
    console.log(`  ${marker} ${`${rule.name} (rule)`.padEnd(24)} ${rule.source}${describePin(rule)}`);
  }
  for (const name of rulesSync?.pruned ?? []) {
    console.log(`  - ${`${name} (rule)`.padEnd(24)} removed`);
  }
  const installed = sync.installed.length + (rulesSync?.installed.length ?? 0);
  const same = sync.unchanged.length + (rulesSync?.unchanged.length ?? 0);
  const pruned = sync.pruned.length + (rulesSync?.pruned.length ?? 0);
  const dirs = [relative(root, skillsDir) || "."];
  if (rulesSync && rulesDir && (rules.length > 0 || (rulesSync.pruned.length > 0))) {
    dirs.push(relative(root, rulesDir) || ".");
  }
  const parts = [`${installed} installed`, `${same} unchanged`];
  if (pruned > 0) parts.push(`${pruned} removed`);
  console.log(`\n${parts.join(", ")} -> ${dirs.join(", ")}`);
}

interface InstallRunOptions {
  frozen?: boolean;
  force?: boolean;
  update?: string[] | "all";
}

async function runInstall(paths: Paths, options: InstallRunOptions = {}): Promise<void> {
  const manifest = loadManifest(paths.manifestPath);
  const lock = readLockfile(paths.lockPath);
  const { resolved, rules, lock: newLock } = await resolveManifest(manifest, {
    baseDir: paths.root,
    lock,
    frozen: options.frozen,
    update: options.update,
  });
  const skillsDir = skillsDirFor(paths, manifest);
  const sync = syncSkillsDir({
    skillsDir,
    resolved,
    previousLock: lock,
    force: options.force,
  });
  const rulesDir = rulesDirFor(paths, manifest);
  const rulesSync = syncRulesDir({
    rulesDir,
    rules,
    previousLock: lock,
    force: options.force,
  });
  printSync(resolved, sync, skillsDir, paths.root, rules, rulesSync, rulesDir);
  if (!options.frozen) {
    writeLockfile(paths.lockPath, newLock);
    console.log(`lockfile: ${relative(paths.root, paths.lockPath) || LOCK_FILENAME}`);
  }
}

/** Turn a frontmatter name into a valid skill directory name, or undefined. */
function sanitizeName(raw: string): string | undefined {
  const name = raw
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  try {
    validateSkillName(name);
    return name;
  } catch {
    return undefined;
  }
}

async function cmdAdd(paths: Paths, args: string[], flags: Flags): Promise<void> {
  if (args.length !== 1) {
    throw new SkillfoldError('usage: skillfold add <source> [--name <name>]');
  }
  const sourceString = args[0];
  const single = await resolveSingle(sourceString, paths.root);
  const name =
    flags.name ??
    sanitizeName(single.skill.name) ??
    sanitizeName(defaultSkillName(parseSource(sourceString)));
  if (!name) {
    throw new SkillfoldError(
      `could not derive a skill name from ${sourceString}; pass one with --name`
    );
  }
  if (flags.name) validateSkillName(flags.name);
  addSkillToManifest(paths.manifestPath, name, single.source);
  console.log(`added ${name}: ${single.source}\n`);
  await runInstall(paths, { force: flags.force });
}

async function cmdRemove(paths: Paths, args: string[], flags: Flags): Promise<void> {
  if (args.length !== 1) {
    throw new SkillfoldError("usage: skillfold remove <name>");
  }
  const section = removeSkillFromManifest(paths.manifestPath, args[0]);
  console.log(`removed ${args[0]} from ${MANIFEST_FILENAME} (${section})\n`);
  await runInstall(paths, { force: flags.force });
}

function cmdCheck(paths: Paths): void {
  const manifest = loadManifest(paths.manifestPath);
  const lock = readLockfile(paths.lockPath);
  const skillsDir = skillsDirFor(paths, manifest);
  const rulesDir = rulesDirFor(paths, manifest);
  const problems = checkProject(manifest, lock, paths.root, skillsDir, rulesDir);
  if (problems.length > 0) {
    console.error("skillfold check failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  const skillCount =
    Object.keys(manifest.skills).length + Object.keys(manifest.compose).length;
  const ruleCount = Object.keys(manifest.rules).length;
  const counts = [`${skillCount} skill${skillCount === 1 ? "" : "s"}`];
  if (ruleCount > 0) counts.push(`${ruleCount} rule${ruleCount === 1 ? "" : "s"}`);
  console.log(`ok: ${counts.join(", ")} in sync`);
}

function cmdList(paths: Paths): void {
  const manifest = loadManifest(paths.manifestPath);
  let lock: Lockfile | null = null;
  try {
    lock = readLockfile(paths.lockPath);
  } catch {
    // A broken lockfile should not stop listing; statuses degrade to "not locked".
  }
  const skillsDir = skillsDirFor(paths, manifest);
  const rulesDir = rulesDirFor(paths, manifest);
  console.log(renderRows(skillRows(manifest, lock, paths.root, skillsDir, rulesDir)));
}

function cmdInfo(paths: Paths, args: string[]): void {
  if (args.length !== 1) {
    throw new SkillfoldError("usage: skillfold info <name>");
  }
  const name = args[0];
  const manifest = loadManifest(paths.manifestPath);
  const lock = readLockfile(paths.lockPath);
  const skillsDir = skillsDirFor(paths, manifest);
  const rulesDir = rulesDirFor(paths, manifest);
  const rows = skillRows(manifest, lock, paths.root, skillsDir, rulesDir).filter(
    (row) => row.name === name
  );
  if (rows.length === 0) {
    throw new SkillfoldError(`"${name}" is not in the manifest`);
  }
  const row = rows[0];
  const lockEntry = row.kind === "rule" ? lock?.rules[name] : lock?.skills[name];
  const lines = [
    `name:      ${row.name}`,
    `source:    ${row.source}`,
    ...(lockEntry?.resolved ? [`resolved:  ${lockEntry.resolved}`] : []),
    ...(lockEntry?.integrity ? [`integrity: ${lockEntry.integrity}`] : []),
    `status:    ${row.status}`,
    `installed: ${row.kind === "rule" ? join(rulesDir, `${name}.md`) : join(skillsDir, name)}`,
  ];
  console.log(lines.join("\n"));
}

function cmdInit(paths: Paths): void {
  const result = initProject(paths.root);
  console.log(`created ${relative(paths.root, result.manifestPath) || MANIFEST_FILENAME}`);
  console.log(`created ${relative(paths.root, result.skillPath)}`);
  console.log('\nnext: run "skillfold install"');
}

async function cmdSearch(args: string[]): Promise<void> {
  const query = args.join(" ") || undefined;
  const hits = await searchSkills(query);
  console.log(renderSearchHits(hits, query));
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { command, args, flags } = parseArgs(argv);

  if (flags.version) {
    console.log(version());
    return;
  }
  if (flags.help || command === undefined || command === "help") {
    console.log(HELP);
    return;
  }

  const paths = projectPaths(flags);

  switch (command) {
    case "init":
      cmdInit(paths);
      break;
    case "add":
      await cmdAdd(paths, args, flags);
      break;
    case "remove":
    case "rm":
      await cmdRemove(paths, args, flags);
      break;
    case "install":
    case "i":
    case "sync":
      await runInstall(paths, { frozen: flags.frozen, force: flags.force });
      break;
    case "update":
    case "up":
      await runInstall(paths, {
        force: flags.force,
        update: args.length > 0 ? args : "all",
      });
      break;
    case "check":
      cmdCheck(paths);
      break;
    case "list":
    case "ls":
      cmdList(paths);
      break;
    case "info":
      cmdInfo(paths, args);
      break;
    case "search":
      await cmdSearch(args);
      break;
    default:
      throw new SkillfoldError(`unknown command "${command}" (see skillfold --help)`);
  }
}

function invokedDirectly(): boolean {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main().catch((err) => {
    if (err instanceof SkillfoldError) {
      console.error(`error: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  });
}
