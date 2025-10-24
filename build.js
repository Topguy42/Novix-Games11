// build.js
import { execSync, spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import fse from 'fs-extra';
import git from 'isomorphic-git';
import minimist from 'minimist';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projdir = __dirname;

// JSON stream writer for large arrays
class JsonArrayWriter {
  constructor(filePath) {
    this.stream = createWriteStream(filePath);
    this.count = 0;
    this.stream.write('[\n');
  }

  async write(obj) {
    if (this.count > 0) {
      this.stream.write(',\n');
    }
    this.stream.write('  ' + JSON.stringify(obj));
    this.count++;
  }

  async end() {
    this.stream.write('\n]\n');
    return new Promise((resolve, reject) => {
      this.stream.end((err) => (err ? reject(err) : resolve(this.count)));
    });
  }
}

// Move remaining top-level constants and configuration outside the class
const args = minimist(process.argv.slice(2));
const SKIP_SUBMODULES = args['skip-submodules'] || process.env.SKIP_SUBMODULES === '1' || false;
const USAGE = `build.js [options]

Options:
  --help, -h              Show this help message
  --skip-submodules       Skip building external submodules (env SKIP_SUBMODULES=1)
  --env=NAME              Set environment mode (e.g., --env=debug)
`;

// --- Submodules configuration (mirrors .gitmodules and bash array)
const Submodules = ['scramjet', 'ultraviolet', 'bare-mux', 'libcurl-transport', 'epoxy', 'wisp-client-js', 'bare-server-node', 'wisp-server-node'];

// --- Build commands ---
const buildCommands = {
  'scramjet': "CI=true pnpm install && PATH='$HOME/.cargo/bin:$PATH' npm run rewriter:build && npm run build:all",
  'ultraviolet': 'CI=true pnpm install && pnpm run build',
  'bare-mux': 'CI=true pnpm install && pnpm run build',
  'epoxy': 'CI=true pnpm install && pnpm run build',
  'libcurl-transport': 'CI=true pnpm install && pnpm run build',
  'wisp-client-js': 'CI=true npm install && npm run build',
  'bare-server-node': 'CI=true pnpm install && pnpm run build',
  'wisp-server-node': 'CI=true pnpm install && pnpm run build'
};
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
// --- Asset building ---
const INPUT_IMAGES = path.join(projdir, 'inputimages');
const INPUT_VECTORS = path.join(projdir, 'inputvectors');
const OUTPUT_OPTIMG = path.join(projdir, 'public', 'optimg');
const OUTPUT_OUTVECT = path.join(projdir, 'public', 'outvect');

// Raster formats to generate
const RASTER_TARGETS = [
  { ext: '.avif', opts: (img) => img.avif({ quality: 80 }) },
  { ext: '.webp', opts: (img) => img.webp({ quality: 80 }) },
  { ext: '.jpg', opts: (img) => img.jpeg({ quality: 80 }) },
  { ext: '.png', opts: (img) => img.png() }
];

// Recognized raster inputs (will be processed via sharp)
const RASTER_INPUT_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.avif'];

// Recognized vector inputs (will be copied and rasterized via sharp)
const VECTOR_INPUT_EXTS = ['.svg', '.pdf'];

function logSection(title) {
  const bar = '-'.repeat(Math.max(10, title.length));
  console.log(`\n${bar}\n${title}\n${bar}`);
}

async function ensureSubmodules() {
  logSection('Checking git submodules');
  let missing = false;
  for (const name of Submodules) {
    const dir = path.join(projdir, 'external', name);
    const exists = await fse.pathExists(dir);
    if (!exists) {
      missing = true;
      break;
    }
  }

  if (missing) {
    console.log('Not all submodules found, installing...');
    await new Promise((resolve, reject) => {
      const p = spawn('git', ['submodule', 'update', '--init', '--recursive'], { cwd: projdir, stdio: 'inherit' });
      p.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('git submodule update failed with code ' + code));
      });
    });
  } else {
    console.log('All submodules exist, continuing...');
  }
}

function checkWSL() {
  try {
    const output = execSync('wsl.exe --list --quiet', { encoding: 'utf-8' });
    const distros = output;
    if (!distros || distros.trim().length === 0) {
      throw new Error('WSL is installed but no distros found.');
    }
    console.log(`WSL distros detected: ${distros.trim()}`);
  } catch (err) {
    throw new Error('WSL is not installed or inaccessible. Details: ' + err.message);
  }
}

function wrapCommandForWSL(command, cwd) {
  if (os.platform() !== 'win32') {
    console.log('Non-Windows platform detected, continuing');
    return command;
  }
  console.log('Windows detected, checking WSL...');
  checkWSL();

  // Convert Windows path to WSL path
  const wslPath = cwd
    .replace(/\\/g, '/')
    .replace(/^([A-Za-z]):/, '/mnt/$1')
    .toLowerCase();
  return `wsl bash -c "source ~/.bashrc && cd '${wslPath}' && ${command}"`;
}

