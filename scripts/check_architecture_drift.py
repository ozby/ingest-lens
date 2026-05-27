#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "docs/architecture.contract.json"
IGNORE_DIRS = {
    ".git",
    ".agent",
    ".agents",
    ".codex",
    ".cursor",
    ".gemini",
    ".omc",
    ".omx",
    ".opencode",
    ".windsurf",
    "node_modules",
    "dist",
    "coverage",
    "playwright-report",
    "test-results",
}


def walk_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in IGNORE_DIRS for part in path.relative_to(ROOT).parts):
            continue
        files.append(path)
    return sorted(files)


def match_glob(pattern: str, files: list[Path]) -> list[Path]:
    if "*" not in pattern:
        path = ROOT / pattern
        return [path] if path.exists() else []
    return sorted(
        [f for f in files if f.match(pattern)]
    )


def extract_frontmatter_status(text: str) -> str | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    frontmatter = text[4:end]
    m = re.search(r"^status:\s*[\"']?([^\"'\n]+)[\"']?\s*$", frontmatter, re.M)
    return m.group(1).strip() if m else None


def has_heading(text: str, heading: str) -> bool:
    target = re.sub(r"^#+\s*", "", heading).strip().lower()
    for line in text.splitlines():
        if re.sub(r"^#+\s*", "", line).strip().lower() == target:
            return True
    return False


def main() -> int:
    if not CONTRACT_PATH.exists():
        print("architecture drift: no contract file present; nothing to check")
        return 0

    contract: dict[str, Any] = json.loads(CONTRACT_PATH.read_text())
    files = walk_files()
    violations: list[str] = []

    for rel in contract.get("architectureDocs", []) + contract.get("requiredFiles", []):
        if not (ROOT / rel).exists():
            violations.append(f"missing required file: {rel}")

    for rule in contract.get("rules", []):
        matched: list[Path] = []
        for pattern in rule.get("paths", []):
            matched.extend(match_glob(pattern, files))
        deduped = sorted(set(matched))
        combined = "\n".join(path.read_text() for path in deduped)
        for needle in rule.get("mustContain", []):
            if needle not in combined:
                violations.append(f"rule {rule['id']} missing required text: {needle}")
        for needle in rule.get("mustNotContain", []):
            for path in deduped:
                if needle in path.read_text():
                    violations.append(
                        f"rule {rule['id']} found forbidden text {needle!r} in {path.relative_to(ROOT)}"
                    )

    policy = contract.get("blueprintPolicy", {})
    if policy.get("enabled", False):
        blueprint_files: list[Path] = []
        for pattern in policy.get("blueprintGlobs", ["blueprints/**/*.md"]):
            blueprint_files.extend(match_glob(pattern, files))
        architecture_refs = set(contract.get("architectureDocs", []))
        architecture_refs.add("docs/architecture.contract.json")
        exempt_statuses = set(policy.get("exemptStatuses", ["completed", "archived"]))
        markers = [m.lower() for m in policy.get("architectureChangeMarkers", [])]
        before_heading = policy.get("beforeHeading", "Architecture before")
        after_heading = policy.get("afterHeading", "Architecture after")

        for path in sorted(set(blueprint_files)):
            text = path.read_text()
            status = extract_frontmatter_status(text)
            if status in exempt_statuses:
                continue
            rel = str(path.relative_to(ROOT))
            if policy.get("requireArchitectureLinks", True):
                if not all(ref in text for ref in architecture_refs):
                    violations.append(
                        f"{rel}: active blueprint must link docs/architecture.md and docs/architecture.contract.json"
                    )
            lower = text.lower()
            if policy.get("requireBeforeAfterWhenArchitectureChanging", True) and any(m in lower for m in markers):
                if not has_heading(text, before_heading):
                    violations.append(f"{rel}: missing heading '{before_heading}'")
                if not has_heading(text, after_heading):
                    violations.append(f"{rel}: missing heading '{after_heading}'")

    if violations:
        print("architecture drift detected:")
        for violation in violations:
            print(f"- {violation}")
        return 1

    print("architecture drift: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
