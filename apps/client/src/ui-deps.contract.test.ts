/**
 * After cutover to public @webpresso/ui, client must not reintroduce a private
 * Radix/shadcn stack. Any @radix-ui/* dependency must be justified by a live
 * import under apps/client/src.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const clientRoot = dirname(fileURLToPath(import.meta.url));
const clientDir = join(clientRoot, "..");
const packageJsonPath = join(clientDir, "package.json");
const srcDir = join(clientDir, "src");

describe("client UI dependency contract", () => {
  it("depends on public @webpresso/ui and not a private workspace UI package", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};
    expect(deps["@webpresso/ui"]).toBeTruthy();
    expect(deps["@repo/ui"]).toBeUndefined();
  });

  it("has no direct @radix-ui/* dependency without a live source import", () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    }).filter((name) => name.startsWith("@radix-ui/"));

    const srcText = collectSourceText(srcDir);
    const unused = declared.filter((name) => !srcText.includes(name));

    expect(unused).toEqual([]);
  });
});

function collectSourceText(root: string): string {
  if (!existsSync(root)) return "";
  const chunks: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(?:[cm]?[jt]sx?)$/u.test(entry)) continue;
      // Skip this contract file so a future allowlist comment cannot shadow deps.
      if (relative(root, full).replaceAll("\\", "/") === "ui-deps.contract.test.ts") {
        continue;
      }
      chunks.push(readFileSync(full, "utf8"));
    }
  };
  walk(root);
  return chunks.join("\n");
}
