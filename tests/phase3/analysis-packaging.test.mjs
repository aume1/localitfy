import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const prune = require("../../scripts/prune-analysis-runtime.cjs");

test("packaging retains the target runtime and removes other OS/architecture binaries", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "localtify-runtime-pack-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const binaries = path.join(root, "resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6");
  for (const system of ["darwin", "win32", "linux"]) {
    for (const arch of ["x64", "arm64"]) await fs.mkdir(path.join(binaries, system, arch), { recursive: true });
  }
  await prune({ appOutDir: root, electronPlatformName: "win32", arch: 1 });
  assert.deepEqual(await fs.readdir(binaries), ["win32"]);
  assert.deepEqual(await fs.readdir(path.join(binaries, "win32")), ["x64"]);
  const mac = path.join(root, "test.app/Contents/Resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64");
  await fs.mkdir(mac, { recursive: true });
  await fs.writeFile(path.join(mac, "libonnxruntime.1.dylib"), "identical-library");
  await fs.writeFile(path.join(mac, "libonnxruntime.1.30.0.dylib"), "identical-library");
  await prune({ appOutDir: root, electronPlatformName: "darwin", arch: 3, packager: { appInfo: { productFilename: "test" } } });
  assert.deepEqual(await fs.readdir(mac), ["libonnxruntime.1.dylib"]);
});
