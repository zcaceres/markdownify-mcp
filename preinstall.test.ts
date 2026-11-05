import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The fake uv executable is a POSIX script. The real setup entry point is
// shared by Unix and Windows; native .bat execution still needs Windows CI.
describe.skipIf(process.platform === "win32")("locked Python setup", () => {
  function withFixture(
    run: (fixture: {
      root: string;
      packageDir: string;
      capture: string;
      env: NodeJS.ProcessEnv;
      node: string;
    }) => void,
  ) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "markdownify-setup-"));
    const packageDir = path.join(root, "package with spaces");
    const capture = path.join(root, "uv-arguments");
    const bin = path.join(root, "bin");
    fs.mkdirSync(packageDir);
    fs.mkdirSync(bin);
    fs.copyFileSync(
      path.join(import.meta.dir, "preinstall.js"),
      path.join(packageDir, "preinstall.js"),
    );
    fs.copyFileSync(
      path.join(import.meta.dir, "setup.sh"),
      path.join(packageDir, "setup.sh"),
    );
    fs.writeFileSync(
      path.join(packageDir, "package.json"),
      '{"type":"module"}',
    );
    fs.writeFileSync(
      path.join(bin, "uv"),
      '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@" > "$SETUP_CAPTURE"\nexit "${SETUP_EXIT_CODE:-0}"\n',
      { mode: 0o755 },
    );
    try {
      run({
        root,
        packageDir,
        capture,
        node: Bun.which("node")!,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          SETUP_CAPTURE: capture,
        },
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  test("preinstall selects the locked full profile from the package directory", () => {
    withFixture(({ root, packageDir, capture, env, node }) => {
      const result = spawnSync(node, [path.join(packageDir, "preinstall.js")], {
        cwd: root,
        env,
      });
      expect(result.status).toBe(0);
      expect(fs.readFileSync(capture, "utf8").trim().split("\n")).toEqual([
        fs.realpathSync(packageDir),
        "sync",
        "--locked",
        "--extra",
        "all",
        "--no-dev",
      ]);
    });
  });

  test("preinstall propagates uv failures instead of reporting success", () => {
    withFixture(({ root, packageDir, env, node }) => {
      const result = spawnSync(node, [path.join(packageDir, "preinstall.js")], {
        cwd: root,
        env: { ...env, SETUP_EXIT_CODE: "37" },
      });
      expect(result.status).toBe(37);
    });
  });

  test("preinstall explains how to install a missing uv", () => {
    withFixture(({ root, packageDir, env, node }) => {
      const result = spawnSync(node, [path.join(packageDir, "preinstall.js")], {
        cwd: root,
        env: { ...env, PATH: root },
      });
      expect(result.status).toBe(1);
      expect(result.stderr.toString()).toContain("requires uv on PATH");
      expect(result.stderr.toString()).toContain("https://docs.astral.sh/uv/");
    });
  });

  test("Unix setup works from another cwd and preserves failure status", () => {
    withFixture(({ root, packageDir, capture, env }) => {
      const result = spawnSync("/bin/bash", [path.join(packageDir, "setup.sh")], {
        cwd: root,
        env: { ...env, SETUP_EXIT_CODE: "37" },
      });
      expect(result.status).toBe(37);
      expect(fs.readFileSync(capture, "utf8")).toContain("--locked\n--extra\nall");
    });
  });
});
