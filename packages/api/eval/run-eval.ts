import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUEST_CATEGORIES,
  type RequestCategory,
  type RequestPriority,
} from "shared";
import { TRIAGE_RULES, triage } from "../src/agent/triage";

interface DatasetRow {
  id: string;
  title: string;
  body: string;
  label_category: RequestCategory;
  label_priority: RequestPriority;
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const datasetPath = resolve(here, "dataset.json");
const reportsDir = resolve(repoRoot, "reports");

const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as DatasetRow[];

if (dataset.length < 150) {
  throw new Error(`Dataset must contain at least 150 rows, got ${dataset.length}`);
}
if (!dataset.every((row) => REQUEST_CATEGORIES.includes(row.label_category))) {
  throw new Error("Dataset contains an invalid category label");
}
const otherCount = dataset.filter((row) => row.label_category === "other").length;
if (otherCount < 15) {
  throw new Error(`Dataset must contain at least 15 other rows, got ${otherCount}`);
}

interface Prediction {
  id: string;
  title: string;
  labelCategory: RequestCategory;
  predictedCategory: RequestCategory;
  labelPriority: RequestPriority;
  predictedPriority: RequestPriority;
  confidence: number;
  correctCategory: boolean;
  correctPriority: boolean;
  text: string;
}

const predictions: Prediction[] = dataset.map((row) => {
  const result = triage(`${row.title}\n${row.body}`);
  return {
    id: row.id,
    title: row.title,
    labelCategory: row.label_category,
    predictedCategory: result.category,
    labelPriority: row.label_priority,
    predictedPriority: result.priority,
    confidence: result.confidence,
    correctCategory: result.category === row.label_category,
    correctPriority: result.priority === row.label_priority,
    text: `${row.title} — ${row.body}`,
  };
});

const total = predictions.length;
const correct = predictions.filter((item) => item.correctCategory).length;
const accuracy = correct / total;

interface CategoryMetric {
  category: RequestCategory;
  support: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

const perCategory: CategoryMetric[] = REQUEST_CATEGORIES.map((category) => {
  const tp = predictions.filter(
    (item) => item.predictedCategory === category && item.labelCategory === category,
  ).length;
  const fp = predictions.filter(
    (item) => item.predictedCategory === category && item.labelCategory !== category,
  ).length;
  const fn = predictions.filter(
    (item) => item.labelCategory === category && item.predictedCategory !== category,
  ).length;
  const support = predictions.filter((item) => item.labelCategory === category).length;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { category, support, precision, recall, f1, tp, fp, fn };
});

const macroF1 = perCategory.reduce((sum, item) => sum + item.f1, 0) / perCategory.length;

const correctPriorities = predictions.filter((item) => item.correctPriority).length;
const priorityAccuracy = correctPriorities / total;

const correctConfidences = predictions
  .filter((item) => item.correctCategory)
  .map((item) => item.confidence);
const incorrectConfidences = predictions
  .filter((item) => !item.correctCategory)
  .map((item) => item.confidence);

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const meanConfidenceCorrect = round(mean(correctConfidences));
const meanConfidenceIncorrect = round(mean(incorrectConfidences));

const confusionMatrix = Object.fromEntries(
  REQUEST_CATEGORIES.map((label) => [
    label,
    Object.fromEntries(
      REQUEST_CATEGORIES.map((predicted) => [
        predicted,
        predictions.filter(
          (item) => item.labelCategory === label && item.predictedCategory === predicted,
        ).length,
      ]),
    ),
  ]),
) as Record<RequestCategory, Record<RequestCategory, number>>;

const worst = predictions
  .filter((item) => !item.correctCategory)
  .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
  .slice(0, 10)
  .map((item) => ({
    id: item.id,
    title: item.title,
    text: item.text,
    labelCategory: item.labelCategory,
    predictedCategory: item.predictedCategory,
    confidence: item.confidence,
  }));

const categoryDistribution = Object.fromEntries(
  REQUEST_CATEGORIES.map((category) => [
    category,
    dataset.filter((row) => row.label_category === category).length,
  ]),
) as Record<RequestCategory, number>;

const priorityDistribution = (["p0", "p1", "p2", "p3"] as RequestPriority[]).map(
  (priority) => ({
    priority,
    count: dataset.filter((row) => row.label_priority === priority).length,
  }),
);

const report = {
  dataset: {
    path: "packages/api/eval/dataset.json",
    size: total,
    categoryDistribution,
    priorityDistribution,
  },
  summary: {
    categoryAccuracy: round(accuracy),
    correctCategories: correct,
    macroF1: round(macroF1),
    priorityAccuracy: round(priorityAccuracy),
    correctPriorities,
    meanConfidenceCorrect,
    meanConfidenceIncorrect,
    confidenceGap: round(meanConfidenceCorrect - meanConfidenceIncorrect),
  },
  perCategory: perCategory.map((item) => ({
    ...item,
    precision: round(item.precision),
    recall: round(item.recall),
    f1: round(item.f1),
  })),
  confusionMatrix: {
    labels: REQUEST_CATEGORIES,
    matrix: REQUEST_CATEGORIES.map((label) =>
      REQUEST_CATEGORIES.map((predicted) => confusionMatrix[label][predicted]),
    ),
    byLabel: confusionMatrix,
  },
  worstMisclassifications: worst,
  rules: {
    categoryRules: TRIAGE_RULES.categories.map((rule) => ({
      category: rule.category,
      terms: rule.terms.length,
    })),
    priorityRules: TRIAGE_RULES.priorities.map((rule) => ({
      priority: rule.priority,
      terms: rule.terms.length,
    })),
    thresholds: TRIAGE_RULES.thresholds,
    tieBreakOrder: TRIAGE_RULES.tieBreakOrder,
  },
};

mkdirSync(reportsDir, { recursive: true });
writeFileSync(resolve(reportsDir, "eval.json"), `${JSON.stringify(report, null, 2)}\n`);

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

const lines: string[] = [];
lines.push("# Triage evaluation");
lines.push("");
lines.push(`Dataset: **${total}** labeled People-Ops requests (${datasetPath.replace(repoRoot, ".")}).`);
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push("| Metric | Value |");
lines.push("| --- | ---: |");
lines.push(`| Category accuracy | ${pct(accuracy)} (${correct}/${total}) |`);
lines.push(`| Macro-F1 (6 categories) | ${macroF1.toFixed(4)} |`);
lines.push(`| Priority exact-match accuracy | ${pct(priorityAccuracy)} (${correctPriorities}/${total}) |`);
lines.push(`| Mean confidence on correct predictions | ${meanConfidenceCorrect.toFixed(4)} |`);
lines.push(`| Mean confidence on incorrect predictions | ${meanConfidenceIncorrect.toFixed(4)} |`);
lines.push("");
lines.push("## Per-category precision / recall / F1");
lines.push("");
lines.push("| Category | Support | Precision | Recall | F1 | TP | FP | FN |");
lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const item of perCategory) {
  lines.push(
    `| ${item.category} | ${item.support} | ${item.precision.toFixed(3)} | ${item.recall.toFixed(3)} | ${item.f1.toFixed(3)} | ${item.tp} | ${item.fp} | ${item.fn} |`,
  );
}
lines.push("");
lines.push("## Confusion matrix");
lines.push("");
lines.push(`Rows are the labeled category; columns are the predicted category.`);
lines.push("");
lines.push(`| actual \\ predicted | ${REQUEST_CATEGORIES.join(" | ")} |`);
lines.push(`| --- | ${REQUEST_CATEGORIES.map(() => "---:").join(" | ")} |`);
for (const label of REQUEST_CATEGORIES) {
  lines.push(
    `| **${label}** | ${REQUEST_CATEGORIES.map((predicted) => confusionMatrix[label][predicted]).join(" | ")} |`,
  );
}
lines.push("");
lines.push("## Priority");
lines.push("");
lines.push(`Exact-match accuracy: **${pct(priorityAccuracy)}** (${correctPriorities}/${total}).`);
lines.push("");
lines.push("| Priority | Dataset count |");
lines.push("| --- | ---: |");
for (const item of priorityDistribution) {
  lines.push(`| ${item.priority} | ${item.count} |`);
}
lines.push("");
lines.push("## Ten highest-confidence misclassifications");
lines.push("");
lines.push("| ID | Label → prediction | Confidence | Text |");
lines.push("| --- | --- | ---: | --- |");
for (const item of worst) {
  const text = item.text.replace(/\|/g, "\\|").slice(0, 180);
  lines.push(
    `| ${item.id} | ${item.labelCategory} → ${item.predictedCategory} | ${item.confidence.toFixed(2)} | ${text} |`,
  );
}
lines.push("");
lines.push("## Rule table used");
lines.push("");
lines.push(
  `Category rules: ${report.rules.categoryRules.map((r) => `${r.category}=${r.terms}`).join(", ")}. ` +
    `Priority rules: ${report.rules.priorityRules.map((r) => `${r.priority}=${r.terms}`).join(", ")}. ` +
    `Thresholds: min category score ${TRIAGE_RULES.thresholds.minimumCategoryScore}, ambiguous margin ${TRIAGE_RULES.thresholds.ambiguousMargin}, confident score ${TRIAGE_RULES.thresholds.confidentScore}.`,
);
lines.push("");
lines.push(
  "Generated by `pnpm eval` (`packages/api/eval/run-eval.ts`) using the deterministic `TRIAGE_MODE=rules` engine. No LLM calls.",
);
lines.push("");

writeFileSync(resolve(reportsDir, "eval.md"), `${lines.join("\n")}\n`);

console.log("Triage evaluation complete");
console.log(`  dataset: ${total} rows`);
console.log(`  category accuracy: ${pct(accuracy)} (${correct}/${total})`);
console.log(`  macro-F1: ${macroF1.toFixed(4)}`);
console.log(`  priority accuracy: ${pct(priorityAccuracy)} (${correctPriorities}/${total})`);
console.log(`  mean confidence: correct ${meanConfidenceCorrect.toFixed(4)}, incorrect ${meanConfidenceIncorrect.toFixed(4)}`);
console.log("  reports/eval.json and reports/eval.md written");
