import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { enhanceConfigError, INIT_HINT } from "./cli.js";
import { ConfigError } from "./errors.js";

describe("enhanceConfigError", () => {
  it("appends init hint when using default config path and file not found", () => {
    const err = new ConfigError("Cannot read config file: /path/to/skillfold.yaml");
    const enhanced = enhanceConfigError(err, false);
    assert.match(enhanced.message, /Cannot read config file/);
    assert.match(enhanced.message, /skillfold init/);
    assert.match(enhanced.message, /--config/);
    assert.ok(enhanced.message.includes(INIT_HINT));
  });

  it("does not add hint when --config was explicitly provided", () => {
    const err = new ConfigError("Cannot read config file: /path/to/custom.yaml");
    const enhanced = enhanceConfigError(err, true);
    assert.equal(enhanced.message, err.message);
    assert.ok(!enhanced.message.includes(INIT_HINT));
  });

  it("does not add hint for other ConfigError messages", () => {
    const err = new ConfigError("Config must have a 'name' field (string)");
    const enhanced = enhanceConfigError(err, false);
    assert.equal(enhanced.message, err.message);
    assert.ok(!enhanced.message.includes(INIT_HINT));
  });

  it("returns the original error instance when no enhancement is needed", () => {
    const err = new ConfigError("Some other error");
    const enhanced = enhanceConfigError(err, false);
    assert.equal(enhanced, err);
  });

  it("returns a new error instance when enhancement is applied", () => {
    const err = new ConfigError("Cannot read config file: /foo/bar.yaml");
    const enhanced = enhanceConfigError(err, false);
    assert.notEqual(enhanced, err);
    assert.ok(enhanced instanceof ConfigError);
  });
});
