import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Resolve from this file so package installs and manual setup work from any cwd.
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

try {
  execFileSync("uv", ["sync", "--locked", "--extra", "all", "--no-dev"], {
    cwd: projectRoot,
    stdio: "inherit",
  });
} catch (error) {
  if (error.code === "ENOENT") {
    console.error(
      "Python setup requires uv on PATH. Install it from " +
        "https://docs.astral.sh/uv/getting-started/installation/ and retry.",
    );
  }
  process.exit(error.status || 1);
}
