import { ConfigError, didYouMean } from "./errors.js";

export interface IntegrationLocation {
  type: string;
  config: Record<string, string>;
}

export interface IntegrationType {
  name: string;
  requiredFields: string[];
  optionalFields: string[];
  resolveUrl(config: Record<string, string>): string;
  renderInstructions(config: Record<string, string>): string;
}

const githubIssues: IntegrationType = {
  name: "github-issues",
  requiredFields: ["repo"],
  optionalFields: ["label", "assignee"],
  resolveUrl(config) {
    return `https://github.com/${config.repo}/issues`;
  },
  renderInstructions(config) {
    const parts = [`GitHub issues in ${config.repo}`];
    if (config.label) parts.push(`labeled "${config.label}"`);
    if (config.assignee) parts.push(`assigned to ${config.assignee}`);
    return parts.join(", ");
  },
};

const githubDiscussions: IntegrationType = {
  name: "github-discussions",
  requiredFields: ["repo"],
  optionalFields: ["category"],
  resolveUrl(config) {
    return `https://github.com/${config.repo}/discussions`;
  },
  renderInstructions(config) {
    const parts = [`GitHub discussions in ${config.repo}`];
    if (config.category) parts.push(`category "${config.category}"`);
    return parts.join(", ");
  },
};

const githubPullRequests: IntegrationType = {
  name: "github-pull-requests",
  requiredFields: ["repo"],
  optionalFields: ["state"],
  resolveUrl(config) {
    return `https://github.com/${config.repo}/pulls`;
  },
  renderInstructions(config) {
    const parts = [`GitHub pull requests in ${config.repo}`];
    if (config.state) parts.push(`state: ${config.state}`);
    return parts.join(", ");
  },
};

const INTEGRATIONS: Record<string, IntegrationType> = {
  "github-issues": githubIssues,
  "github-discussions": githubDiscussions,
  "github-pull-requests": githubPullRequests,
};

export const INTEGRATION_NAMES = new Set(Object.keys(INTEGRATIONS));

export function getIntegration(name: string): IntegrationType | undefined {
  return INTEGRATIONS[name];
}

/**
 * Detect whether a location object uses an integration type rather than
 * the traditional skill+path format. A location is an integration if it
 * has exactly one key that matches a known integration name (the value
 * is the integration config object).
 */
export function isIntegrationLocation(
  loc: Record<string, unknown>,
): boolean {
  // An integration location has a single key that is a known integration name
  // (plus an optional "kind" key). It must NOT have a "skill" key.
  if ("skill" in loc) return false;
  const keys = Object.keys(loc).filter((k) => k !== "kind");
  return keys.length === 1 && INTEGRATION_NAMES.has(keys[0]);
}

/**
 * Parse and validate an integration location from a raw YAML location object.
 * Throws ConfigError on invalid config.
 */
export function parseIntegrationLocation(
  fieldName: string,
  loc: Record<string, unknown>,
): IntegrationLocation {
  const integrationKeys = Object.keys(loc).filter(
    (k) => k !== "kind" && INTEGRATION_NAMES.has(k),
  );

  if (integrationKeys.length !== 1) {
    throw new ConfigError(
      `State field "${fieldName}": location must have exactly one integration type key`,
    );
  }

  const typeName = integrationKeys[0];
  const integration = INTEGRATIONS[typeName];
  const rawConfig = loc[typeName];

  if (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig)) {
    throw new ConfigError(
      `State field "${fieldName}": ${typeName} config must be an object`,
    );
  }

  const configObj = rawConfig as Record<string, unknown>;
  const config: Record<string, string> = {};

  // Validate required fields
  for (const field of integration.requiredFields) {
    if (!(field in configObj) || typeof configObj[field] !== "string") {
      throw new ConfigError(
        `State field "${fieldName}": ${typeName} requires a "${field}" field (string)`,
      );
    }
    config[field] = configObj[field] as string;
  }

  // Collect optional fields
  for (const field of integration.optionalFields) {
    if (field in configObj) {
      if (typeof configObj[field] !== "string") {
        throw new ConfigError(
          `State field "${fieldName}": ${typeName} field "${field}" must be a string`,
        );
      }
      config[field] = configObj[field] as string;
    }
  }

  // Reject unknown fields
  const allKnown = new Set([
    ...integration.requiredFields,
    ...integration.optionalFields,
  ]);
  for (const key of Object.keys(configObj)) {
    if (!allKnown.has(key)) {
      const hint = didYouMean(key, allKnown);
      throw new ConfigError(
        `State field "${fieldName}": ${typeName} has unknown field "${key}"${hint}`,
      );
    }
  }

  return { type: typeName, config };
}

/**
 * Resolve the URL for an integration location.
 */
export function resolveIntegrationUrl(location: IntegrationLocation): string {
  const integration = INTEGRATIONS[location.type];
  return integration.resolveUrl(location.config);
}

/**
 * Render human-readable instructions for an integration location.
 */
export function renderIntegrationInstructions(
  location: IntegrationLocation,
): string {
  const integration = INTEGRATIONS[location.type];
  return integration.renderInstructions(location.config);
}
