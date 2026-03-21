import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const NPM_PREFIX = "npm:";

export function isNpmRef(ref: string): boolean {
  return ref.startsWith(NPM_PREFIX);
}

export function parseNpmRef(ref: string): { packageName: string; subpath: string } {
  const raw = ref.slice(NPM_PREFIX.length);
  // Handle scoped packages: @scope/pkg/sub/path
  if (raw.startsWith("@")) {
    const parts = raw.split("/");
    if (parts.length < 2) {
      return { packageName: raw, subpath: "" };
    }
    const packageName = parts.slice(0, 2).join("/");
    const subpath = parts.slice(2).join("/");
    return { packageName, subpath };
  }
  // Unscoped: pkg/sub/path
  const slashIndex = raw.indexOf("/");
  if (slashIndex === -1) return { packageName: raw, subpath: "" };
  return { packageName: raw.slice(0, slashIndex), subpath: raw.slice(slashIndex + 1) };
}

/**
 * Resolve the root directory of an npm package using Node's module resolution.
 * Falls back to a direct node_modules lookup if require.resolve fails.
 */
export function resolveNpmPackageDir(packageName: string, baseDir: string): string {
  const directPath = join(baseDir, "node_modules", packageName);
  try {
    const require = createRequire(join(baseDir, "package.json"));
    const pkgJsonPath = require.resolve(`${packageName}/package.json`);
    return dirname(pkgJsonPath);
  } catch {
    // Fall back to direct path (let the caller handle file-not-found)
    return directPath;
  }
}

/**
 * Resolve an npm: import reference to a local file path.
 * - `npm:pkg` -> node_modules/pkg/skillfold.yaml
 * - `npm:pkg/custom.yaml` -> node_modules/pkg/custom.yaml
 * - `npm:@scope/pkg` -> node_modules/@scope/pkg/skillfold.yaml
 * - `npm:@scope/pkg/custom.yaml` -> node_modules/@scope/pkg/custom.yaml
 */
export function resolveNpmImportPath(ref: string, baseDir: string): string {
  const { packageName, subpath } = parseNpmRef(ref);
  const pkgDir = resolveNpmPackageDir(packageName, baseDir);
  if (subpath) return join(pkgDir, subpath);
  return join(pkgDir, "skillfold.yaml");
}

/**
 * Resolve an npm: skill reference to a local directory path.
 * - `npm:pkg/skills/planning` -> node_modules/pkg/skills/planning
 * - `npm:@scope/pkg/skills/planning` -> node_modules/@scope/pkg/skills/planning
 * - `npm:pkg` -> node_modules/pkg (package root)
 */
export function resolveNpmSkillPath(ref: string, baseDir: string): string {
  const { packageName, subpath } = parseNpmRef(ref);
  const pkgDir = resolveNpmPackageDir(packageName, baseDir);
  if (subpath) return join(pkgDir, subpath);
  return pkgDir;
}
