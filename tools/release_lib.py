#!/usr/bin/env python3
"""Helpers for domestic release versioning, changelog notes, updater metadata, and build manifests."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

DOMESTIC_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)-domestic\.(\d+)$")
WORKSPACE_VERSION_RE = re.compile(
    r'(\[workspace\.package\]\s*(?:\r?\n[^\[]*?)*?\r?\nversion\s*=\s*")([^"]+)(")',
    re.MULTILINE,
)

DEFAULT_REPO = "juner122king/WestPlay"
CORE_RELEASE_RESOURCES = ("westplay.dll", "westplay-probe.exe", "westplay-maps.exe")


def validate_domestic_version(version: str) -> tuple[int, int, int, int]:
    """Validate `X.Y.Z-domestic.N` (N >= 1) and return its numeric parts."""
    match = DOMESTIC_VERSION_RE.match(version.strip())
    if not match:
        raise ValueError(f"Invalid domestic version '{version}'; expected X.Y.Z-domestic.N")
    major, minor, patch, rev = (int(part) for part in match.groups())
    if rev < 1:
        raise ValueError(f"Invalid domestic revision in '{version}'; revision must be >= 1")
    return major, minor, patch, rev


def next_domestic_version(current_version: str) -> str:
    """Increment the `-domestic.N` revision of `current_version`."""
    major, minor, patch, rev = validate_domestic_version(current_version)
    return f"{major}.{minor}.{patch}-domestic.{rev + 1}"


def read_workspace_version(repo_root: Path) -> str:
    """Read `[workspace.package].version` from `Cargo.toml`."""
    cargo_toml = (repo_root / "Cargo.toml").read_text(encoding="utf-8")
    match = WORKSPACE_VERSION_RE.search(cargo_toml)
    if not match:
        raise ValueError("Could not find [workspace.package] version in Cargo.toml")
    return match.group(2)


def _write_json_preserving_newline(path: Path, data: dict) -> None:
    original = path.read_text(encoding="utf-8")
    newline = "\r\n" if "\r\n" in original else "\n"
    trailing = newline if original.endswith("\n") else ""
    text = json.dumps(data, indent=2, ensure_ascii=False)
    if newline != "\n":
        text = text.replace("\n", newline)
    path.write_text(text + trailing, encoding="utf-8")


def sync_version(repo_root: Path, version: str) -> list[Path]:
    """Synchronize `version` across Cargo.toml, tauri.conf.json, ui/package.json, and ui/package-lock.json."""
    validate_domestic_version(version)
    changed: list[Path] = []

    cargo_path = repo_root / "Cargo.toml"
    cargo_text = cargo_path.read_text(encoding="utf-8")
    updated_cargo, count = WORKSPACE_VERSION_RE.subn(rf"\g<1>{version}\g<3>", cargo_text, count=1)
    if count != 1:
        raise ValueError("Failed to update [workspace.package] version in Cargo.toml")
    if updated_cargo != cargo_text:
        cargo_path.write_text(updated_cargo, encoding="utf-8")
    changed.append(cargo_path)

    tauri_path = repo_root / "app" / "tauri.conf.json"
    tauri_data = json.loads(tauri_path.read_text(encoding="utf-8"))
    tauri_data["version"] = version
    _write_json_preserving_newline(tauri_path, tauri_data)
    changed.append(tauri_path)

    ui_pkg_path = repo_root / "ui" / "package.json"
    ui_pkg_data = json.loads(ui_pkg_path.read_text(encoding="utf-8"))
    ui_pkg_data["version"] = version
    _write_json_preserving_newline(ui_pkg_path, ui_pkg_data)
    changed.append(ui_pkg_path)

    ui_lock_path = repo_root / "ui" / "package-lock.json"
    ui_lock_data = json.loads(ui_lock_path.read_text(encoding="utf-8"))
    ui_lock_data["version"] = version
    packages = ui_lock_data.get("packages")
    if isinstance(packages, dict) and isinstance(packages.get(""), dict):
        packages[""]["version"] = version
    _write_json_preserving_newline(ui_lock_path, ui_lock_data)
    changed.append(ui_lock_path)

    return changed


def extract_changelog_notes(changelog_text: str, version: str) -> str:
    """Extract the Markdown body for `## <version> ...` from CHANGELOG.md."""
    validate_domestic_version(version)
    lines = changelog_text.splitlines()
    heading_re = re.compile(rf"^##\s+{re.escape(version)}(?:\s|$)")
    start_idx = None
    for idx, line in enumerate(lines):
        if heading_re.match(line.strip()):
            start_idx = idx + 1
            break
    if start_idx is None:
        raise ValueError(f"CHANGELOG.md has no section for version '{version}'")

    collected: list[str] = []
    for line in lines[start_idx:]:
        if line.startswith("## "):
            break
        collected.append(line)

    notes = "\n".join(collected).strip()
    if not notes:
        raise ValueError(f"CHANGELOG.md section for version '{version}' is empty")
    return notes


def sha256_file(path: Path) -> str:
    """Compute lowercase SHA-256 hex digest for `path`."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_latest_json(
    version: str,
    notes: str,
    pub_date: str,
    download_url: str,
    signature: str,
) -> dict:
    """Build Tauri v2 updater `latest.json` payload."""
    validate_domestic_version(version)
    sig = signature.strip()
    if not sig:
        raise ValueError("Updater signature must not be empty")
    if not notes.strip():
        raise ValueError("Release notes must not be empty")
    if not download_url.startswith("https://") and not download_url.startswith("http://"):
        raise ValueError(f"Invalid download URL: {download_url}")
    return {
        "version": version,
        "notes": notes.strip(),
        "pub_date": pub_date,
        "platforms": {
            "windows-x86_64": {
                "signature": sig,
                "url": download_url,
            }
        },
    }


