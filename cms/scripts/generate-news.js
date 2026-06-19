#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIR = path.join(REPO_ROOT, 'source');
const LANGUAGES = ['ja', 'en'];

function publicItem(item) {
  return {
    num: Number(item.num),
    date: item.date,
    title: item.title,
    body: item.body,
  };
}

function sortByNumAsc(a, b) {
  return Number(a.num) - Number(b.num);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function removeStaleNumberFiles(langDir, validNums) {
  let entries = [];
  try {
    entries = await fs.readdir(langDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /^\d+\.json$/.test(entry.name))
      .filter((entry) => !validNums.has(Number(entry.name.replace(/\.json$/, ''))))
      .map((entry) => fs.unlink(path.join(langDir, entry.name))),
  );
}

async function generateLanguage(language) {
  const sourcePath = path.join(SOURCE_DIR, `${language}.json`);
  const langDir = path.join(REPO_ROOT, language);
  const source = await readJson(sourcePath);
  const now = new Date().toISOString();

  const published = (source.items || [])
    .filter((item) => item.status === 'published')
    .map(publicItem)
    .sort(sortByNumAsc);

  const validNums = new Set(published.map((item) => item.num));
  const latestNum = published.length > 0 ? Math.max(...published.map((item) => item.num)) : 0;
  const version = Number(source.version || source.revision || latestNum || 0);
  const updatedAt =
    source.updatedAt ||
    (source.items || [])
      .map((item) => item.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ||
    now;

  const index = {
    schemaVersion: 1,
    language,
    count: published.length,
    latestNum,
    version,
    updatedAt,
  };

  await fs.mkdir(langDir, { recursive: true });
  await writeJson(path.join(langDir, 'index.json'), index);
  await writeJson(path.join(langDir, 'all.json'), { items: published });
  await fs.writeFile(path.join(langDir, 'latest_num.json'), `${latestNum}\n`, 'utf8');

  await Promise.all(
    published.map((item) => writeJson(path.join(langDir, `${item.num}.json`), item)),
  );
  await removeStaleNumberFiles(langDir, validNums);

  return index;
}

async function generateAll() {
  const results = {};
  for (const language of LANGUAGES) {
    results[language] = await generateLanguage(language);
  }
  return results;
}

if (require.main === module) {
  generateAll()
    .then((results) => {
      console.log(JSON.stringify(results, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { generateAll, generateLanguage, LANGUAGES, REPO_ROOT, SOURCE_DIR };
