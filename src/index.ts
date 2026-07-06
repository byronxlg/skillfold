/**
 * skillfold public API.
 *
 * The CLI is a thin layer over these functions; everything it does is
 * available programmatically:
 *
 *   import { loadManifest, resolveManifest, syncSkillsDir } from "skillfold";
 */

export {
  CheckError,
  InstallError,
  LockError,
  ManifestError,
  ResolveError,
  SkillfoldError,
  SourceError,
} from "./errors.js";
export {
  defaultSkillName,
  extractRef,
  formatSource,
  isCommitSha,
  isFullSha,
  parseSource,
  type GitHubSource,
  type LocalSource,
  type NpmSource,
  type Source,
} from "./source.js";
export {
  computeFileIntegrity,
  computeIntegrity,
  normalizeSkillName,
  parseAllowedTools,
  parseFrontmatter,
  readDirFiles,
  readSkillDir,
  renameSkill,
  type SkillContent,
  type SkillFile,
} from "./skill.js";
export {
  addSkillToManifest,
  DEFAULT_RULES_DIR,
  DEFAULT_SKILLS_DIR,
  TARGET_NAMES,
  loadManifest,
  MANIFEST_FILENAME,
  parseManifest,
  removeSkillFromManifest,
  validateSkillName,
  type ComposeEntry,
  type Manifest,
  type TargetName,
} from "./manifest.js";
export {
  emptyLockfile,
  LOCK_FILENAME,
  lockfileProblems,
  readLockfile,
  serializeLockfile,
  writeLockfile,
  type LockComposeEntry,
  type Lockfile,
  type LockSkillEntry,
} from "./lock.js";
export {
  composeAllowedTools,
  composeBody,
  composeOrder,
  defaultComposeDescription,
  generateComposedSkill,
  type ComposeInput,
} from "./compose.js";
export {
  resolveManifest,
  resolveSingle,
  type ResolvedRule,
  type ResolvedSkill,
  type ResolveOptions,
  type ResolveResult,
} from "./resolve.js";
export {
  checkProject,
  ruleFile,
  syncRulesDir,
  syncSkillsDir,
  type SyncOptions,
  type SyncResult,
  type SyncRulesOptions,
} from "./install.js";
export {
  buildRulesBlock,
  extractRulesBlock,
  syncAgentsMd,
  upsertRulesBlock,
  type AgentsMdSyncResult,
  type RuleContent,
} from "./agentsmd.js";
export {
  resolveTargets,
  shadowedSkillWarnings,
  targetLayouts,
  type TargetLayout,
} from "./targets.js";
export { initProject, type InitResult } from "./init.js";
export { renderRows, skillRows, type SkillRow, type SkillStatus } from "./list.js";
export { renderSearchHits, searchSkills, type SearchHit } from "./search.js";
export { cacheRoot, githubCacheDir, npmCacheDir } from "./cache.js";
export {
  fetchGitHubFile,
  fetchGitHubSkill,
  resolveGitHubRef,
  type Fetcher,
  type GitHubFetchResult,
  type GitHubFileResult,
  type GitHubOptions,
} from "./github.js";
export {
  findInstalledPackage,
  resolveNpmFile,
  resolveNpmSkill,
  resolveNpmVersion,
  type NpmFileResult,
  type NpmOptions,
  type NpmResolveResult,
} from "./npm.js";
