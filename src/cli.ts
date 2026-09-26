#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

import { syncAgentsMd } from "./agentsmd.js";
import { globalConfigDir, globalConfigRoot, migrateGlobalConfig } from "./config.js";
import { SkillfoldError } from "./errors.js";
import { initProject } from "./init.js";
import {
  checkProject,
  ruleFile,
  syncRulesDir,
  syncSkillsDir,
  type SyncResult,
} from "./install.js";
import { renderRows, skillRows } from "./list.js";
import { LOCK_FILENAME, readLockfile, writeLockfile, type Lockfile } from "./lock.js";
import {
  addSkillToManifest,
  loadManifest,
  MANIFEST_FILENAME,
  removeSkillFromManifest,
  validateSkillName,
  type Manifest,
} from "./manifest.js";
import {
  resolveManifest,
  resolveSingle,
  type ResolvedRule,
  type ResolvedSkill,
} from "./resolve.js";
import { renderSearchHits, searchSkills } from "./search.js";
import { defaultSkillName, parseSource } from "./source.js";
import { displayPath, lockForTarget, ruleApplies, shadowedSkillWarnings, skillTargets, targetLayouts, type TargetLayout } from "./targets.js";

const HELP = `skillfold - declarative skill manager for Claude config

Declare skills (and rules) in ${MANIFEST_FILENAME}, pin them in ${LOCK_FILENAME},
install them into .claude/skills and .claude/rules.

Usage
  skillfold <command> [options]

Commands
  migrate -g          Copy legacy global config to ~/.config/skillfold
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
  -g, --global        Use global config in ~/.config/skillfold (or XDG_CONFIG_HOME)
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
    ? globalConfigRoot()
    : resolvePath(flags.dir ?? process.cwd());
  return {
    root,
    manifestPath: join(root, MANIFEST_FILENAME),
    lockPath: join(root, LOCK_FILENAME),
    global: flags.global,
  };
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

/** Union of per-layout sync results: changed anywhere counts as changed. */
function mergeSyncs(syncs: SyncResult[]): SyncResult {
  const installed = new Set<string>();
  const pruned = new Set<string>();
  const unchanged = new Set<string>();
  for (const sync of syncs) {
    for (const name of sync.installed) installed.add(name);
    for (const name of sync.pruned) pruned.add(name);
    for (const name of sync.unchanged) unchanged.add(name);
  }
  for (const name of installed) {
    unchanged.delete(name);
    pruned.delete(name);
  }
  return { installed: [...installed], unchanged: [...unchanged], pruned: [...pruned] };
}

function printSync(
  resolved: ResolvedSkill[],
  sync: SyncResult,
  rules: ResolvedRule[],
  rulesSync: SyncResult,
  layouts: TargetLayout[],
  root: string
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
  const rulesUnchanged = new Set(rulesSync.unchanged);
  for (const rule of rules) {
    const marker = rulesUnchanged.has(rule.name) ? "=" : "+";
    console.log(`  ${marker} ${`${rule.name} (rule)`.padEnd(24)} ${rule.source}${describePin(rule)}`);
  }
  for (const name of rulesSync.pruned) {
    console.log(`  - ${`${name} (rule)`.padEnd(24)} removed`);
  }
  const dirs: string[] = [];
  const withRules = rules.length > 0 || rulesSync.pruned.length > 0;
  for (const layout of layouts) {
    dirs.push(relative(root, layout.skillsDir) || ".");
    if (!withRules) continue;
    if (layout.rulesDir) dirs.push(relative(root, layout.rulesDir) || ".");
    if (layout.agentsMdPath) dirs.push(relative(root, layout.agentsMdPath) || ".");
  }
  const installed = sync.installed.length + rulesSync.installed.length;
  const same = sync.unchanged.length + rulesSync.unchanged.length;
  const pruned = sync.pruned.length + rulesSync.pruned.length;
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
  const layouts = targetLayouts(manifest, paths.root, paths.global);
  const unsupportedRules = layouts.find(
    (layout) =>
      !layout.rulesDir &&
      !layout.agentsMdPath &&
      rules.some((rule) => ruleApplies(manifest, rule.name, layout.target))
  );
  if (unsupportedRules) {
    throw new SkillfoldError(
      `${unsupportedRules.target} rules cannot be installed in global mode; ` +
        "Cursor user rules are managed in Customize > Rules"
    );
  }
  const skillSyncs: SyncResult[] = [];
  const ruleSyncs: SyncResult[] = [];
  for (const layout of layouts) {
    // A layout the lockfile has never installed for has no managed names:
    // whatever already sits there is hand-authored until skillfold owns it.
    const layoutLock = lockForTarget(lock, layout.target);
    skillSyncs.push(
      syncSkillsDir({
        skillsDir: layout.skillsDir,
        resolved: resolved.filter((skill) => skillTargets(manifest, skill.name).includes(layout.target)),
        previousLock: layoutLock,
        force: options.force,
      })
    );
    if (layout.rulesDir) {
      ruleSyncs.push(
        syncRulesDir({
          rulesDir: layout.rulesDir,
          rules: rules.filter((rule) => ruleApplies(manifest, rule.name, layout.target)),
          previousLock: layoutLock,
          cursorRules: layout.cursorRules,
          force: options.force,
        })
      );
    }
    if (layout.agentsMdPath) {
      ruleSyncs.push(syncAgentsMd(layout.agentsMdPath, rules.filter((rule) => ruleApplies(manifest, rule.name, layout.target))));
    }
  }
  printSync(resolved, mergeSyncs(skillSyncs), rules.filter((rule) => layouts.some((layout) => ruleApplies(manifest, rule.name, layout.target))), mergeSyncs(ruleSyncs), layouts, paths.root);
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

/** User-level shadowing notes for project mode; empty in global mode. */
function shadowWarnings(paths: Paths, manifest: Manifest): string[] {
  if (paths.global) return [];
  const globalRoot = globalConfigRoot();
  if (paths.root === globalRoot) return [];
  return shadowedSkillWarnings(manifest, targetLayouts(manifest, globalRoot, true));
}

function cmdCheck(paths: Paths): void {
  const manifest = loadManifest(paths.manifestPath);
  const lock = readLockfile(paths.lockPath);
  const layouts = targetLayouts(manifest, paths.root, paths.global);
  const problems = checkProject(manifest, lock, paths.root, layouts);
  for (const warning of shadowWarnings(paths, manifest)) {
    console.error(`warning: ${warning}`);
  }
  if (problems.length > 0) {
    console.error("skillfold check failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  const fmWarnings = skillRows(manifest, lock, paths.root, layouts).filter(
    (row) => row.status === "ok" && row.warning
  );
  if (fmWarnings.length > 0) {
    const n = fmWarnings.length;
    console.error(
      `warning: ${n} skill${n === 1 ? "" : "s"} ` +
        `${n === 1 ? "has a frontmatter issue" : "have frontmatter issues"} (see list)`
    );
  }
  const skillCount =
    Object.keys(manifest.skills).length + Object.keys(manifest.compose).length;
  const ruleCount = Object.keys(manifest.rules).filter((name) => layouts.some((layout) => ruleApplies(manifest, name, layout.target))).length;
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
  const layouts = targetLayouts(manifest, paths.root, paths.global);
  console.log(renderRows(skillRows(manifest, lock, paths.root, layouts)));
  for (const warning of shadowWarnings(paths, manifest)) {
    console.error(`warning: ${warning}`);
  }
}

function cmdInfo(paths: Paths, args: string[]): void {
  if (args.length !== 1) {
    throw new SkillfoldError("usage: skillfold info <name>");
  }
  const name = args[0];
  const manifest = loadManifest(paths.manifestPath);
  const lock = readLockfile(paths.lockPath);
  const layouts = targetLayouts(manifest, paths.root, paths.global);
  const rows = skillRows(manifest, lock, paths.root, layouts).filter(
    (row) => row.name === name
  );
  if (rows.length === 0) {
    throw new SkillfoldError(`"${name}" is not in the manifest`);
  }
  const row = rows[0];
  const lockEntry = row.kind === "rule" ? lock?.rules[name] : lock?.skills[name];
  const installPaths = layouts.flatMap((layout) => {
    if (row.kind !== "rule") return skillTargets(manifest, name).includes(layout.target) ? [join(layout.skillsDir, name)] : [];
    if (!ruleApplies(manifest, name, layout.target)) return [];
    if (layout.rulesDir) return [ruleFile(layout.rulesDir, name, layout.cursorRules)];
    if (layout.agentsMdPath) return [`${layout.agentsMdPath} (rules block)`];
    return [];
  });
  const lines = [
    `name:      ${row.name}`,
    `source:    ${row.source}`,
    ...(lockEntry?.resolved ? [`resolved:  ${lockEntry.resolved}`] : []),
    ...(lockEntry?.integrity ? [`integrity: ${lockEntry.integrity}`] : []),
    `status:    ${row.status}`,
    ...(manifest.ruleOptions?.[name]?.hosts ? [`hosts:     ${manifest.ruleOptions[name].hosts.join(", ")}`] : []),
    ...installPaths.map((p, i) => `${i === 0 ? "installed:" : "          "} ${p}`),
  ];
  console.log(lines.join("\n"));
}

/** Project-relative inside the project, ~/... anywhere else. */
function installPath(path: string, root: string): string {
  const rel = relative(root, path);
  return rel && !rel.startsWith("..") ? rel : displayPath(path);
}

/** Where each declared target installs skills and rules. */
function renderTargets(layouts: TargetLayout[], root: string): string {
  const lines = [`targets: ${layouts.map((layout) => layout.target).join(", ")}`];
  for (const layout of layouts) {
    const destinations = [`skills -> ${installPath(layout.skillsDir, root)}`];
    if (layout.rulesDir) destinations.push(`rules  -> ${installPath(layout.rulesDir, root)}`);
    if (layout.agentsMdPath) destinations.push(`rules  -> ${installPath(layout.agentsMdPath, root)} (managed block)`);
    for (const [i, destination] of destinations.entries()) {
      const label = layouts.length > 1 ? (i === 0 ? layout.target : "").padEnd(8) : "";
      lines.push(`  ${label}${destination}`);
    }
  }
  lines.push(
    `  edit the "targets:" line in ${MANIFEST_FILENAME} to add codex or cursor`
  );
  return lines.join("\n");
}

/**
 * Short command tour after init. The scaffolded manifest carries the full
 * list in its header comments, so this stays the immediate next steps.
 */
function renderGettingStarted(global: boolean): string {
  const g = global ? " -g" : "";
  const rows: [string, string][] = [
    [`skillfold install${g}`, `install every declared skill, write ${LOCK_FILENAME}`],
    [`skillfold add${g} npm:skillfold/planning`, "add a skill from the skillfold library"],
    ["skillfold search <query>", "find more published skills on npm"],
  ];
  const width = Math.max(...rows.map(([command]) => command.length));
  return [
    "next",
    ...rows.map(([command, description]) => `  ${command.padEnd(width)}  ${description}`),
    "",
    `${MANIFEST_FILENAME} lists every command, source format, and starter skill in its header.`,
  ].join("\n");
}

function cmdInit(paths: Paths): void {
  const result = initProject(paths.root);
  console.log(`created ${relative(paths.root, result.manifestPath) || MANIFEST_FILENAME}`);
  console.log(`created ${relative(paths.root, result.skillPath)}`);
  const layouts = targetLayouts(loadManifest(paths.manifestPath), paths.root, paths.global);
  console.log(`\n${renderTargets(layouts, paths.root)}`);
  console.log(`\n${renderGettingStarted(paths.global)}`);
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

  if (command === "migrate") {
    if (!flags.global || flags.dir || args.length > 0 || flags.frozen || flags.force) {
      throw new SkillfoldError("usage: skillfold migrate -g");
    }
    const destination = migrateGlobalConfig();
    console.log(`copied global config to ${destination}`);
    console.log('legacy files retained; global commands now use the new config. Run "skillfold check -g".');
    return;
  }
  const paths = projectPaths(flags);
  if (flags.global && paths.root !== globalConfigDir()) {
    console.error('warning: using legacy ~/.claude/skillfold.yaml; run "skillfold migrate -g" to move config to ~/.config/skillfold (or XDG_CONFIG_HOME)');
  }

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
  // A reader that closes the pipe early (e.g. `skillfold list | head`) makes
  // the next stdout write emit EPIPE; exit quietly instead of crashing.
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
  main().catch((err) => {
    if (err instanceof SkillfoldError) {
      console.error(`error: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  });
}
