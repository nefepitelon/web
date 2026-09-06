const { list, put } = require("@vercel/blob");

const STORE_PATH = "alphaops/projects-state.json";

function defaultState() {
  return {
    pending: [],
    main: [],
    hiddenPending: [],
    removedItems: [],
    removedProjects: [],
    tutorials: [],
    comments: [],
    contentTombstones: [],
    updatedAt: null
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function projectKey(project) {
  if (!project || typeof project !== "object") return "";
  return String(project.name || project.id || "").trim().toLowerCase();
}

function mergeProjectArrays(primary, secondary) {
  const seen = new Set();
  return [...asArray(primary), ...asArray(secondary)].filter((project) => {
    const key = projectKey(project);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeStringArrays(primary, secondary) {
  const seen = new Set();
  return [...asArray(primary), ...asArray(secondary)]
    .map((item) => String(item || "").trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function contentRecordKey(record) {
  if (!record || typeof record !== "object") return "";
  return String(record.id || "").trim();
}

function mergeContentRecords(primary, secondary) {
  const records = new Map();
  [...asArray(secondary), ...asArray(primary)].forEach((record) => {
    const key = contentRecordKey(record);
    if (!key) return;
    const current = records.get(key);
    const currentTime = new Date(current?.updatedAt || current?.createdAt || 0).getTime();
    const nextTime = new Date(record.updatedAt || record.createdAt || 0).getTime();
    if (!current || nextTime >= currentTime) records.set(key, record);
  });
  return [...records.values()].sort((a, b) => (
    new Date(b.createdAt || b.updatedAt || 0).getTime()
    - new Date(a.createdAt || a.updatedAt || 0).getTime()
  ));
}

function stateHasContent(state) {
  return [
    state?.pending,
    state?.main,
    state?.hiddenPending,
    state?.removedItems,
    state?.removedProjects,
    state?.tutorials,
    state?.comments,
    state?.contentTombstones
  ].some((items) => asArray(items).length > 0);
}

function projectNames(projects) {
  return new Set(asArray(projects)
    .map((project) => String(project?.name || "").trim().toLowerCase())
    .filter(Boolean));
}

function stringNames(items) {
  return new Set(asArray(items)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean));
}

function mergeStates(incoming, stored) {
  const next = sanitizeState(incoming);
  const current = sanitizeState(stored);
  if (!stateHasContent(next) && stateHasContent(current)) return current;

  const activeIncomingNames = new Set([
    ...projectNames(next.pending),
    ...projectNames(next.main)
  ]);
  const incomingRemovedProjectNames = stringNames(next.removedProjects);
  const removedItemNames = new Set([
    ...projectNames(next.removedItems),
    ...projectNames(current.removedItems)
  ]);
  const main = mergeProjectArrays(next.main, current.main)
    .filter((project) => !removedItemNames.has(projectKey(project)));
  const mainNames = projectNames(main);
  const pending = mergeProjectArrays(next.pending, current.pending)
    .filter((project) => !removedItemNames.has(projectKey(project)))
    .filter((project) => !mainNames.has(projectKey(project)));
  const mergedActiveNames = new Set([
    ...projectNames(pending),
    ...mainNames
  ]);
  const removedProjects = mergeStringArrays(next.removedProjects, current.removedProjects)
    .filter((name) => {
      const key = name.toLowerCase();
      if (incomingRemovedProjectNames.has(key)) return true;
      if (activeIncomingNames.has(key)) return false;
      return true;
    });
  const removedItems = mergeProjectArrays(next.removedItems, current.removedItems)
    .filter((project) => !mergedActiveNames.has(projectKey(project)) || !activeIncomingNames.has(projectKey(project)));
  const contentTombstones = mergeStringArrays(next.contentTombstones, current.contentTombstones);
  const deletedContentIds = new Set(contentTombstones.map((id) => id.toLowerCase()));
  const tutorials = mergeContentRecords(next.tutorials, current.tutorials)
    .filter((record) => !deletedContentIds.has(contentRecordKey(record).toLowerCase()));
  const comments = mergeContentRecords(next.comments, current.comments)
    .filter((record) => !deletedContentIds.has(contentRecordKey(record).toLowerCase()));

  return {
    pending,
    main,
    hiddenPending: mergeStringArrays(next.hiddenPending, current.hiddenPending),
    removedItems,
    removedProjects,
    tutorials,
    comments,
    contentTombstones,
    updatedAt: next.updatedAt || new Date().toISOString()
  };
}

function sanitizeState(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    pending: asArray(source.pending),
    main: asArray(source.main),
    hiddenPending: asArray(source.hiddenPending),
    removedItems: asArray(source.removedItems),
    removedProjects: asArray(source.removedProjects),
    tutorials: asArray(source.tutorials),
    comments: asArray(source.comments),
    contentTombstones: asArray(source.contentTombstones),
    updatedAt: source.updatedAt || new Date().toISOString()
  };
}

async function readBody(req) {
  if (req.body) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  return raw ? JSON.parse(raw) : {};
}

async function readStoredState() {
  const result = await list({ prefix: STORE_PATH, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === STORE_PATH);
  if (!blob) return defaultState();

  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return defaultState();
  return sanitizeState(await response.json());
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    sendJson(res, 200, {
      configured: false,
      state: defaultState(),
      message: "BLOB_READ_WRITE_TOKEN is not configured."
    });
    return;
  }

  try {
    if (req.method === "GET") {
      sendJson(res, 200, { configured: true, state: await readStoredState() });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      const state = mergeStates(await readBody(req), await readStoredState());
      await put(STORE_PATH, JSON.stringify(state), {
        access: "public",
        allowOverwrite: true,
        contentType: "application/json"
      });
      sendJson(res, 200, { configured: true, state });
      return;
    }

    sendJson(res, 405, { configured: true, error: "Method not allowed." });
  } catch (error) {
    sendJson(res, 500, {
      configured: true,
      error: "AlphaOps project state sync failed.",
      detail: error.message
    });
  }
};

module.exports.mergeStates = mergeStates;
module.exports.sanitizeState = sanitizeState;
