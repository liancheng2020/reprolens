import { compareModels } from "./model-compare.js";
try { await compareModels(Number(process.argv[2] ?? "1")); }
catch (error) { console.error(error instanceof Error ? error.message : "模型对照失败"); process.exitCode = 1; }
