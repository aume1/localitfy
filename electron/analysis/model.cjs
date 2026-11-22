const MODEL = Object.freeze({
  id: "clap-htsat-unfused-q8-v1",
  name: "CLAP audio encoder (quantized)",
  revision: "c28f2883575e590e04d3146ff0713c2448d691ba",
  source: "https://huggingface.co/Xenova/clap-htsat-unfused",
  license: "Apache-2.0 (base model)",
  licenseUrl: "https://huggingface.co/laion/clap-htsat-unfused",
  dimensions: 512,
  sampleRate: 48000,
  files: [
    { path: "config.json", bytes: 699, sha256: "39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b" },
    { path: "preprocessor_config.json", bytes: 541, sha256: "9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753" },
    { path: "onnx/audio_model_quantized.onnx", bytes: 34301667, sha256: "3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f" }
  ]
});
const MODEL_BYTES = MODEL.files.reduce((total, file) => total + file.bytes, 0);
module.exports = { MODEL, MODEL_BYTES, ANALYZER_VERSION: 1 };
