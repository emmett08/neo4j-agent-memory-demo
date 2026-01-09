import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@neuralsea/neo4j-agent-memory";
const PACKAGE_DIR = "packages/neo4j-agent-memory";
const PACKAGE_JSON = "package.json";
const NODE_MODULES_DIR = "node_modules";
const SCOPED_DIR = "@neuralsea";
const SCOPED_PACKAGE_DIR = path.join(NODE_MODULES_DIR, SCOPED_DIR, "neo4j-agent-memory");
const LEGACY_PACKAGE_DIR = path.join(NODE_MODULES_DIR, "neo4j-agent-memory");

function readPackageName(packageJsonPath) {
  const raw = fs.readFileSync(packageJsonPath, "utf8");
  const pkg = JSON.parse(raw);
  return pkg?.name;
}

function resolveRealPath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function isValidPackageDir(candidatePath, expectedName) {
  const packageJsonPath = path.join(candidatePath, PACKAGE_JSON);
  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }
  return readPackageName(packageJsonPath) === expectedName;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createLink(targetPath, linkPath) {
  const linkType = process.platform === "win32" ? "junction" : "dir";
  fs.symlinkSync(targetPath, linkPath, linkType);
}

export function ensureWorkspaceLinks(options = {}) {
  const repoRoot = options.repoRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const logger = options.logger ?? console;

  const packageDir = path.join(repoRoot, PACKAGE_DIR);
  const packageJsonPath = path.join(packageDir, PACKAGE_JSON);
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Workspace package not found at ${packageDir}.`);
  }

  const actualName = readPackageName(packageJsonPath);
  if (actualName !== PACKAGE_NAME) {
    throw new Error(`Expected ${PACKAGE_NAME} at ${packageDir}, found ${actualName ?? "unknown"}.`);
  }

  const scopedPackagePath = path.join(repoRoot, SCOPED_PACKAGE_DIR);
  if (fs.existsSync(scopedPackagePath)) {
    const resolved = resolveRealPath(scopedPackagePath);
    if (!isValidPackageDir(resolved, PACKAGE_NAME)) {
      throw new Error(
        `Found ${scopedPackagePath} but it is not a valid ${PACKAGE_NAME} workspace link. ` +
          "Remove it and re-run npm install."
      );
    }
    logger.info(`[workspace-link] ${PACKAGE_NAME} already linked.`);
    return { status: "ok", action: "none" };
  }

  const legacyPackagePath = path.join(repoRoot, LEGACY_PACKAGE_DIR);
  if (fs.existsSync(legacyPackagePath)) {
    const resolvedLegacy = resolveRealPath(legacyPackagePath);
    if (!isValidPackageDir(resolvedLegacy, PACKAGE_NAME)) {
      logger.warn(
        `[workspace-link] Found legacy ${legacyPackagePath} but it is not ${PACKAGE_NAME}. Ignoring.`
      );
    }
  }

  const scopedDirPath = path.join(repoRoot, NODE_MODULES_DIR, SCOPED_DIR);
  ensureDir(scopedDirPath);
  createLink(packageDir, scopedPackagePath);
  logger.info(`[workspace-link] Linked ${PACKAGE_NAME} -> ${packageDir}.`);
  return { status: "ok", action: "linked" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    ensureWorkspaceLinks();
  } catch (error) {
    console.error(`[workspace-link] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
