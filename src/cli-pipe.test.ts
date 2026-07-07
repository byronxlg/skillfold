import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

import { makeTmpDir, writeFile, writeSkill } from "./testutil.js";

const tmp = makeTmpDir();
after(() => tmp.cleanup());

const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));

/**
 * Run the CLI as a real subprocess (under tsx) and close its stdout after
 * the first chunk, the way `skillfold install | head` does. Resolves with
 * the exit code and collected stderr.
 */
function runWithEarlyClose(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.once("data", () => child.stdout.destroy());
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

describe("cli stdout pipe handling", () => {
  it("exits cleanly when the reader closes the pipe early", async () => {
    // install prints one line per skill, so closing after the first chunk
    // leaves later writes hitting a broken pipe.
    writeSkill(tmp.path, "skills/a", "a");
    writeSkill(tmp.path, "skills/b", "b");
    writeSkill(tmp.path, "skills/c", "c");
    writeFile(
      tmp.path,
      "skillfold.yaml",
      "skills:\n  a: ./skills/a\n  b: ./skills/b\n  c: ./skills/c"
    );
    const { code, stderr } = await runWithEarlyClose(["install", "--dir", tmp.path]);
    assert.ok(!stderr.includes("EPIPE"), `unexpected EPIPE crash:\n${stderr}`);
    assert.equal(code, 0);
  });
});
