const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const platform = process.platform;
assert.ok(platform === "win32" || platform === "linux", "Only Windows/Linux packaging is checked here");
const directory = platform === "win32" ? "win-unpacked" : "linux-unpacked";
const resources = path.join(process.cwd(), "release", directory, "resources");
assert.ok(fs.existsSync(path.join(resources, "app.asar")), "Packaged Electron application is missing");
const binaryRoot = path.join(resources, "app.asar.unpacked", "node_modules", "onnxruntime-node", "bin", "napi-v6");
assert.ok(fs.existsSync(binaryRoot), "Unpacked ONNX Runtime is missing");
assert.deepEqual(fs.readdirSync(binaryRoot), [platform], "Other platform runtimes were not pruned");
const architecturePath = path.join(binaryRoot, platform);
assert.deepEqual(fs.readdirSync(architecturePath), ["x64"], "Non-target architecture runtimes were not pruned");
assert.ok(fs.readdirSync(path.join(architecturePath, "x64")).length > 0, "Native runtime files are missing");
console.log("[analysis-native] Unpacked CPU runtime available for", platform, "x64");
