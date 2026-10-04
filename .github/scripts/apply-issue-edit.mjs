import process from "node:process";
import { applyChanges } from "./site-edit-core.mjs";

const body = process.env.ISSUE_BODY || "";
const marker = "<!--website-edit-payload-->";
let candidate = body.includes(marker) ? body.slice(body.indexOf(marker) + marker.length) : body;
candidate = candidate.replace(/^\uFEFF/, "").replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
const start = candidate.indexOf("{");
const end = candidate.lastIndexOf("}");
if (start < 0 || end <= start) {
  throw new Error("The issue does not contain a valid editor payload.");
}

let request;
try {
  request = JSON.parse(candidate.slice(start, end + 1));
} catch (error) {
  throw new Error("The issue payload is not valid JSON.");
}

if (request.schema !== 1 || !request.changes) {
  throw new Error("Unsupported editor payload schema.");
}

await applyChanges(request.changes, "Update site content from editor");
console.log(`Applied edit from issue #${process.env.ISSUE_NUMBER || "unknown"}`);
