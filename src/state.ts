import { ConfigError, didYouMean } from "./errors.js";

export interface SkillResources {
  resources?: Record<string, string>;
}

export type PrimitiveType = "string" | "bool" | "number";

export type StateType =
  | { kind: "primitive"; value: PrimitiveType }
  | { kind: "list"; element: string }
  | { kind: "custom"; name: string };

export interface StateLocation {
  skill: string;
  path: string;
  kind?: string;
}

export interface CustomType {
  fields: Record<string, PrimitiveType>;
}

export interface StateField {
  type: StateType;
  location?: StateLocation;
}

export interface StateSchema {
  types: Record<string, CustomType>;
  fields: Record<string, StateField>;
}

const PRIMITIVES = new Set<string>(["string", "bool", "number"]);

function isPrimitive(value: string): value is PrimitiveType {
  return PRIMITIVES.has(value);
}

function parseTypeString(
  raw: string,
  fieldName: string,
  definedTypes: Set<string>
): StateType {
  if (isPrimitive(raw)) {
    return { kind: "primitive", value: raw };
  }

  const listMatch = raw.match(/^list<(.*)>$/);
  if (listMatch) {
    const element = listMatch[1];
    if (!element) {
      throw new ConfigError(
        `State field "${fieldName}": invalid type "list<>" (expected list<TypeName>)`
      );
    }
    if (!definedTypes.has(element)) {
      const hint = didYouMean(element, definedTypes);
      throw new ConfigError(
        `State field "${fieldName}": unknown type "${element}"${hint}`
      );
    }
    return { kind: "list", element };
  }

  if (definedTypes.has(raw)) {
    return { kind: "custom", name: raw };
  }

  const allCandidates = [...definedTypes, ...PRIMITIVES];
  const hint = didYouMean(raw, allCandidates);
  throw new ConfigError(
    `State field "${fieldName}": unknown type "${raw}"${hint}`
  );
}

function isCustomTypeDef(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return !("type" in value);
}

function parseCustomType(
  name: string,
  raw: Record<string, unknown>
): CustomType {
  const fields: Record<string, PrimitiveType> = {};
  const entries = Object.entries(raw);

  if (entries.length === 0) {
    throw new ConfigError(
      `State type "${name}": must define at least one field`
    );
  }

  for (const [fieldName, fieldType] of entries) {
    if (typeof fieldType !== "string" || !isPrimitive(fieldType)) {
      throw new ConfigError(
        `State type "${name}": field "${fieldName}" has invalid type "${String(fieldType)}" (expected string, bool, or number)`
      );
    }
    fields[fieldName] = fieldType;
  }

  return { fields };
}

function validateLocation(
  fieldName: string,
  location: unknown,
  skills: Record<string, SkillResources>,
): StateLocation {
  if (typeof location !== "object" || location === null) {
    throw new ConfigError(
      `State field "${fieldName}": location must be an object`
    );
  }

  const loc = location as Record<string, unknown>;

  if (!("skill" in loc) || typeof loc.skill !== "string") {
    throw new ConfigError(
      `State field "${fieldName}": location must have a "skill" field`
    );
  }

  if (!("path" in loc) || typeof loc.path !== "string") {
    throw new ConfigError(
      `State field "${fieldName}": location must have a "path" field`
    );
  }

  if (!(loc.skill in skills)) {
    throw new ConfigError(
      `State field "${fieldName}": location references unknown skill "${loc.skill}"`
    );
  }

  const skill = skills[loc.skill];

  // Validate namespace against resource declarations
  if (skill.resources && Object.keys(skill.resources).length > 0) {
    const slashIdx = loc.path.indexOf("/");
    const namespace = slashIdx === -1 ? loc.path : loc.path.slice(0, slashIdx);
    if (!(namespace in skill.resources)) {
      const declared = Object.keys(skill.resources);
      const hint = didYouMean(namespace, declared);
      throw new ConfigError(
        `State field "${fieldName}": location path "${loc.path}" references namespace "${namespace}" which is not declared by skill "${loc.skill}". Declared namespaces: ${declared.join(", ")}${hint}`
      );
    }
  } else {
    // Emit warning for implicit locations
    process.stderr.write(
      `Warning: state field "${fieldName}" references skill "${loc.skill}" which has no resource declarations. Consider adding a "resources" map to the "${loc.skill}" skill definition for compile-time path validation.\n`
    );
  }

  const result: StateLocation = { skill: loc.skill, path: loc.path };
  if ("kind" in loc && typeof loc.kind === "string") {
    result.kind = loc.kind;
  }

  return result;
}

export function parseState(
  raw: Record<string, unknown>,
  skills: Set<string> | Record<string, SkillResources>,
): StateSchema {
  // Normalize: accept both Set<string> (legacy) and Record (new)
  const skillsRecord: Record<string, SkillResources> =
    skills instanceof Set
      ? Object.fromEntries([...skills].map((n) => [n, {}]))
      : skills;

  const types: Record<string, CustomType> = {};
  const fields: Record<string, StateField> = {};

  // First pass: collect custom type definitions
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) continue;
    if (!isCustomTypeDef(value)) continue;

    if (isPrimitive(name)) {
      throw new ConfigError(
        `State type "${name}": cannot redefine primitive type`
      );
    }

    types[name] = parseCustomType(name, value as Record<string, unknown>);
  }

  const definedTypes = new Set(Object.keys(types));

  // Second pass: parse state fields
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== "object" || value === null) continue;
    if (isCustomTypeDef(value)) continue;

    const obj = value as Record<string, unknown>;
    const rawType = obj.type;

    if (typeof rawType !== "string") {
      throw new ConfigError(
        `State field "${name}": type must be a string`
      );
    }

    const stateType = parseTypeString(rawType, name, definedTypes);
    const field: StateField = { type: stateType };

    if ("location" in obj) {
      field.location = validateLocation(name, obj.location, skillsRecord);
    }

    fields[name] = field;
  }

  return { types, fields };
}
