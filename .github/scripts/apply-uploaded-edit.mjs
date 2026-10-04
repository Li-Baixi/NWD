import fs from "node:fs";
import { applyChanges } from "./site-edit-core.mjs";

const files = fs.readdirSync(".").filter((name) => /^edits-update-.*\.json$/.test(name));
if (!files.length) {
  console.log("No uploaded editor file found; nothing to apply.");
  process.exit(0);
}

let latest = null;
for (const name of files) {
  try {
    const candidate = JSON.parse(fs.readFileSync(name, "utf8"));
    if (candidate.schema !== 1 || !candidate.changes) continue;
    if (!latest || new Date(candidate.updatedAt) > new Date(latest.updatedAt)) {
      latest = { name, ...candidate };
    }
  } catch (error) {
    throw new Error(`Unable to parse uploaded file ${name}: ${error.message}`);
  }
}

if (!latest) throw new Error("No valid uploaded editor payload was found.");

await applyChanges(latest.changes, "Update site content from uploaded editor file");
console.log(`Applied edit from ${latest.name}`);
