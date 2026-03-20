export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class ResolveError extends Error {
  constructor(skill: string, message: string) {
    super(`Skill "${skill}": ${message}`);
    this.name = "ResolveError";
  }
}

export class CompileError extends Error {
  constructor(skill: string, message: string) {
    super(`Skill "${skill}": ${message}`);
    this.name = "CompileError";
  }
}

export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}

/**
 * Compute Levenshtein distance between two strings.
 * Used to power "Did you mean..." suggestions in error messages.
 */
export function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;

  // Short-circuit: if either string is empty, the distance is the other's length
  if (la === 0) return lb;
  if (lb === 0) return la;

  // Use a single-row DP approach for space efficiency
  const prev = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= lb; j++) {
      const temp = prev[j];
      if (a[i - 1] === b[j - 1]) {
        prev[j] = prevDiag;
      } else {
        prev[j] = 1 + Math.min(prevDiag, prev[j - 1], prev[j]);
      }
      prevDiag = temp;
    }
  }

  return prev[lb];
}

/**
 * Find the closest match from a list of candidates.
 * Returns the best match if its Levenshtein distance is at most `maxDistance`
 * (default: 3), or undefined if no match is close enough.
 */
export function suggest(
  input: string,
  candidates: Iterable<string>,
  maxDistance = 3,
): string | undefined {
  let best: string | undefined;
  let bestDist = maxDistance + 1;

  for (const candidate of candidates) {
    const dist = levenshtein(input, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}

/**
 * Format a "Did you mean ..." suffix. Returns an empty string if no suggestion.
 */
export function didYouMean(
  input: string,
  candidates: Iterable<string>,
): string {
  const match = suggest(input, candidates);
  return match ? `. Did you mean "${match}"?` : "";
}
