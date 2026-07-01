const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { generateAll, LANGUAGES, REPO_ROOT, SOURCE_DIR } = require('./scripts/generate-news');

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.PORT || 4177);
const PUBLIC_DIR = path.join(__dirname, 'public');

const ENVIRONMENTS = {
  production: {
    id: 'production',
    label: 'Production',
    branch: 'main',
    url: 'https://news.xeloc.dxl-labs.dev/',
  },
  development: {
    id: 'development',
    label: 'Development',
    branch: 'develop',
    url: 'https://dev.news.xeloc.dxl-labs.dev/',
  },
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
}

async function readSource() {
  const source = {};
  for (const language of LANGUAGES) {
    const filePath = path.join(SOURCE_DIR, `${language}.json`);
    const raw = await fs.readFile(filePath, 'utf8');
    source[language] = JSON.parse(raw);
  }
  return source;
}

function normalizeItem(item, previous) {
  const now = new Date().toISOString();
  const status = item.status === 'draft' ? 'draft' : 'published';
  const date = String(item.date || '');
  const title = String(item.title || '');
  const body = String(item.body || '');
  const note = String(item.note || '');
  const changed =
    !previous ||
    previous.status !== status ||
    previous.date !== date ||
    previous.title !== title ||
    previous.body !== body ||
    String(previous.note || '') !== note;

  return {
    num: Number(item.num),
    status,
    date,
    title,
    body,
    createdAt: item.createdAt || previous?.createdAt || now,
    updatedAt: changed ? now : previous?.updatedAt || item.updatedAt || now,
    note,
  };
}

async function saveSource(payload) {
  await fs.mkdir(SOURCE_DIR, { recursive: true });
  const previousSource = await readSource().catch(() => ({}));

  for (const language of LANGUAGES) {
    const data = payload[language];
    if (!data || !Array.isArray(data.items)) {
      throw new Error(`Invalid source payload for ${language}`);
    }

    const previousItems = new Map(
      (previousSource[language]?.items || []).map((item) => [Number(item.num), item]),
    );
    const nums = new Set();
    const items = data.items
      .map((item) => normalizeItem(item, previousItems.get(Number(item.num))))
      .sort((a, b) => a.num - b.num);

    for (const item of items) {
      if (!Number.isInteger(item.num) || item.num <= 0) {
        throw new Error(`${language}: num must be a positive integer`);
      }
      if (nums.has(item.num)) {
        throw new Error(`${language}: duplicate num ${item.num}`);
      }
      if (!item.date || !item.title || !item.body) {
        throw new Error(`${language}: date, title, and body are required`);
      }
      nums.add(item.num);
    }

    const now = new Date().toISOString();
    const source = {
      schemaVersion: 1,
      language,
      version: Number(data.version || previousSource[language]?.version || 0) + 1,
      updatedAt: now,
      items,
    };
    await fs.writeFile(
      path.join(SOURCE_DIR, `${language}.json`),
      `${JSON.stringify(source, null, 2)}\n`,
      'utf8',
    );
  }
}

async function git(args) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 4,
  });
  return { stdout, stderr };
}

async function getStatus() {
  const { stdout } = await git(['status', '--short']);
  return stdout.trimEnd();
}

async function getCurrentBranch() {
  const { stdout } = await git(['branch', '--show-current']);
  return stdout.trim();
}

function getEnvironmentByBranch(branch) {
  return (
    Object.values(ENVIRONMENTS).find((environment) => environment.branch === branch) || {
      id: 'custom',
      label: 'Custom',
      branch,
      url: '',
    }
  );
}

async function getEnvironmentState() {
  const branch = await getCurrentBranch();
  const environment = getEnvironmentByBranch(branch);
  return {
    current: environment.id,
    branch,
    url: environment.url,
    environments: ENVIRONMENTS,
  };
}

async function branchExists(branch) {
  try {
    await git(['rev-parse', '--verify', branch]);
    return true;
  } catch {
    return false;
  }
}

async function remoteBranchExists(branch) {
  try {
    await git(['rev-parse', '--verify', `origin/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

async function switchEnvironment(environmentId) {
  const environment = ENVIRONMENTS[environmentId];
  if (!environment) throw new Error(`Unknown environment: ${environmentId}`);

  const status = await getStatus();
  if (status) {
    throw new Error('Please commit or discard local changes before switching environments.');
  }

  const branch = environment.branch;
  if (await branchExists(branch)) {
    await git(['switch', branch]);
  } else if (await remoteBranchExists(branch)) {
    await git(['switch', '--track', `origin/${branch}`]);
  } else {
    await git(['switch', '-c', branch]);
  }

  return getEnvironmentState();
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === 'GET' && pathname === '/api/source') {
      sendJson(res, 200, {
        source: await readSource(),
        status: await getStatus(),
        environment: await getEnvironmentState(),
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/status') {
      sendJson(res, 200, { status: await getStatus(), environment: await getEnvironmentState() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/environment') {
      const payload = await readRequestJson(req);
      const environment = await switchEnvironment(String(payload.environment || ''));
      sendJson(res, 200, { ok: true, environment, source: await readSource(), status: await getStatus() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/save') {
      const payload = await readRequestJson(req);
      await saveSource(payload.source);
      const generated = await generateAll();
      sendJson(res, 200, {
        ok: true,
        generated,
        status: await getStatus(),
        environment: await getEnvironmentState(),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate') {
      const generated = await generateAll();
      sendJson(res, 200, {
        ok: true,
        generated,
        status: await getStatus(),
        environment: await getEnvironmentState(),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/commit') {
      const payload = await readRequestJson(req);
      const message = String(payload.message || '').trim();
      const push = Boolean(payload.push);

      if (!message) throw new Error('Commit message is required');

      await git(['add', 'source', 'ja', 'en']);
      const staged = (await git(['diff', '--cached', '--name-only'])).stdout.trim();
      if (!staged) {
        sendJson(res, 200, {
          ok: false,
          message: 'No staged changes',
          status: await getStatus(),
          environment: await getEnvironmentState(),
        });
        return;
      }

      await git(['commit', '-m', message]);
      let pushOutput = '';
      if (push) {
        const branch = await getCurrentBranch();
        pushOutput = (await git(['push', '-u', 'origin', branch])).stdout;
      }
      sendJson(res, 200, {
        ok: true,
        committed: true,
        pushed: push,
        pushOutput,
        status: await getStatus(),
        environment: await getEnvironmentState(),
      });
      return;
    }

    sendJson(res, 404, { error: 'API route not found' });
  } catch (error) {
    sendJson(res, 500, { error: error.message || String(error) });
  }
}

async function serveStatic(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url.pathname);
    return;
  }
  await serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`xeloc news CMS: http://localhost:${PORT}`);
});
