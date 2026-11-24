# TruckPlay 发布与自动更新流程

## 1. 签名密钥说明

- 签名私钥保存在仓库外（优先读取 `%USERPROFILE%\.tauri\truckplay.key`，若不存在则兼容回退 `%USERPROFILE%\.tauri\westplay-domestic.key`），切勿提交到 Git 仓库（`.gitignore` 已屏蔽 `*.key`）。
- 对应公钥配置在 `app/tauri.conf.json` 的 `plugins.updater.pubkey`，并开启 `requireSignedVersion: true` 与 `windows.installMode: "passive"`。
- 发布脚本在打包前会校验本地 `.key.pub` 与 `app/tauri.conf.json` 中的公钥是否一致。

## 2. 应用内自动检查更新机制

- 后端模块：`app/src/update.rs` 使用 `tauri-plugin-updater`（`native-tls` + `system-proxy` + `zip`），更新源指向：
  `https://github.com/juner122king/TruckPlay/releases/latest/download/latest.json`
- 检查时机：
  - Release 版本启动 30 秒后自动检查一次，之后每 6 小时检查一次（请求失败则 30 分钟后重试）。
  - 打开 Companion 窗口及进入“关于”页面时会自动检查，在“关于”页面也可点击“软件更新”行手动重试/复查。
  - Debug 构建默认不请求远端接口；如需本地联调，可设置环境变量 `WESTPLAY_DEV_UPDATE_ENDPOINT=http://127.0.0.1:<port>/latest.json`。
- 安装流程：发现新版本后弹出 `UpdateSheet` 展示 `CHANGELOG.md` 对应更新日志；点击“更新”且游戏未运行时，下载并校验证书签名及版本号，随后停止 `westplay-host` 并以 passive 模式运行 NSIS 安装器覆盖升级并重启；重启后 `FinishUpdate` 会自动同步新版 `westplay.dll`、`westplay-probe.exe` 与游戏 Mod。

## 3. 本地部署发布操作

### 3.1 本地演练构建（不推送远端）

1. 在 `CHANGELOG.md` 添加对应版本的条目（例如 `## 1.0.0-rc.1 (2026-11-24)`）。
2. 执行本地发布演练（包含测试门禁、资源编译、签名打包、`latest.json` 与 SHA-256 生成）：
   ```powershell
   npm run release:dry
   ```
   产物输出位置：
   - `target/release/bundle/nsis/TruckPlay_<version>_x64-setup.exe`
   - `target/release/bundle/nsis/TruckPlay_<version>_x64-setup.exe.sig`
   - `target/release/bundle/nsis/TruckPlay_<version>_x64-setup.exe.sha256`
   - `target/release/bundle/nsis/latest.json`
   - `target/release/domestic-build-manifest.json`

### 3.2 正式发布到 GitHub Releases

确保已提交并推送源码改动后，执行：

```powershell
# 使用当前版本发布
npm run release

# 或指定新版本号并同步清单（需先写好 CHANGELOG.md 并提交，或提前运行 sync-version）
powershell -NoProfile -ExecutionPolicy Bypass -File tools/release.ps1 -Version 1.0.0
```

常用参数：
- `-DryRun`：仅本地构建签名并生成清单，不推送 tag 与 Release；
- `-Deploy`：构建后顺便将 `westplay.dll` 与 `westplay-probe.exe` 部署到本机游戏目录；
- `-Overwrite`：覆盖已有同名 tag 的 Release 资源；
- `-SkipTests`：跳过测试门禁（不推荐）。
