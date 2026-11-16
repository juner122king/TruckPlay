# WestPlay 2.3.0-domestic.2 发布说明

发布日期：2026-11-16。基于上游 2.3.0，国内定制修订由 domestic.1 递增为 domestic.2。

## 本次更新

- 新增电台 App：真实目录、地区/类型筛选、每页 48 台、本地收藏及北京时间节目表。
- 电台和喜马拉雅点播共享隐藏 WebView2、一个音频元素及统一音效和播放控制；支持 HLS、暂停后重新连接直播、列表快照切台及有限重连。
- 修复连接阶段递归暂停和游戏已暂停时手动播放无响应；保留断电停止、媒体互斥及旧请求隔离。
- 更新喜马拉雅浏览与播放界面，整合导航、货运 HUD 和新增车型/平板屏幕支持。
- Rust、Tauri、npm 包及锁文件使用同一完整版本。安装包附带 hls.js 1.7.4 的上游声明和 Apache-2.0 许可证文本。

## 构建

仓库根目录的 PowerShell：

```powershell
$env:WESTPLAY_LLVM_MINGW = (Resolve-Path target/toolchains/llvm-mingw-20260602-ucrt-x86_64).Path
$env:CC = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/clang.exe'
$env:AR = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/llvm-ar.exe'
npm run build:release -- --ci -- --locked
```

该命令先构建地图程序、图形探测程序和插件，再构建正式 UI 与 NSIS 安装包。插件构建仅暂存到工作区；安装包供手动升级，沿用原有标识和用户数据目录，在线更新保持关闭。

产物目录：`target/release/bundle/nsis/`。发布交付包括 `WestPlay_2.3.0-domestic.2_x64-setup.exe`、同名 SHA-256 校验文件和解包核对清单。清单记录源码提交、包哈希、程序版本和逐项资源核对结果。

构建与解包校验不代替用户环境中的安装升级、ETS2/ATS 插件加载、账号与真实声音验收。
