import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PRIVATE_SCOPE_PATTERN = /^@(webpresso|ozby)\//;
const GITHUB_TARBALL_PATTERN = /^https:\/\/npm\.pkg\.github\.com\/download\/@(webpresso|ozby)\//;

export function discoverPrivatePackageTarballs(lockfileText) {
  const packages = new Map();
  const lines = lockfileText.split(/\r?\n/);
  let currentName = null;
  let currentVersion = null;

  for (const line of lines) {
    const packageMatch = line.match(/^\s{2}'(@(?:webpresso|ozby)\/[^']+)@([^']+)':\s*$/);
    if (packageMatch) {
      currentName = packageMatch[1];
      currentVersion = packageMatch[2];
      continue;
    }

    if (!currentName || !currentVersion) continue;

    const tarballMatch = line.match(/tarball:\s*(https:\/\/npm\.pkg\.github\.com\/download\/[^,}\s]+)/);
    if (!tarballMatch) continue;

    const tarballUrl = tarballMatch[1];
    if (!PRIVATE_SCOPE_PATTERN.test(currentName) || !GITHUB_TARBALL_PATTERN.test(tarballUrl)) {
      currentName = null;
      currentVersion = null;
      continue;
    }

    packages.set(`${currentName}@${currentVersion}`, {
      name: currentName,
      version: currentVersion,
      tarballUrl,
    });
    currentName = null;
    currentVersion = null;
  }

  return [...packages.values()].sort((left, right) => {
    const leftKey = `${left.name}@${left.version}`;
    const rightKey = `${right.name}@${right.version}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function renderNpmrc(token) {
  return [
    '@webpresso:registry=https://npm.pkg.github.com',
    '@ozby:registry=https://npm.pkg.github.com',
    `//npm.pkg.github.com/:_authToken=${token}`,
    'always-auth=true',
    '',
  ].join('\n');
}

function defaultRunCommand(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    return { ok: false, output: (result.stderr || result.stdout || '').trim() };
  }
  return { ok: true, output: result.stdout.trim() };
}

export async function verifyPackageTarballs(packages, token, runCommand = defaultRunCommand) {
  const failures = [];
  const tempDir = mkdtempSync(join(tmpdir(), 'ingest-package-auth-'));
  const npmrcPath = join(tempDir, '.npmrc');

  try {
    writeFileSync(npmrcPath, renderNpmrc(token), 'utf8');

    for (const pkg of packages) {
      const spec = `${pkg.name}@${pkg.version}`;
      const env = { ...process.env, GH_PACKAGES_TOKEN: token, NPM_CONFIG_USERCONFIG: npmrcPath };
      const view = runCommand('npm', ['view', spec, 'dist.tarball', '--registry=https://npm.pkg.github.com'], { env });
      if (!view.ok) {
        failures.push(`${spec} (view failed)`);
        continue;
      }
      const pack = runCommand(
        'npm',
        ['pack', spec, '--ignore-scripts', '--pack-destination', tempDir, '--registry=https://npm.pkg.github.com'],
        { env },
      );
      if (!pack.ok) failures.push(`${spec} (pack failed)`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  return failures;
}

async function main() {
  const outputPath = process.env.GITHUB_OUTPUT;
  const trustedContext = process.env.TRUSTED_CONTEXT === 'true';
  const token = process.env.GH_PACKAGES_TOKEN || '';
  const lockfilePath = process.env.LOCKFILE_PATH || 'pnpm-lock.yaml';

  const writeOutput = (name, value) => {
    if (outputPath) {
      appendFileSync(outputPath, `${name}=${value}\n`);
    } else {
      console.log(`${name}=${value}`);
    }
  };

  if (!trustedContext) {
    writeOutput('has_packages_token', 'false');
    writeOutput('authoritative', 'false');
    writeOutput('package_count', '0');
    console.log('Non-authoritative fork context: skipping private package auth proof.');
    return;
  }

  writeOutput('authoritative', 'true');

  if (!token) {
    writeOutput('has_packages_token', 'false');
    writeOutput('package_count', '0');
    throw new Error('Trusted context requires GH_PACKAGES_TOKEN; refusing to report a green package-auth gate.');
  }

  const packages = discoverPrivatePackageTarballs(readFileSync(lockfilePath, 'utf8'));
  writeOutput('package_count', String(packages.length));

  if (packages.length === 0) {
    writeOutput('has_packages_token', 'true');
    console.log('No GitHub Packages private @webpresso/@ozby tarballs found in pnpm-lock.yaml.');
    return;
  }

  const failures = await verifyPackageTarballs(packages, token);
  if (failures.length > 0) {
    writeOutput('has_packages_token', 'false');
    throw new Error(`GH_PACKAGES_TOKEN could not fetch private package tarballs: ${failures.join(', ')}`);
  }

  writeOutput('has_packages_token', 'true');
  console.log(`GH_PACKAGES_TOKEN fetched ${packages.length} private package tarball(s) from pnpm-lock.yaml.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
