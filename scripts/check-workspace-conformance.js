#!/usr/bin/env node

// Parse the canonical Quazi sources with this checkout's grammar. The corpus
// remains the focused grammar test suite; this script catches syntax added to
// the compiler that its maintained examples or standard library exercise.

const path = require("path");
const { spawnSync } = require("child_process");

const grammarRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(grammarRoot, "..");
const repositories = ["quazistrap", "std"];

function trackedQuaziSources(repository) {
  const repositoryRoot = path.join(workspaceRoot, repository);
  const result = spawnSync("git", ["-C", repositoryRoot, "ls-files", "-z", "--", "*.qz"], {
    encoding: "buffer",
  });
  if (result.error || result.status !== 0) {
    console.error(`Could not list tracked Quazi sources in ${repositoryRoot}.`);
    return null;
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((source) => path.join(repositoryRoot, source));
}

const sourceGroups = repositories.map(trackedQuaziSources);
if (sourceGroups.some((sources) => sources === null)) {
  process.exitCode = 2;
  return;
}
const sources = sourceGroups.flat().sort();
if (sources.length === 0) {
  console.error("No tracked canonical .qz sources found.");
  process.exitCode = 2;
  return;
}

const treeSitterCli = require.resolve("tree-sitter-cli/cli.js");
const result = spawnSync(
  process.execPath,
  [
    treeSitterCli,
    "parse",
    "--grammar-path",
    grammarRoot,
    "--json-summary",
    ...sources,
  ],
  { encoding: "utf8" },
);

if (result.error) {
  throw result.error;
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
  return;
}

let summary;
try {
  summary = JSON.parse(result.stdout);
} catch (error) {
  console.error(`Tree-sitter did not produce a JSON parse summary: ${error.message}`);
  process.exitCode = 1;
  return;
}

const parses = summary.parse_summaries;
if (!Array.isArray(parses) || parses.length !== sources.length) {
  console.error("Tree-sitter did not report one parse summary for every canonical source.");
  process.exitCode = 1;
  return;
}

const failed = parses.filter((parse) => !parse.successful);
if (failed.length > 0) {
  console.error(`Tree-sitter reported syntax errors in ${failed.length} canonical source file(s):`);
  for (const parse of failed) {
    console.error(`- ${parse.file}`);
  }
  process.exitCode = 1;
}
