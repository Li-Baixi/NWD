import process from "node:process";

const apiHeaders = () => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  "User-Agent": "nwdrecruitment-edit-action"
});

function validateChanges(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new Error("Editor payload must contain a changes object.");
  }

  let fieldCount = 0;
  for (const [lang, fields] of Object.entries(changes)) {
    if (!/^[a-z]{2}-[A-Z]{2}$/.test(lang) || !fields || typeof fields !== "object") {
      throw new Error(`Invalid language layer: ${lang}`);
    }
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== "string" || !key) {
        throw new Error(`Invalid edit value for ${lang}/${key}`);
      }
      fieldCount += 1;
    }
  }
  if (!fieldCount) throw new Error("Editor payload does not contain any changes.");
}

export async function applyChanges(changes, commitMessage = "Update site content") {
  validateChanges(changes);
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  if (!owner || !repo) throw new Error("GITHUB_REPOSITORY is unavailable.");

  const api = `https://api.github.com/repos/${owner}/${repo}/contents/edits.json`;
  const existingResponse = await fetch(`${api}?ref=main`, {
    headers: apiHeaders()
  });

  let remote = {};
  let sha = null;
  if (existingResponse.ok) {
    const data = await existingResponse.json();
    sha = data.sha;
    try {
      remote = JSON.parse(Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8")) || {};
    } catch (error) {
      throw new Error("Unable to parse edits.json in the repository.");
    }
  } else if (existingResponse.status !== 404) {
    throw new Error(`Unable to read edits.json: ${existingResponse.status}`);
  }

  const merged = remote && typeof remote === "object" && !Array.isArray(remote) ? { ...remote } : {};
  for (const [lang, fields] of Object.entries(changes)) {
    merged[lang] = {
      ...(merged[lang] && typeof merged[lang] === "object" ? merged[lang] : {}),
      ...fields
    };
  }

  const body = {
    message: commitMessage,
    content: Buffer.from(JSON.stringify(merged, null, 2), "utf8").toString("base64"),
    branch: "main"
  };
  if (sha) body.sha = sha;

  const updateResponse = await fetch(api, {
    method: "PUT",
    headers: {
      ...apiHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!updateResponse.ok) {
    const result = await updateResponse.json().catch(() => ({}));
    throw new Error(result.message || `Unable to update edits.json: ${updateResponse.status}`);
  }

  const result = await updateResponse.json();
  console.log(`Updated edits.json: ${result.commit?.sha || "committed"}`);
}