def build_release_manifest(
    repo_root: Path,
    version: str,
    commit: str,
    installer_path: Path,
    signature_path: Path,
    latest_json_path: Path,
    resources: tuple[str, ...] = CORE_RELEASE_RESOURCES,
) -> dict:
    """Create a verification manifest covering the installer, signature, updater manifest, and native resources."""
    release_dir = repo_root / "target" / "release"
    resource_records = {}
    for name in resources:
        res_path = release_dir / name
        if not res_path.is_file():
            raise FileNotFoundError(f"Missing release resource: {res_path}")
        resource_records[name] = {
            "size": res_path.stat().st_size,
            "sha256": sha256_file(res_path),
        }

    return {
        "version": version,
        "commit": commit.strip(),
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "installer": {
            "file": installer_path.name,
            "size": installer_path.stat().st_size,
            "sha256": sha256_file(installer_path),
        },
        "signature": {
            "file": signature_path.name,
            "size": signature_path.stat().st_size,
        },
        "latestJson": {
            "file": latest_json_path.name,
            "sha256": sha256_file(latest_json_path),
        },
        "resources": resource_records,
    }


def generate_release_artifacts(
    repo_root: Path,
    version: str,
    commit: str,
    repo_slug: str = DEFAULT_REPO,
    pub_date: str | None = None,
) -> dict[str, Path]:
    """Generate `latest.json`, `.sha256`, and `domestic-build-manifest.json` for a built NSIS release."""
    validate_domestic_version(version)
    bundle_dir = repo_root / "target" / "release" / "bundle" / "nsis"
    installer_name = f"WestPlay_{version}_x64-setup.exe"
    installer_path = bundle_dir / installer_name
    signature_path = bundle_dir / f"{installer_name}.sig"
    if not installer_path.is_file():
        raise FileNotFoundError(f"Missing NSIS installer: {installer_path}")
    if not signature_path.is_file():
        raise FileNotFoundError(
            f"Missing updater signature: {signature_path}. Ensure TAURI_SIGNING_PRIVATE_KEY is set."
        )

    changelog_text = (repo_root / "CHANGELOG.md").read_text(encoding="utf-8")
    notes = extract_changelog_notes(changelog_text, version)
    timestamp = pub_date or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    tag = f"v{version}"
    download_url = f"https://github.com/{repo_slug}/releases/download/{tag}/{installer_name}"
    signature = signature_path.read_text(encoding="utf-8").strip()

    latest_payload = build_latest_json(version, notes, timestamp, download_url, signature)
    latest_path = bundle_dir / "latest.json"
    latest_path.write_text(json.dumps(latest_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    installer_sha256 = sha256_file(installer_path)
    sha256_path = bundle_dir / f"{installer_name}.sha256"
    sha256_path.write_text(f"{installer_sha256} *{installer_name}\n", encoding="utf-8")

    manifest = build_release_manifest(repo_root, version, commit, installer_path, signature_path, latest_path)
    manifest_path = repo_root / "target" / "release" / "domestic-build-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    notes_path = bundle_dir / f"release-notes-{version}.md"
    notes_body = f"{notes}\n\n### 校验信息 / Checksums\n- `{installer_name}` SHA-256: `{installer_sha256}`\n"
    notes_path.write_text(notes_body, encoding="utf-8")

    return {
        "installer": installer_path,
        "signature": signature_path,
        "sha256": sha256_path,
        "latest": latest_path,
        "manifest": manifest_path,
        "notes": notes_path,
    }


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_cur = sub.add_parser("current-version")
    p_cur.add_argument("--repo-root", type=Path, default=Path.cwd())

    p_next = sub.add_parser("next-version")
    p_next.add_argument("--repo-root", type=Path, default=Path.cwd())

    p_sync = sub.add_parser("sync-version")
    p_sync.add_argument("--repo-root", type=Path, default=Path.cwd())
    p_sync.add_argument("--version", required=True)

    p_notes = sub.add_parser("extract-notes")
    p_notes.add_argument("--repo-root", type=Path, default=Path.cwd())
    p_notes.add_argument("--version", required=True)

    p_gen = sub.add_parser("generate-artifacts")
    p_gen.add_argument("--repo-root", type=Path, default=Path.cwd())
    p_gen.add_argument("--version", required=True)
    p_gen.add_argument("--commit", required=True)
    p_gen.add_argument("--repo", default=DEFAULT_REPO)

    args = parser.parse_args(argv)
    if args.command == "current-version":
        print(read_workspace_version(args.repo_root))
    elif args.command == "next-version":
        print(next_domestic_version(read_workspace_version(args.repo_root)))
    elif args.command == "sync-version":
        for path in sync_version(args.repo_root, args.version):
            print(path)
    elif args.command == "extract-notes":
        changelog = (args.repo_root / "CHANGELOG.md").read_text(encoding="utf-8")
        print(extract_changelog_notes(changelog, args.version))
    elif args.command == "generate-artifacts":
        artifacts = generate_release_artifacts(args.repo_root, args.version, args.commit, repo_slug=args.repo)
        print(json.dumps({k: str(v) for k, v in artifacts.items()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(_main())