async function buildSubmodules() {
  for (const name of Submodules) {
    logSection(`Building ${name}`);
    const subdir = path.join(projdir, 'external', name);
    const buildcommand = buildCommands[name];
    if (!buildcommand) {
      console.warn(`No build command found for ${name}; skipping.`);
      continue;
    }

    const wrapped = wrapCommandForWSL(buildcommand, subdir);

    await new Promise((resolve, reject) => {
      const command = spawn(wrapped, {
        shell: true,
        env: { ...process.env, RELEASE: '1' },
        stdio: ['inherit', 'pipe', 'pipe']
      });

      command.stdout.on('data', (data) => {
        process.stdout.write(`${GREEN}${data}${RESET}`);
      });
      if (args.env === 'debug') {
        command.stderr.on('data', (data) => {
          process.stderr.write(`${YELLOW}${data}${RESET}`);
        });
      }
      command.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed for ${name} with exit code ${code}`));
        }
      });
    });
  }
}

function shouldProcess(ext, validExts) {
  return validExts.includes(ext.toLowerCase());
}

async function convertRasterFile(inputPath, baseDir, outBase) {
  const ext = path.extname(inputPath).toLowerCase();
  const rel = path.relative(baseDir, inputPath);
  const relNoExt = rel.slice(0, -ext.length);

  // Always copy original file into output
  const copyDest = path.join(outBase, rel);
  await fse.ensureDir(path.dirname(copyDest));
  await fse.copyFile(inputPath, copyDest);
  console.log(`Copied original: ${path.relative(outBase, copyDest)}`);

  // Convert to all targets except same-format
  const buffer = await fs.readFile(inputPath);
  const image = sharp(buffer);

  for (const target of RASTER_TARGETS) {
    if (target.ext === ext) {
      // Skip same-format conversion
      continue;
    }
    const outPath = path.join(outBase, relNoExt + target.ext);
    await fse.ensureDir(path.dirname(outPath));
    await target.opts(image.clone()).toFile(outPath);
    console.log(`${rel} → ${path.relative(outBase, outPath)}`);
  }
}

async function copyVectorOriginal(inputPath, baseDir, outBase) {
  const rel = path.relative(baseDir, inputPath);
  const dest = path.join(outBase, rel);
  await fse.ensureDir(path.dirname(dest));
  await fse.copyFile(inputPath, dest);
  console.log(`Copied vector: ${path.relative(outBase, dest)}`);
}

async function rasterizeVectorFallbacks(inputPath, baseDir, outBase) {
  const ext = path.extname(inputPath).toLowerCase();
  const rel = path.relative(baseDir, inputPath);
  const relNoExt = rel.slice(0, -ext.length);

  const buffer = await fs.readFile(inputPath);
  const image = sharp(buffer);

  for (const target of RASTER_TARGETS) {
    const outPath = path.join(outBase, relNoExt + target.ext);
    await fse.ensureDir(path.dirname(outPath));
    await target.opts(image.clone()).toFile(outPath);
    console.log(`${rel} → ${path.relative(outBase, outPath)}`);
  }
}
async function walk(dir, handler) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fse.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        await handler(full);
      }
    }
  }
}

async function processInputImages() {
  logSection('Processing raster images (/inputimages → /public/optimg)');
  const exists = await fse.pathExists(INPUT_IMAGES);
  if (!exists) {
    console.warn('inputimages directory not found; skipping raster pipeline.');
    return;
  }
  await walk(INPUT_IMAGES, async (file) => {
    const ext = path.extname(file).toLowerCase();
    if (!shouldProcess(ext, RASTER_INPUT_EXTS)) return;
    await convertRasterFile(file, INPUT_IMAGES, OUTPUT_OPTIMG);
  });
}

async function processInputVectors() {
  logSection('Processing vectors (/inputvectors → /public/outvect)');
  const exists = await fse.pathExists(INPUT_VECTORS);
  if (!exists) {
    console.warn('inputvectors directory not found; skipping vector pipeline.');
    return;
  }
  await walk(INPUT_VECTORS, async (file) => {
    const ext = path.extname(file).toLowerCase();
    if (!shouldProcess(ext, VECTOR_INPUT_EXTS)) return;
    // Copy original vector
    await copyVectorOriginal(file, INPUT_VECTORS, OUTPUT_OUTVECT);
    // Raster fallbacks
    await rasterizeVectorFallbacks(file, INPUT_VECTORS, OUTPUT_OUTVECT);
  });
}
const HTML_EXT = '.html';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'];

// Synchronous git helpers removed in favor of async variants (getGitLastModAsync, getGitCommitCountAsync)
// Async crawl that collects file entries without running git per-file synchronously
async function crawlAsync(dir, baseUrl = '') {
  const results = [];
  const entries = await fse.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = await crawlAsync(full, baseUrl + '/' + entry.name);
      results.push(...child);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (![HTML_EXT, ...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(ext)) continue;
    // Determine URL path: index.html maps to directory
    const urlPath = ext === HTML_EXT && entry.name.toLowerCase() === 'index.html' ? (baseUrl === '' ? '/' : baseUrl) : baseUrl + '/' + entry.name;
    const stat = await fse.stat(full);
    // For now set lastmod and commitCount to null; we'll fetch in parallel later
    results.push({ filePath: full, loc: urlPath.replace(/\/+/g, '/'), lastmod: stat.mtime.toISOString(), ext, commitCount: 0 });
  }
  return results;
}

// execPromise removed; replaced by isomorphic-git

// Use isomorphic-git for fast, native git metadata
const workdir = __dirname;
async function getGitLastModAsync(filePath) {
  try {
    const relPath = path.relative(workdir, filePath).replace(/\\/g, '/');
    const commits = await git.log({ fs: fse, dir: workdir, filepath: relPath, depth: 1 });
    if (commits && commits.length > 0) {
      return new Date(commits[0].commit.committer.timestamp * 1000).toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

async function getGitCommitCountAsync(filePath) {
  try {
    const relPath = path.relative(workdir, filePath).replace(/\\/g, '/');
    const commits = await git.log({ fs: fse, dir: workdir, filepath: relPath });
    return commits.length;
  } catch {
    return 0;
  }
}

// Simple concurrency limiter for promises
function withConcurrencyLimit(items, limit, fn) {
  const results = [];
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch {
        results[idx] = null;
      }
    }
  });
  return Promise.all(workers).then(() => results);
}
function computePriority(commitCount, maxCommits) {
  if (maxCommits === 0) return 0.5;
  const normalized = commitCount / maxCommits;
  return Math.max(0.1, Math.min(1.0, normalized));
}

function computeChangefreq(lastmod) {
  const last = new Date(lastmod);
  const days = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
  if (isNaN(days)) return 'monthly';
  if (days <= 7) return 'daily';
  if (days <= 30) return 'weekly';
  if (days <= 180) return 'monthly';
  return 'yearly';
}

function formatDuration(ms) {
  let s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  s = s % 3600;
  const m = Math.floor(s / 60);
  s = s % 60;
  let out = '';
  if (h > 0) out += `${h}h `;
  if (m > 0 || h > 0) out += `${m}m `;
  out += `${s}s`;
  return out.trim();
}

async function main() {
  const start = Date.now();
  logSection(`Build start (${new Date().toLocaleString()}) on ${os.platform()} node ${process.version}`);

  if (args.help || args.h) {
    console.log(USAGE);
    return;
  }

  if (!SKIP_SUBMODULES) {
    await ensureSubmodules();
    await buildSubmodules();
  } else {
    console.log('Skipping submodule builds due to SKIP_SUBMODULES flag');
  }

  await processInputImages();
  await processInputVectors();
  // Crawl files asynchronously
  const crawled = await crawlAsync(path.join(__dirname, 'public'));
  console.log('Crawled', crawled.length, 'files, fetching git metadata in parallel...');

  // Initialize JSON array writer
  const writer = new JsonArrayWriter('.sitemap-base.json');

  // Process files in batches for memory efficiency
  const batchSize = 20;
  let processed = 0;
  let maxCommits = 0;
  const batches = Math.ceil(crawled.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, crawled.length);
    const batch = crawled.slice(start, end);

    // Enrich batch entries with git metadata in parallel
    const enriched = await withConcurrencyLimit(batch, 40, async (entry) => {
      const [lm, cc] = await Promise.all([getGitLastModAsync(entry.filePath), getGitCommitCountAsync(entry.filePath)]);
      const commitCount = cc || 0;
      maxCommits = Math.max(maxCommits, commitCount);
      return {
        loc: entry.loc,
        lastmod: lm || entry.lastmod,
        ext: entry.ext,
        commitCount
      };
    });

    // Process and write entries
    for (const entry of enriched) {
      await writer.write({
        ...entry,
        priority: computePriority(entry.commitCount, maxCommits),
        changefreq: computeChangefreq(entry.lastmod)
      });
      processed++;
    }

    if ((i + 1) % 5 === 0 || i === batches - 1) {
      console.log(`Processed ${processed}/${crawled.length} files...`);
    }
  }

  const finalCount = await writer.end();
  console.log('Sitemap base built with', finalCount, 'entries');

  logSection(`Done in ${formatDuration(Date.now() - start)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
