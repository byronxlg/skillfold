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
