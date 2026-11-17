# WestPlay 2.4.0-domestic.1 国内定制版

## 合并基线与版本

- 国内版基线为 `feat/domestic-apps` 的 `70accb6`，合并本地上游 `origin/main` 的 `02c5a95`（2.4.0），使用普通 merge 保留双方提交历史。
- 按实际合并的 65 个冲突逐项整合，包括地图设置、companion 地图状态与预览；不对国内地图维护状态机整文件选边。
- Cargo 工作区及 8 个包、Tauri、前端包及锁文件统一为 `2.4.0-domestic.1`。运行时及关于页使用同一版本来源；第三方依赖仅同步合并所需锁文件变化。
- 保持 `app.westplay` 标识及国内版在线更新关闭策略。本次仅完成源码合并与验证，没有生成安装包、运行安装程序、部署到游戏目录或推送远端。

## 功能整合

- 接入 Scania Touring 与 MAN Lion’s Coach 屏幕、客车驾驶座/乘客扬声器选择、倒车影像置顶与显示期间的输入阻断。
- 保留 ATS 的 Cascadia 2024、Western Star 57X、T680 2022、VNL 2025 与 Ford 布局；合并后的 21 个屏幕布局包含双方原有全部条目。Bronco 保留原生倒车影像，并接入上游的影像层级和输入标记。
- 合入亮度快捷键与太阳图标 HUD、一秒长按切歌、侧栏布局及高刷新率显示器的均匀地图帧调度。限速牌数字不随文字尺寸越出边框，保留 ATS 的矩形限速牌。
- 保留国内媒体及电台、登录状态、播放互斥、30 秒闲置回收、双卡货运 HUD、交通灯倒计时、车道引导、路线概览与物理距离导航。
- 整合收费站和边境路径、D3D Hook 修复、WebView 重试、旧 PMD/PMG 模型、损坏资源容错、海域瓦片索引与地图构建进度。海域瓦片加载保留国内地图资源缓存机制。
- 地图宿主保留游戏/存档双开关、显式请求、取消、依赖验证和原子发布；整合游戏启动中断、内存等待、失败持久化、遗漏 Mod 状态及诊断日志。游戏启动导致的中断会等待关闭游戏后重试，不记录成永久失败或用户取消。
- 地图构建器版本为 46。已有依赖记录因构建语义变化需要重建一次，后续继续按有效依赖验证；维护开关和显式请求规则保持有效，旧的无依赖记录缓存仍需手动初始化。
- onboarding 与 companion 只保留 `en_us` 和 `zh_cn`，新增扬声器、亮度、地图中断词条均纳入双语字典。

## 源码验证（2026-11-17）

使用仓库已有 LLVM-MinGW 工具链，依次运行：

```powershell
$env:WESTPLAY_LLVM_MINGW = (Resolve-Path target/toolchains/llvm-mingw-20260602-ucrt-x86_64).Path
$env:CC = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/clang.exe'
$env:AR = Join-Path $env:WESTPLAY_LLVM_MINGW 'bin/llvm-ar.exe'
cargo check --workspace --locked
cargo test --workspace --locked
npm --prefix ui test -- --run
npm --prefix ui run lint
npm --prefix ui run build
python -m unittest discover -s tools/tests -v
```

- Rust 工作区检查通过；测试 763 项通过、0 失败、60 项 ignored。ignored 包含需要真实游戏、WebView、GPU、网络或人工诊断的场景，未强行运行。
- 前端 92 个测试文件、561 项测试通过，覆盖双语词条、版本、车型/屏幕、地图帧调度、国内媒体互斥、导航及资源回收。
- lint 0 错误，保留 30 条现有警告；TypeScript 检查和 Vite 生产构建通过，保留大分块提示。
- Python 构建脚本隔离测试 3 项通过；其部署场景仅使用临时模拟目录，没有写入真实游戏目录。
- 静态核验双方车型/布局集合完整、布局 ID 无重复、语言仅中英、版本一致且没有冲突标记。`git diff --check` 通过。
- 验证日志位于被 Git 忽略的 `target/merge-*.log`，静态核验结果为 `target/merge-static-validation.json`。

## 待游戏实机验收

本次未部署或启动游戏，下列项目保留为人工验收：

- 客车屏幕比例与清晰度、倒车影像显示时的点击阻断、驾驶座/乘客扬声器切换。
- 亮度快捷键及 HUD、长按切歌、不同车型侧栏与货运 HUD 布局。
- 60/120/144 Hz 等刷新率下的地图平滑度，收费站与边境路径、车道引导和交通灯倒计时。
- 国内平台登录与播放、媒体互斥、游戏暂停恢复、闲置资源回收。
- 更新后的地图重建、游戏启动中断与恢复、旧缓存可用性、损坏 Mod 诊断。
- ETS2/ATS 插件加载、Steam/Trucky 等覆盖层共存、WebView 重试及日志稳定性。
