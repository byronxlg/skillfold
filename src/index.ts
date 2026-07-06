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
  DEFAULT_SKILLS_DIR,
  loadManifest,
  MANIFEST_FILENAME,
  parseManifest,
  removeSkillFromManifest,
  validateSkillName,
  type ComposeEntry,
  type Manifest,
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
  type ResolvedSkill,
  type ResolveOptions,
  type ResolveResult,
} from "./resolve.js";
export {
  checkProject,
  syncSkillsDir,
  type SyncOptions,
  type SyncResult,
} from "./install.js";
export { initProject, type InitResult } from "./init.js";
export { renderRows, skillRows, type SkillRow, type SkillStatus } from "./list.js";
export { renderSearchHits, searchSkills, type SearchHit } from "./search.js";
export { cacheRoot, githubCacheDir, npmCacheDir } from "./cache.js";
export {
  fetchGitHubSkill,
  resolveGitHubRef,
  type Fetcher,
  type GitHubFetchResult,
  type GitHubOptions,
} from "./github.js";
export {
  findInstalledPackage,
  resolveNpmSkill,
  resolveNpmVersion,
  type NpmOptions,
  type NpmResolveResult,
} from "./npm.js";
