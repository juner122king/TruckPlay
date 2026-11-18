"""Unit tests for tools/release_lib.py using temporary directories."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("release_lib", Path(__file__).parents[1] / "release_lib.py")
release_lib = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release_lib)


def _create_fake_repo(root: Path, version: str = "2.4.0-domestic.2") -> None:
    (root / "app").mkdir(parents=True, exist_ok=True)
    (root / "ui").mkdir(parents=True, exist_ok=True)
    (root / "Cargo.toml").write_text(
        f'[workspace]\nmembers = ["app"]\n\n[workspace.package]\nversion = "{version}"\nedition = "2024"\n',
        encoding="utf-8",
    )
    (root / "app" / "tauri.conf.json").write_text(
        json.dumps({"productName": "WestPlay", "version": version}, indent=2) + "\n",
        encoding="utf-8",
    )
    (root / "ui" / "package.json").write_text(
        json.dumps({"name": "westplay-ui", "version": version}, indent=2) + "\n",
        encoding="utf-8",
    )
    (root / "ui" / "package-lock.json").write_text(
        json.dumps(
            {"name": "westplay-ui", "version": version, "packages": {"": {"name": "westplay-ui", "version": version}}},
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (root / "CHANGELOG.md").write_text(
        "# Changelog\n\n"
        f"## {version} 国内定制版 / Domestic Edition (2026-11-17)\n"
        "- 新增本地部署发布流程。\n"
        "- Added in-app auto-updater.\n\n"
        "## 2.4.0-domestic.1 (2026-11-16)\n"
        "- Initial 2.4.0 merge.\n",
        encoding="utf-8",
    )


class ReleaseLibTests(unittest.TestCase):
    def test_validate_and_increment_domestic_version(self):
        self.assertEqual(release_lib.validate_domestic_version("2.4.0-domestic.2"), (2, 4, 0, 2))
        self.assertEqual(release_lib.next_domestic_version("2.4.0-domestic.2"), "2.4.0-domestic.3")
        with self.assertRaises(ValueError):
            release_lib.validate_domestic_version("2.4.0")
        with self.assertRaises(ValueError):
            release_lib.validate_domestic_version("2.4.0-domestic.0")

    def test_sync_version_updates_all_four_manifests(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            _create_fake_repo(root, "2.4.0-domestic.2")
            release_lib.sync_version(root, "2.4.0-domestic.3")

            self.assertEqual(release_lib.read_workspace_version(root), "2.4.0-domestic.3")
            self.assertEqual(json.loads((root / "app" / "tauri.conf.json").read_text())["version"], "2.4.0-domestic.3")
            self.assertEqual(json.loads((root / "ui" / "package.json").read_text())["version"], "2.4.0-domestic.3")
            lock = json.loads((root / "ui" / "package-lock.json").read_text())
            self.assertEqual(lock["version"], "2.4.0-domestic.3")
            self.assertEqual(lock["packages"][""]["version"], "2.4.0-domestic.3")

    def test_extract_changelog_notes_isolates_target_version(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            _create_fake_repo(root, "2.4.0-domestic.2")
            changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
            notes = release_lib.extract_changelog_notes(changelog, "2.4.0-domestic.2")
            self.assertEqual(notes, "- 新增本地部署发布流程。\n- Added in-app auto-updater.")
            with self.assertRaises(ValueError):
                release_lib.extract_changelog_notes(changelog, "2.4.0-domestic.99")

    def test_generate_release_artifacts_builds_latest_json_sha256_and_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            version = "2.4.0-domestic.2"
            _create_fake_repo(root, version)

            release_dir = root / "target" / "release"
            bundle_dir = release_dir / "bundle" / "nsis"
            bundle_dir.mkdir(parents=True)
            for name in release_lib.CORE_RELEASE_RESOURCES:
                (release_dir / name).write_bytes(f"binary:{name}".encode())

            installer = bundle_dir / f"WestPlay_{version}_x64-setup.exe"
            installer.write_bytes(b"fake-nsis-installer-bytes")
            sig = bundle_dir / f"WestPlay_{version}_x64-setup.exe.sig"
            sig.write_text("dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==\n", encoding="utf-8")

            artifacts = release_lib.generate_release_artifacts(
                root, version, "abc1234", pub_date="2026-11-17T09:30:00Z"
            )
            latest = json.loads(artifacts["latest"].read_text(encoding="utf-8"))
            self.assertEqual(latest["version"], version)
            self.assertEqual(latest["pub_date"], "2026-11-17T09:30:00Z")
            self.assertEqual(
                latest["platforms"]["windows-x86_64"]["url"],
                f"https://github.com/juner122king/WestPlay/releases/download/v{version}/WestPlay_{version}_x64-setup.exe",
            )
            self.assertEqual(
                latest["platforms"]["windows-x86_64"]["signature"],
                "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==",
            )

            expected_hash = release_lib.sha256_file(installer)
            self.assertEqual(
                artifacts["sha256"].read_text(encoding="utf-8").strip(),
                f"{expected_hash} *WestPlay_{version}_x64-setup.exe",
            )
            manifest = json.loads(artifacts["manifest"].read_text(encoding="utf-8"))
            self.assertEqual(manifest["version"], version)
            self.assertEqual(manifest["commit"], "abc1234")
            self.assertEqual(manifest["installer"]["sha256"], expected_hash)
            self.assertEqual(set(manifest["resources"].keys()), set(release_lib.CORE_RELEASE_RESOURCES))


if __name__ == "__main__":
    unittest.main()
