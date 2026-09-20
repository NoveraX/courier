/**
 * Unified release script for semantic-release @semantic-release/exec.
 * Automatically discovers all packages in packages/ directory.
 *
 * Usage:
 *   tsx scripts/release.ts prepare <version>
 *   tsx scripts/release.ts publish <version>
 */
import { execSync } from "node:child_process";
import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , command, version] = process.argv;

if (!command || !version) {
	console.error("Usage: tsx scripts/release.ts <prepare|publish> <version>");
	process.exit(1);
}

interface PackageJson {
	name: string;
	version: string;
	dependencies?: Record<string, string>;
}

const SCOPE = "@noverax/";

function discoverPackages(): string[] {
	const packagesDir = "packages";
	const dirs = readdirSync(packagesDir)
		.map((name) => join(packagesDir, name))
		.filter((dir) => {
			try {
				return statSync(join(dir, "package.json")).isFile();
			} catch {
				return false;
			}
		});

	// Sort: packages without @noverax/* deps first (core), then the rest
	return dirs.sort((a, b) => {
		const aDeps = readPkg(a).dependencies ?? {};
		const bDeps = readPkg(b).dependencies ?? {};
		const aHasInternal = Object.keys(aDeps).some((d) => d.startsWith(SCOPE));
		const bHasInternal = Object.keys(bDeps).some((d) => d.startsWith(SCOPE));
		return Number(aHasInternal) - Number(bHasInternal);
	});
}

function readPkg(pkgDir: string): PackageJson {
	return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
}

function updateVersion(pkgDir: string, ver: string): void {
	const file = join(pkgDir, "package.json");
	const pkg = readPkg(pkgDir);
	pkg.version = ver;

	// Pin all inter-package dependencies to exact version
	if (pkg.dependencies) {
		for (const dep of Object.keys(pkg.dependencies)) {
			if (dep.startsWith(SCOPE)) {
				pkg.dependencies[dep] = ver;
			}
		}
	}

	writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

const packages = discoverPackages();

if (command === "prepare") {
	for (const dir of packages) updateVersion(dir, version);
	for (const dir of packages) copyFileSync("LICENSE", join(dir, "LICENSE"));
	execSync("npx turbo run build", { stdio: "inherit" });
	console.log(`Prepared v${version} (${packages.length} packages)`);
}

if (command === "publish") {
	for (const dir of packages) {
		execSync(`npm publish ${dir} --access public`, { stdio: "inherit" });
	}
	console.log(`Published v${version} (${packages.length} packages)`);
}
