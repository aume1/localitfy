const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

// ONNX Runtime ships binaries for every OS/architecture. Keep the target CPU runtime only.
module.exports = async function pruneAnalysisRuntime(context) {
  const platform = context.electronPlatformName;
  const architecture = require("builder-util").Arch[context.arch];
  if (!["darwin", "win32", "linux"].includes(platform) || !["x64", "arm64", "universal"].includes(architecture)) {
    throw new Error("Unsupported analysis runtime packaging target");
  }
  const resources = platform === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const binaryRoot = path.join(resources, "app.asar.unpacked", "node_modules", "onnxruntime-node", "bin", "napi-v6");
  for (const system of await fs.readdir(binaryRoot)) {
    const systemPath = path.join(binaryRoot, system);
    if (system !== platform) { await fs.rm(systemPath, { recursive: true, force: true }); continue; }
    for (const arch of await fs.readdir(systemPath)) {
      if (architecture !== "universal" && arch !== architecture) {
        await fs.rm(path.join(systemPath, arch), { recursive: true, force: true });
        continue;
      }
      if (platform === "darwin") {
        const directory = path.join(systemPath, arch);
        const alias = path.join(directory, "libonnxruntime.1.dylib");
        const versioned = path.join(directory, "libonnxruntime.1.30.0.dylib");
        const aliasStat = await fs.lstat(alias).catch(() => null);
        // electron-builder copies both names as files. The binding links only libonnxruntime.1.dylib.
        if (aliasStat?.isFile()) {
          const hash = async (file) => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
          if (await hash(alias) === await hash(versioned)) await fs.rm(versioned);
        }
      }
    }
  }
};
