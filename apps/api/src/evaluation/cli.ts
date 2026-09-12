import { newReport, runEvaluation } from "./runner.js";

const suite = process.argv[2] ?? "smoke";
if (suite !== "smoke" && suite !== "full") throw new Error("用法：npm run eval:smoke 或 npm run eval:full");
const report = await runEvaluation(newReport(suite));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
