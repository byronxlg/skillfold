/**
 * Error hierarchy for skillfold.
 *
 * Every error carries a message that is safe to print directly to the
 * terminal. Errors raised for a specific skill include the skill name.
 */

export class SkillfoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The skillfold.yaml manifest is missing, malformed, or invalid. */
export class ManifestError extends SkillfoldError {}

/** A source string could not be parsed. */
export class SourceError extends SkillfoldError {
  constructor(source: string, reason: string) {
    super(`Invalid source "${source}": ${reason}`);
  }
}

/** A skill could not be resolved or fetched. */
export class ResolveError extends SkillfoldError {
  readonly skill: string;

  constructor(skill: string, reason: string) {
    super(`Cannot resolve skill "${skill}": ${reason}`);
    this.skill = skill;
  }
}

/** The lockfile is missing, malformed, or out of sync with the manifest. */
export class LockError extends SkillfoldError {}

/** Installing into the skills directory failed or would clobber unmanaged files. */
export class InstallError extends SkillfoldError {}

/** `skillfold check` found drift between manifest, lock, and installed skills. */
export class CheckError extends SkillfoldError {}
