# Changelog

What changed in each release of TruckPlay (independent GPL-3.0-or-later fork of WestPlay 2.4.x). The newest release's
notes are what the app shows when it offers the update.

## 1.0.3 (2026-11-27)
- **导航界面与运行性能全面升级**：以 CarPlay Ultra Liquid Glass 风格重构 Maps 与 Dashboard 导航浮层，新增交互式行程条（TripBar）及可展开抽屉、沿途一键停靠点（加油 / 休息 / 维修）、路线概览切换与货运任务锁定状态；升级转向指引卡片、车速显示、4×2 Bento 搜索面板与多路线选择卡片，并支持紧凑高度自适应与轻量模式毛玻璃降级。
- **动态视觉中心与概览途经点管理**：将车辆镜头锚点从物理中心动态偏移至无遮挡走廊的视觉中心（支持四边平滑阻尼与预览同步）；新增概览模式途经点列表卡片（支持拖拽/键盘重排、删除与添加停靠点，货运任务锁定终点、自由驾驶可编辑终点），同步升级共享内存桥接至 v33（`RouteAction::SetStops`）；重组右下角地图控制栏为双竖向胶囊并优化按钮触控尺寸。
- **导航运行时性能优化**：引入参考记忆化走廊与量化行程快照、3D 立体路线动态头部/静态其余段双 VBO 拆分、城市标注空间网格索引与惰性测量、ResizeObserver 视口缓存、静止零 DOM 变更门控及 POI 搜索预索引，在保持 3D 道路与建筑画质的同时大幅降低渲染开销。
- **Freight 货运应用精密汽车座舱重构**：采用精密汽车座舱视觉语言全面重构 Freight 应用，拆分并重设计 HOS 工时视图、车辆检查（Inspection）、卡车蓝图（TruckBlueprint）与运单（Waybill）界面及配套矢量图标。
- Redesigned Maps and Dashboard navigation overlays in CarPlay Ultra Liquid Glass style (interactive TripBar drawer, along-route pit-stop shortcuts, overview waypoint management with drag/keyboard reorder and `BRIDGE_VERSION` 33 `RouteAction::SetStops`, dynamic visual-center camera framing, and dual-capsule controls), optimized navigation runtime performance (split 3D route VBOs, memoized snapshots, spatial grid label culling), and redesigned the **Freight** app in precision automotive cockpit style (HOS, Inspection, TruckBlueprint, and Waybill views).

## 1.0.2 (2026-11-26)
- 新增 **本地视频播放** 功能：从游戏 `videos` 文件夹独立加载本地视频（支持 MP4 / WebM / MOV / MKV），通过支持字节范围请求的本地流媒体服务实现快速拖动进度条与高清播放；提供全屏 CarPlay Liquid Glass 影院界面（铺满/适应画面切换、0.75×–2× 倍速、播放列表抽屉、双击及按钮 ±10 秒快进/快退、彻底关闭与启停防抖）及 Dashboard 实时视频预览卡片。
- 新增 **性能模式**（自动适配 / 流畅优先 / 画质优先）：可在车机设置或 Companion 中切换；开启「流畅优先」或在「自动适配」检测到核显/游戏持续掉帧时，自动将画面捕获与地图渲染限制为 30 帧并关闭高开销实时毛玻璃与抗锯齿，显著降低显卡资源争抢。
- 全面优化内存与运行效率：托盘最小化或关闭 Companion 窗口时自动销毁 WebView2 实例并按需重建，休眠托盘预览并限制地图图标/资源缓存上限；消除宿主 STA 线程阻塞、媒体 WebView 泄漏与闲置内存滞留，并优化插件 `CreateTexture2D` 诊断 Hook 与信号量更新。
- Added **local video playback** from a separate `videos` folder (MP4, WebM, MOV, MKV) backed by a byte-range loopback streaming server, with a full-screen CarPlay Liquid Glass theater UI (aspect crop toggle, 0.75×–2× speed picker, playlist drawer, ±10s skip, hardened startup/stop lifecycle) and a live Dashboard video widget.
- Added **Performance Mode** (Auto / Smooth Priority / Quality Priority) to cap capture & map rendering at 30 FPS and disable heavy blur/MSAA on integrated GPUs or sustained frame drops, alongside Companion WebView2 teardown on tray hide, bounded map caches, STA/memory-leak fixes in host, and gated plugin diagnostics.

## 1.0.1 (2026-11-25)
- 新增全局 **上一首 / 下一首** 快捷键（默认 `InteractionKey + 6` / `InteractionKey + 7`）：可在 Companion「控制」页自定义为单键或组合键，按键自动拦截不穿透游戏并支持多媒体键友好名称；同步升级共享内存桥接至 v32（更新重启后将自动同步新版 `westplay.dll`）。
- 取消音量增减键长按 1 秒切歌机制，音量调节改为按下即刻响应。
- 统一接入并修复全部 10 个内置多媒体应用的全局切歌路由（Apple Music、网易云音乐、QQ 音乐、喜马拉雅、广播电台、Bilibili、抖音、红果短剧、YouTube、本地播放器），排除 Safari 避免误接管：修复 Bilibili 后台切歌强制全屏与直播误 Seek 并补齐上一视频观看历史、修复喜马拉雅/电台列表缺失时的索引越界，以及优化抖音切歌标题即时显示与加载态识别。
- 新增 CarPlay 风格顶部切歌玻璃 HUD 提示（显示切歌方向及新曲目/视频/电台标题，全屏视频播放下同样清晰显示），并完善 `README.md` 项目说明与上游开源归属文档。
- Added global **Previous / Next Track** shortcuts (`InteractionKey + 6` / `InteractionKey + 7` by default, configurable in Companion Controls; bumps shared bridge to v32) with a CarPlay-style top track-change HUD pill visible even over fullscreen video, removed 1s volume-hold skipping so volume keys respond immediately, unified track skipping across all 10 built-in media apps (fixing Bilibili background skip/live seek/watched history, Ximalaya/Radio queue wrap-around, and Douyin instant HUD title while keeping Safari excluded), and expanded `README.md`.

## 1.0.0 (2026-11-25)
- **TruckPlay 1.0.0 首个正式版本发布**：支持应用内自动检查更新与签名安装升级（`juner122king/TruckPlay` GitHub Releases），保留 `1.0.0-rc.1` 及此前版本用户数据、地图缓存与插件兼容平滑升级。
- 新增 CarPlay **Phone（电话）** 应用与紧凑型顶部来电横幅：升级共享内存桥接至 v31（支持 Win32 + DirectInput 合成按键序列与 `GameActionBlock`），扩展 `game.sii` / `controls.sii` 解析以同步银行余额/贷款、车库、雇佣司机、二手卡车报价与快捷键配置；提供道路救援（拖车至维修厂 / 拖车至路面 / 紧急加油）、银行、二手卡车、车队通讯录、最近通话与拨号键盘。
- 新增 **QQ 音乐（QQ Music）** 车机应用：贯通宿主、Tauri、车机 UI（播放队列抽屉、正在播放与自适应布局）及 Companion 账号管理。
- 重构并恢复 **抖音（Douyin）** 车机应用：采用 CarPlay Liquid Glass 视觉风格，修复登录态与视频流抓取、支持 H.264 直连播放与官方频道、解耦分页视频列表与播放队列（切换标签页不中断当前播放），并强化闲置资源回收、冷启动指令缓冲与生命周期稳定性。
- 车机与 Companion 体验优化：侧边栏采用真实 CarPlay 比例与对称内边距，默认开启驾驶勿扰（DND v2 存储迁移），精简 Companion 启动自动账号检查、引导登录步骤与 Support 区块，并修复发布脚本在 `gh release view` 下的 PowerShell 异常处理。
- First official **TruckPlay 1.0.0** release with signed in-app auto-updates via `juner122king/TruckPlay` GitHub Releases: adds CarPlay **Phone** app (v31 shared bridge game actions, roadside assistance, bank, used trucks, fleet directory, incoming-call banner), **QQ Music** integration, restored Liquid Glass **Douyin** app (decoupled feed/queue, direct H.264 playback, hardened lifecycle), real CarPlay sidebar proportions, default DND v2 migration, and streamlined Companion startup.

## 1.0.0-rc.1 (2026-11-24)
- 成立独立个人开源项目 **TruckPlay**：基于 WestPlay 2.4.0 / 2.4.1（GPL-3.0-or-later）开源版本独立维护，应用标识切换为 `io.github.juner122king.truckplay`，内置自动更新指向 `juner122king/TruckPlay` GitHub Releases（保留既有用户数据、地图缓存与插件文件兼容以实现平滑升级），桌面端主程序统一命名为 `TruckPlay.exe` 并配备全新品牌图标与托盘/单实例唤醒体验。
- 车机 UI 与驾驶室交互升级：新增 **Companion** 玻璃窗体与 **Options** 设置页并规避 Edge WebView2 158 `STATUS_BREAKPOINT` 崩溃；以 CarPlay Liquid Glass 风格重构 **Freight（货运 HUD）**（修复 HOS 超时与延迟时间线缓冲计算）与 **喜马拉雅（Ximalaya）**（修复主站 API、登录态鉴权与自动播放队列）；新增 SCS 游戏事件桥接，推出 CarPlay **Messages** 短信、**Calendar** 行程日志与全局驾驶提醒。
- 回移植上游 2.4.1 核心稳定性修复：修复 PL Rebuilding 地图构建 99% 卡死（限制高密网格无效遍历）、游戏热修复不重复触发失败重试、Steam 多账户签名识别隔离、WebView2 `invalid_state` 启动重试等待、大巴共享 `ob-gps` 玻璃子矩形与远程触控映射、Coaches DLC 与脚本变动自动重打 `westplay.scs`、插件平板接管逻辑，以及音乐与本地播放器车机小屏自适应布局。
- 完整保留并增强国内与 ATS 定制能力：固定测速相机提示、HUD 信号灯倒计时与主车道引导、指引卡片距离与游戏缩放路线距离 1:1 对齐、双卡货运 HUD、网易云音乐 / Bilibili / 喜马拉雅 / 广播电台、局域网手机端 WebUI（`lan`）、ATS 6 款卡车屏幕适配（含福特 F-150 / Bronco、Volvo VNL 2025 等）、大尺寸挂件平板及地图增量依赖缓存校验。
- Independent **TruckPlay 1.0.0-rc.1** release forked from WestPlay 2.4.0/2.4.1 under GPL-3.0-or-later: updated app identity (`io.github.juner122king.truckplay`), desktop binary (`TruckPlay.exe`), brand icons, and updater repository (`juner122king/TruckPlay`); added glass Companion window with Options/tray/single-instance wakeup, WebView2 158 iframe crash workaround, CarPlay Liquid Glass redesign for Freight and restored Ximalaya, SCS gameplay event bridge with Messages/Calendar/global alerts, game-scaled navigation guidance distances, and backported 2.4.1 stability/Steam/coach-GPS/UI-layout fixes alongside all domestic media, LAN Mobile WebUI, and ATS integrations.

## 2.4.0-domestic.4 国内定制版 / Domestic Edition (2026-11-19)
- 重构网易云音乐车机端 UI（CarPlay 风格）：在「我的音乐」中新增播客电台与歌手分类标签页，修复自动连播切歌并同步真实用户头像与昵称资料。
- 重设计导航界面与相机控制：新增动态导航视角设置（自动缩放、缩放强度、路口放大）及配置/多语言支持，紧凑化左侧转向指引与 ETA 状态栏，统一右下角图标化居中、正北朝上切换与路线概览循环按钮并放大触控区域，修复信号灯标注漂移并新增 HUD 信号灯倒计时与主车道箭头高亮。
- 优化国内媒体宿主性能与稳定性：跨媒体播放器共享 `CabCache` 去重缓存，修复车内音频图重建卡顿与喜马拉雅宿主页白屏问题。

## 2.4.0-domestic.3 国内定制版 / Domestic Edition (2026-11-18)
- 修复电台（Radio）直播播放一段时间后自动暂停的问题：自动恢复非主动触发的音频暂停、连续异常时自动重建 HLS 连接、在稳定播放后重置重连预算并延长退避窗口与优化 `hls.js` 重试及缓冲配置。
- 修复喜马拉雅/电台播放器接入车内 3D 扬声器音效（`westplayCabSound`）的参数签名错误，恢复均衡器、车外闷音与频谱分析并降低后台 CPU 占用，同时在 `app.log` 中区分 `loading`/`paused` 状态并记录播放错误原因。
- 新增局域网手机远程控制（Mobile WebUI）：支持 Companion 设置页扫码配对与复制局域网地址、30 FPS 双缓冲 GPU 画面镜像及触控反向控制。

## 2.4.0-domestic.2 国内定制版 / Domestic Edition (2026-11-17)
- 重构 Bilibili 车机端 UI 与交互体验：整合精选（推荐/热门榜）、动态、直播、影视四大主分页，统一 CarPlay × B站明暗视觉 Token、字体缩放与响应式网格布局，全量替换为矢量图标与断图降级组件。
- 修复 Bilibili 弹幕播放显示层与开关状态同步，仅展示视频弹幕内容并屏蔽网页输入条。
- 增强 Bilibili 宿主通信：支持 `freshIdx` 刷新分页、用户头像/昵称解析以及播放器缓冲与首帧状态同步。
- 启用国内定制版应用内自动检查更新与签名安装升级，并新增本地构建签名与 GitHub Releases 一键发布工具链。

## 2.4.0-domestic.1 国内定制版 / Domestic Edition (2026-11-17)
- 同步上游 2.4.0：客车 DLC 屏幕与扬声器、倒车影像输入阻断、亮度快捷键、侧栏和地图渲染优化、收费站及边境路径修正、D3D Hook 稳定性与地图构建器增强。
- 保留国内媒体平台与电台、登录态同步、媒体互斥和闲置资源回收，以及双卡货运 HUD、中文地名、信号灯倒计时、车道引导、路线概览、物理距离导航和 ATS 屏幕适配。
- 地图格式更新后会重新构建一次。国内版在线更新关闭，升级需使用国内定制版渠道；既有账号、设置与用户数据保留。
- Includes upstream 2.4.0 while retaining domestic media, navigation, freight HUD and ATS support. Maps are rebuilt once for the updated format; upgrade manually through the domestic channel.

## 2.4.0 (2026-11-13)
- The Coaches DLC: WestPlay on the screens of the Scania Touring and the MAN Lion's Coach, shaped to each and drawn
  sharp. The game's parking camera shows over WestPlay, as on the game's own screen, and WestPlay under it takes no
  clicks while it shows. The Volvo 9700 keeps the game's navigation (its real one has no CarPlay); the WestPlay tablet
  in its dashboard shows WestPlay.
- The coaches play through their own speakers, from the moment you get in: the MAN Lion's Coach and the Scania
  Touring (both lengths each) and the Volvo 9700. The driver's pair, or every speaker over the passengers' seats,
  heard from the driver's seat: a choice in the companion (Truck Screen › Coach speakers), greyed out in a truck. In a
  coach it says how many speakers that coach's passengers' set plays at once, which a weak processor can feel.
- The screen's brightness on keys: Alt+4 darker, Alt+5 brighter (with WestPlay's key), shown at the top of the screen
  as the volume is. Both can be changed in the companion's Controls; a key you had already put another keybind on
  stays yours.
- Holding Volume up or Volume down changes the song after one second (it took two).
- The sidebar laid out as CarPlay's: its apps in the very middle of it on every screen, the clock at the top, the truck
  and Home/Dashboard buttons together at the bottom (a gap of most of a button stood between the two). Its buttons are
  larger, about half an app icon as on CarPlay (the tablet's stay as they were). The Scania 7" shows three apps (it
  had two).
- The map's speed limit sign keeps its figures inside its red ring at every Text Size, three-digit limits too (they
  grew with the Text Size and ran through the ring).
- Swiping the Home screen's pages no longer sticks when the mouse is let go at the screen's edge.
- Maps (and the Dashboard's map) move smoothly at 60 frames a second on every display: on displays faster than 60 Hz
  the game was handed as few as 45 new map frames a second (36 at 144 Hz), the map holding still up to 40 ms at a
  time, "moving like steps" whatever the graphics card. The map is now drawn evenly, so each of the 60 frames a second
  the game takes is a new one.
- Through every toll plaza and border crossing the route runs through the booth or gate the game's route drives
  through, wherever it stands: on many it ran straight through between the booths (south of Innsbruck), and where
  a booth or gate stood off the plaza's middle, beside it. On ETS2's map the line now passes through the booth on
  all 449 ways through toll plazas (252 before) and the gate on all 181 through border crossings (95 before).
- The game no longer crashes a while after it starts when the Steam overlay's code is in it (even switched off in Steam)
  and something makes another swap chain, as Trucky's app does as it connects: where the overlay had hooked the
  game's picture before WestPlay, the two called each other round until the game's stack ran out. WestPlay now leaves
  the overlay nothing to hook again.
- WestPlay starts its cab's browser again if it doesn't start the first time (up to three tries), instead of stopping
  with "WestPlay engine stopped: … the timeout period expired". When it does stop, app.log now says why.
- Every map is prepared again once with this update.
- A map with a map mod made of older models (Oyuncuyusbis map) no longer fails to prepare: an older model's parts
  were read as the game's current ones, and the build asked for 13 GB at once. Models in the game's three older
  formats are now read as they are, so their buildings, stations and roads are on the map too (on the Oyuncuyusbis
  map, 702 of its 4,523 models).
- Map mods whose definitions are written scrambled, encrypted or binary (as the game reads them) are read: their
  roads' looks, junctions and water were left out without a word. Whatever still can't be read is named in app.log.
- A map mod with damaged map files is left out and named, instead of the whole map failing to prepare or the
  preparation sitting still (a zip cut short, damaged sectors, junctions or models, a road of impossible length,
  ground placed nowhere; where a mod's sector doesn't fit the game's own, that mod is left out). A damaged or
  protected archive can no longer make a preparation ask for gigabytes at once ("memory allocation of … bytes
  failed").
- A map whose parts lie far apart (map mods across the world's oceans, or a DLC far from the rest: one player's
  spans 1,561 x 1,389 km) no longer needs tens of gigabytes of memory, or hundreds of thousands of files of open
  sea on disk, and its sea comes out right. Small lakes and islands far from the map's middle are drawn the right
  way (a lake could come out as land, an island as a hole).
- Prepare Maps Faster no longer runs out of memory on PCs where other programs use a good part of it (a laptop of
  16 GB failed with "memory allocation ... failed"): it now counts everything the PC uses. Preparing a map also
  takes less memory and less time on its own.
- Starting the game while a map is being prepared stops the preparation, and the companion says so: it went on
  under the game, taking the PC's memory and processor from it. It starts again from the beginning once the game
  is closed.
- The map bar moves the whole way through, at the pace the work really goes ("stuck at 92%" for minutes), and gives
  each map an equal share however many profiles play it.
- A map that fails ends with what went wrong, and the next profile's map is prepared: it could sit still at a
  percentage for ever. A failed map says the fault itself, not "a scoped thread panicked", and one that couldn't
  get the memory it needed says how much it asked for.
- A preparation that's stopped or fails no longer leaves gigabytes of unfinished files behind.
- Maps prepared by an older WestPlay are prepared again when the map builder changes: a map prepared by 2.2.0 that
  left no mod out was taken as up to date, so ATS's start at San Francisco (2.2.1) never reached it.

## 2.3.0 (2026-11-11)
- Safari: the web in the cab, in iPad Safari's look (iPadOS 26). Tabs in a tab bar of their own, or Compact, in the
  toolbar (Settings › Safari › Tabs); the bars take the colour of the page's top as it changes; the tab overview,
  History, the Start Page with your most visited sites, and the page menu's text size. What you type is a website or
  a search with the search engine you pick (Google, Yahoo, Bing, DuckDuckGo or Ecosia). Every website opens as its
  mobile site, laid out at Safari's width, and follows WestPlay's light and dark appearance. Sites keep you signed in
  (Google as YouTube and YouTube Music are), your open tabs and history are there next time, and Clear History clears
  the last hour, today, today and yesterday or all of it. Drag a page to scroll it as a finger does; a website's
  drop-down list opens in Safari's own menu; the cab's keyboard and your own type into a site's fields. A page's
  sound plays through the truck's speakers and pauses with the game, as the music apps do. Cloudflare's and other
  sites' "are you human" checks pass. No downloads, and nothing a page asks for (camera, location, notifications).
- Brightness, in Settings › Appearance: a slider between a small and a large sun, as iOS's. It turns down the light
  the screen gives off, the whole screen together (a video playing and the cursor too), not a dark layer over it.
- Through a toll plaza the route runs where the game sends a truck: through the trucks' booth, often off to the
  right, not straight through the cars' booths. Each plaza says which booths trucks may use, per direction, so some
  routes still go straight through. A weigh station's scale is passed by where there's another way (the plazas at
  Edirne and Istanbul): it calls a truck in only now and then, and you then drive off the route into it.
- Home has two rows of apps at most, as CarPlay's, the rest on the next page (the Scania Smart Dash had three). Its
  pages always move on to the page a drag settles on, from wherever it's let go: let go part of the way, they jumped.
- The sidebar's Dashboard button is CarPlay's: one rounded square, as large as the Home button's app grid. The
  sidebar's fourth app (on screens with room for it) is Calendar, Weather, Settings or Safari, whichever you used
  last.
- The tablet: no truck button (it's no truck's screen, so there was no way back), its sidebar's app icons a quarter
  larger and its Home button twice the size (they were smaller than a finger), and its screen less bright by day
  (it was far too bright).
- The cursor goes dark over anything light and light over anything dark, from what's on the screen under it: a web
  page, a video, a picture, the truck's own screen (it went by what the app said, and was often wrong).
- The keyboard's corners follow the screen's, and it rises over what's on the screen and slides away smoothly:
  nothing moves or changes size for it (a field low on the page scrolls up into sight). Typing on your own keyboard
  no longer pops each letter up over its key.
- A video playing on the Dashboard goes with its card as the map grows over the widgets (its picture stayed over
  the map), and shows again once the card is back.
- A map that fails to prepare says why: the companion showed only Rust's "note: run with `RUST_BACKTRACE=1`…" line,
  never the reason above it.
- WestPlay works with OptiScaler, Snowy Moon's TAA/DLSS and lighting mods, RivaTuner, the Steam overlay and other
  tools that wrap or hook the game's picture: the game crashed on its first frame with OptiScaler, and with Snowy
  Moon's mods or RivaTuner the truck's screen stayed black. WestPlay finds what to hook with a small program of its
  own outside the game (westplay-probe.exe, beside the plugin), hooks in front of those tools without changing any of
  their code, and hooks again should another tool write over its hook (RivaTuner's overlay still shows).
- An American Truck Simulator folder with ETS2's program copied into it is taken for ATS: setup didn't show it, and
  chosen by hand it was set up as ETS2.
- When WestPlay's engine starts again (the cab moved to another graphics card), what the one before ran stops with
  it: the same map was prepared twice at once, and the game's weather and route read twice.
- When the game crashes, plugin.log says which error ended it and the calls that led to it, and whose code each of
  WestPlay's hooks went into: a crash with an upscaler or another tool in the game can now be found from the log.

## 2.2.2 (2026-11-06)
- Prepare Maps Faster, for strong PCs: a switch on the companion's Map page, and a step of its own before WestPlay
  is installed, off unless you turn it on (and tick that you've read what it does). It prepares the maps with every
  thread of the processor and up to four fifths of the memory, in a map builder of its own with a faster way of
  taking memory: ETS2's map in about two minutes on a 16-core PC, where it took over five.
- Each map is prepared in a process of its own: a map that fails to prepare no longer takes WestPlay down with it.
- No map stops preparing for the memory it takes any more: a very large map mod (or several) stopped at three
  fifths of the PC's memory (19.2 GB with 32 GB) and was left out.
- Prepare Maps Again asks which maps to prepare: all of them, or the ones you pick.
- Preparing a map is faster on every PC, and takes less memory at the most: the buildings are placed on every
  thread, and a junction shaped the same as one already worked out isn't worked out again.
- Tablet: the music is no longer muffled when you look away from the tablet in the newer American trucks'
  interiors (the Volvo VNL 2025's, the Kenworth T680 2022's, the Freightliner Cascadia 2024's), nor when a mod
  changing a truck's dashboard is installed but active in none of your profiles.
- The Dashboard's map grows and shrinks smoothly: it moved at a stutter, the map drawn again at a new size each
  step of the way.
- When WestPlay or the game's plugin crashes, its log says what happened and where, and app.log keeps the run
  before as app.old.log and starts with WestPlay's version; setting WestPlay up writes each of its steps there:
  a crash on a player's PC can now be found from their logs.

## 2.2.1 (2026-11-05)
- Preparing a map takes less than half the memory it did, the same map coming out (ETS2's about 5.5 GB at the most
  where it was 12, ATS's under 3 where it was over 7): the roads' and junctions' shapes were kept three times over
  while it was drawn, the parts in the air copied once more for each piece of the map, and the densest pieces (the
  cities) all drawn at once. It takes a little longer.
- With no truck to follow (the companion's screen, the cab before you drive), ATS's map starts at San Francisco: it
  started in the middle of the states you own, which can be empty desert, and the companion's screen showed nothing.
  Every map is prepared again once after the update.
- Adding an icon set or wallpapers in the companion reads only the files it takes, and none past its size limit: a
  folder or a .zip with other big files in it (a video, a zip that unpacks to gigabytes) made WestPlay read them all
  into memory first (reported by kocaemre).

## 2.2.0 (2026-11-04)
- WestPlay comes to American Truck Simulator, next to Euro Truck Simulator 2: one WestPlay for both. The companion
  finds both games and sets WestPlay up in each in one go; its setup, map and update steps show each game. In ATS,
  WestPlay is on the tablet in every truck; the trucks whose real counterparts have CarPlay get WestPlay on their own
  screens later. ATS's map has only the states you own, its landmarks (the Strip's casinos, the Golden Gate, St
  Louis's arch, the downtowns), and zoomed out it goes on into the game's own picture of North America. Go, Add
  Stop and alternative routes work on ATS 1.62, and WestPlay finds the game's GPS in the game's own code, so an
  update that moves it doesn't break them.
- New on Home: Player, for the songs you put in the game's own music folder (Documents › Euro Truck Simulator 2 ›
  music, or American Truck Simulator's): all of them in one list, Play and Shuffle, Now Playing with shuffle,
  repeat and a volume bar, played through the truck's speakers as the other music apps are. A song without tags
  shows its file's name, and songs added to the folder show up as you add them. Player takes the sidebar's music
  place when you use it, shows on the Dashboard's Now Playing, and pauses with the game and when another app plays.
- WestPlay speaks your language on the truck's screen: the cab is in all 43 of the game's languages, not only
  English and Turkish, each saying things the way its players do, with the game's own words for the truck and its
  places. YouTube and YouTube Music answer in it too, and Apple Music names its Library's sorts in it. You can
  choose WestPlay's language in the companion (Setup › Language), over the game's own; place names on the map stay
  in the game's language. The companion's translations are written anew in every language.
- The on-screen keyboard has each language's own letters, laid out as on the iPhone: German's QWERTZ, French's
  AZERTY, the Nordic, Baltic and Central European letters, Greek, Cyrillic and Georgian. Korean's letters join into
  syllables as you type, and Japanese is typed in romaji that turns into kana. The globe key switches to English and
  back. Chinese and Vietnamese type Latin letters for now.
- Speeds and distances follow your profile's units (Options › Regional settings): with miles, the speed, the speed
  limit, the trip, turn-by-turn and search show mph, miles and feet.
- CarPlay's screen has its black rounded corners, as in a real car, round the sidebar at the same gap all the way, on
  every truck's screen. The Dashboard's widgets and map, the apps' windows and the keyboard round their corners as
  the sidebar does, the margin round CarPlay is smaller and the same on every screen, and the apps keep their buttons
  clear of the corners. The cursor goes under the corners, never over them.
- WestPlay fits each truck's screen as it really is, laid out to its shape instead of stretched onto it: it was drawn
  8% too narrow on the Scania Smart Dash, and a little out of shape on the Smart Dash Advanced, Volvo FH, Iveco S-Way
  and the tablet. Nothing is cut off at the screen's edges any more on the DAF, Iveco, Renault T and Volvo FH, and
  the bottom of the screen is no longer smeared. The coaches' screens are shown in their exact shape too.
- The sidebar works as CarPlay's: one app of each kind, the one you used last: Maps, then your music app, then
  Phone or Messages, and the Calendar where the screen has room.
- New on Home: Calendar, in Apple's look, its icon showing the day; and Phone and Messages, which aren't ready yet
  and say so.
- Driving at 30 km/h or more without touching the screen for 30 seconds, the Dashboard's map grows to fill it, the
  widgets sliding away; touch the screen or slow down and they come back. It can be turned off in Settings ›
  Dashboard.
- Hold Volume up for two seconds to skip to the next song, Volume down to go back. A short press still changes the
  volume.
- WestPlay's keys (Alt+1, Alt+2, Alt+3 or your own) are kept from the game from the moment you press them until you
  let go, also where the game reads the keyboard through DirectInput: there, Alt+1 and Alt+2 also switched the
  game's camera out of the cab.
- A new map, drawn from the game's own roads and junctions: intersections and bridges stand at their real heights,
  flyovers and interchange ramps rising over the roads under them and bridges over the sea and wide rivers as high
  as they are in the game, the route, your truck and the destination flag going up with them. The 3D buildings have
  their real shapes (pitched roofs, towers, domes, a stadium's bowl), from the game's own models. The companion's
  Map page has switches for the 3D roads and the 3D buildings; with the buildings off they lie flat in their shapes.
  The map is prepared again once, and takes more room.
- The map keeps its roads and yards as you zoom out, the streets the game leaves off its own map included, with a
  no-entry sign at their entrance. A filling station shows its road and forecourt, a tunnel stays a tunnel through
  its junctions, and the grass round junctions no longer shows as road.
- The route line runs on your side of the road: on any road without a wide central reservation it ran down the
  middle, and took your truck's mark there with it.
- Maps' search opens without the keyboard, its panel reaching down the map; the keyboard comes up when you press the
  search field, and the panel stops just above it on every screen. Find nearby's labels keep long words whole on
  small screens.
- On TruckersMP, WestPlay finds the server you're really on: it took most players to be on Simulation 1, its other
  players and traffic with it. On TruckersMP's ProMods servers the map is ProMods', kept beside the other servers'
  map. The TruckersMP map is no longer prepared again every time you quit the game.
- WestPlay shows on Oyuncuyusbis' coaches' screens again: their new versions scramble their files, which WestPlay
  couldn't read.
- The game could crash as it started, while WestPlay set itself up in it: WestPlay read a graphics object it had
  just let go of.
- Preparing a map takes half of your processor, never all of it, and the companion holds still behind the game on
  every PC, taking no processor time from it.
- The setup's last screen has its third step again: hitting the road, after starting the game and getting in the
  truck.
- The companion's YouTube and Discord buttons have Patreon beside them.

## 2.1.4 (2026-10-28)
- The cursor on WestPlay's screen stays where you left it when you let go of the interaction key, and fades away
  five seconds after you last moved it, as it does when you stop moving it: it went the moment you let go.
- The tablet stays blank in a truck whose own screen shows WestPlay (a Scania S with the tablet fitted): with both
  showing, WestPlay was laid out for one screen and then the other on every frame, and slowed down until it froze.
- YouTube Music plays songs YouTube shows a warning before ("this video may contain disturbing images"), as
  YouTube already does: the song stood still at its start behind the warning, which had no one to press continue.
- YouTube Music gets past YouTube's "Before you continue" cookie page in the EU, the UK and Switzerland: it could
  stay on it, nothing loading. WestPlay answers it as Reject all does, in YouTube too.
- Over a light album cover, Now Playing's words go dark, in Apple Music and in the Dashboard's widget, the
  sidebar's too: they stayed white on the light colours.
- The cab's sidebar is almost a pill again, its corners round, with more room at its top and bottom so the clock
  stays clear of its round ends: 2.1.3 left it nearly square.
- Music keeps playing while the game shows, with another window in front of it or not: with Lossless Scaling
  (its window is in front of the game it scales) YouTube, YouTube Music, Spotify and Apple Music paused as if
  you had tabbed out. It pauses as the game is minimised, and with the game's menu, as before. WestPlay's
  keybinds (volume, play/pause) work there too: they went dead with another window in front.
- With the camera outside the truck, music no longer plays for a moment as if you were in the cab while you
  go between the game's menus: WestPlay took the cab, drawn again behind a menu, for the menu gone and the
  camera back inside. The music now waits for the game to run again.
- With the game run as administrator, WestPlay says so: the companion's Truck Screen page, and Maps when you
  start a route ("The game didn't answer" before). WestPlay can't see the game's route, guidance or weather then;
  start the game normally, not as administrator.

## 2.1.3 (2026-10-27)
- The WestPlay tablet has a new look: a slim aluminium tablet with a black glass front, at a real tablet's size
  (24.8 x 17.9 cm), WestPlay laid out in the shape of its screen. The tablet's model is Art_bor's (Sketchfab,
  CC BY 4.0).
- Hanging, the tablet is held by a clamp over its top edge, on a short, sturdy arm: the long thin bar it hung
  from is gone.
- On the tablet, WestPlay uses more of the screen: the margin round it is smaller, as the tablet shows all of
  WestPlay's picture.
- Every panel's corners are rounded the same, as the Dashboard's widgets are: the sidebar, the map, the apps'
  windows and the keyboard each had their own.
- The truck's screen no longer freezes on its last picture after the game runs again from its menu: in some
  players' games, WestPlay stopped seeing the screen being drawn and left it as it was until the next pause.
- YouTube's videos fill the player: a video could play small in its top left corner, most often the next one
  after the first.
- Maps takes less of your graphics card and processor, most of all in towns with their 3D buildings: it was
  drawn as often as your monitor refreshes (144 times a second or more on some), though the game shows at most 60
  of WestPlay's frames. It's drawn at most 60 times a second now.
- In a truck with the tablet, the companion says WestPlay is on the truck's screen: it kept saying it was waiting
  for the cab, and its switch for WestPlay's screen stayed greyed out.
- The companion's window holds still while it isn't in front: its floating screen kept drawing behind the game,
  taking up to two processor threads the game could use. It goes on the moment you click it.
- The cursor on WestPlay's screen follows the mouse at once: it was drawn by the screen itself and showed three or
  four frames late, more at a low frame rate. WestPlay now draws it straight into the frame the game shows, the
  same dot as before, in a few milliseconds.
- WestPlay's log says more when its screen is slow: every 10 seconds instead of every minute, the screen's own
  frame rate beside the frames Windows delivers, the companion window's share of the processor, and the game's
  window (fullscreen, borderless or a window, and when it's in the background).
- The companion says when YMN One, another CarPlay mod, is installed in the game: it takes over the truck's GPS
  screen, so WestPlay can't show there, and the screen turns pink while YMN One isn't running. It says which file
  to delete.
- YouTube videos no longer stop playing altogether with "This content isn't available, try again later": the way
  WestPlay asks for a video without the ad's wait sometimes got that answer, and was kept for every video after it.
  That way is now dropped for the video asked again YouTube's own way, so it plays.
- YouTube and YouTube Music work in the EU, the UK and Switzerland: YouTube's "Before you continue to YouTube"
  cookie page stood in for them, with no one to answer it. WestPlay answers it for you as Reject all does.
- YouTube plays videos it shows a warning before ("this video may contain disturbing images"), such as some songs'
  videos: WestPlay's player stayed on the warning, which had no one to press continue.
- Spotify shows all your Liked Songs, and every song of a long playlist or album: the list stopped at the first
  50 (Liked Songs and albums) or 100 (playlists). The rest now load as you scroll down, as in Spotify.

## 2.1.2 (2026-10-26)
- On TruckersMP, your own truck no longer shows on the map as another player's dot following you.

## 2.1.1 (2026-10-26)
- Setup no longer says WebView2 isn't working on PCs where it is: 2.1.0's check looked in the wrong place in the
  registry, so it stopped every install and update.

## 2.1.0 (2026-10-26)
- WestPlay's plugin loads in the game on PCs without Microsoft's Visual C++ Redistributable: the game said
  "unable to load" (0000007E) in its game.log, and there was no WestPlay on the truck's screen while the app ran.
- Spotify pauses with the game and plays on as you come back, fading in, every time: leaving the game and
  coming back quickly could leave the music stopped, and a song could start late.
- Pausing with an outside camera no longer plays the music clear for a moment, as if from inside the cab: it
  stays muffled as it fades out.
- Text Size has two smaller steps, and Home's app names and Settings' titles follow it; the sidebar keeps its
  size, as in CarPlay.
- When a YouTube video doesn't start within 20 seconds, the log says why, as YouTube's page tells it: whether YouTube
  lets it play, its error, and what the video player has received. For players whose videos never start.
- The companion says when your truck isn't one WestPlay shows in ("This truck isn't supported"), instead of
  waiting for the cab, and that fitting the WestPlay tablet brings WestPlay into any truck.
- Setup checks that Microsoft Edge WebView2 Runtime works on your PC before installing: without it WestPlay
  couldn't start at all (it closed at once, showing nothing). Setup now says so, offers Microsoft's page to
  install it from, and stops.
- WestPlay in any truck: the WestPlay tablet, which you fit in the truck shop (Accessories: Hanging Items, or as
  a dashboard set), shows WestPlay in trucks with no screen of its own, the truck's own screen keeping the game's
  navigation. Hanging, it's on a short bar from the top of the dashboard, upright and level in every truck; on a
  dashboard set, it faces you. It also stands on the toy spots of a dashboard set you've fitted, such as a table's. As with the trucks' own screens, the music sounds from outside the cab as it would through its
  walls. It's in every truck with hanging items, mod trucks too: a truck mod you install later gets it the
  next time you start the game. The tablet's model is Kedi739's, used with his permission.
- Maps are prepared again for players with certain mods: a small packed file in a mod could stop WestPlay from
  preparing any map at all, leaving the setup's map step waiting for ever and Prepare Maps Again gone. A map
  that can't be made now fails on its own, with a reason, and the other profiles' maps are still made.
- YouTube Music starts at the volume you last set, instead of at full volume every time.
- Spotify no longer plays in silence once its volume is down to nothing: the volume bar disappeared at 0 (and
  with it the button to unmute), and the volume you last set was never given back, so a song seemed to play
  with no sound. The bar now stays, at 0, and Spotify is set back to your volume when it starts.
- More map mods show on the map: ones made with an older map editor (such as Sud de France and Bourges
  Updated), and ones protected in a way WestPlay couldn't read (such as Crni Kal). WestPlay had left them out
  of your map; a map that left a mod out is prepared again by itself, others are kept as they are.
- WestPlay's log (app.log) is always kept now. Where Windows' ransomware protection (Controlled folder access)
  or an antivirus keeps WestPlay out of Documents, there was no log at all; it's now kept in WestPlay's own
  folder, saying why, and About shows where it is. Starting WestPlay again while it was running also emptied
  the log; it no longer does.
- WestPlay on the screens of Oyuncuyusbis' coaches: the Mercedes-Benz Travego 16 SHD, the MAN Lion's Coach and the
  Setra S 531 DT on each one's own dashboard screen, and the Setra S 516 HD/2 on its tablet (its "Gps" part, fitted
  in the truck shop), each shaped to its screen and drawn sharp. Install the coach's mod and WestPlay sets its
  screen up by itself.
- Music plays from the speakers of JuseeTV's Scania PGR, as fitted in the truck shop: its door speakers, the
  A-pillars' tweeters, the top console's centre speaker (or Dark Diamond's pair), and the rear walls with
  speakers (JS Customs, V8 Power, Dark Diamond, Lights + speakers). A rear wall's biggest units play the bass;
  its smaller ones, where it has them, a quiet fill a moment after the front, so the music stays in front of
  you and the cab sounds bigger. Parts you change count once the game saves.
- The Renault T's speakers as each interior has them: the two speakers on the back wall over the bed in every
  T, the A-pillars' tweeters, and the door speakers only in the 2024 interiors. In the older interiors the music
  comes from the back wall, as in the truck. The low sleeper's speakers are now where its cab has them, no longer
  a high sleeper's, and right-hand-drive Ts have them mirrored. A truck you've just bought or changed counts once
  the game saves.
- The MAN TGX (2020)'s speakers: a woofer low in each door, a smaller unit above it for the voices, and a tweeter
  on each A-pillar, in every cab (GM, GN, GX), right-hand drive too.
- WestPlay on the screens of the DAF XF Electric and XD (the XF's screen, with its DAF strip) and the Scania S
  BEV (the S's 7" screen, drawn sharp as the S's is).
- The DAF XD's speakers: the XF and XG's, where its cab has them. The XF Electric has the XF's, and the Scania S
  BEV the S's, and the Renault E-Tech T the T 2024's.
- The Mercedes-Benz Actros (2014)'s speakers: a woofer low in each door, a unit high over each door for the voices,
  and a tweeter on each A-pillar, in every cab. The Actros (2009)'s: a woofer low in each door and a unit at each
  front corner of the overhead shelf. The Scania R (2009) and Streamline's: a woofer in each door, a tweeter in
  each A-pillar. The Volvo FH16 (2012) has the FH's, and the FH16 (2009) a speaker in each door. The DAF XF (105)'s
  as each cab has them: A-pillar tweeters, and two pairs on the overhead shelf in the Super Space Cab or one
  overhead speaker in the Space Cab and Space Cab Plus. The DAF XF Euro 6's: door woofers and A-pillar tweeters, with
  two pairs on the overhead shelf in the Super Space Cab or one overhead speaker in the other cabs. The MAN TGX's:
  door woofers, and in the XXL two small speakers high in each side wall. The MAN TGX Euro 6's: door woofers, and in
  the XL a small speaker in each roof corner. The Renault Magnum's: a speaker in each roof corner, and tweeters under
  the overhead console. The Renault Premium's: a speaker high in each side of the roof, as each roof has it.
  The Iveco Stralis's: a speaker in each end of the overhead console, and in the high roofs a small one high on the
  passenger's side; the Iveco Hi-Way's: the console's two, and one high on each side.

## 2.0.3 (2026-10-23)
- Spotify plays on when you come back to the game: leaving it and coming back could leave Spotify playing in
  silence, or quieter each time, its volume stuck part way through the fade.

## 2.0.2 (2026-10-23)
- WestPlay works on older versions of the game too, such as 1.58: 2.0.1 found what it needs in every version
  but there, where the game is built a little differently.
- The Companion's Map page shows its maps and its Prepare Maps Again button while WestPlay removes an old map
  no profile plays any more: removing a big one takes minutes, and until it was done the page had nothing to
  show and the button was gone.

## 2.0.1 (2026-10-23)
- WestPlay works on other versions of the game, not only the current Steam one: it now finds what it needs in
  the game itself, whatever its version. The VR version and older versions such as 1.60 included, and it should
  keep working through game updates.

## 2.0.0 (2026-10-22)
- TruckersMP: WestPlay works there, its screens brought into the game by its plugin as in single player.
  Maps uses TruckersMP's own map (its HQ and event cities), prepared as soon as TruckersMP is found.
- TruckersMP: the other players show on the map, live around you and further out every few seconds, and
  traffic on your route shows on the blue line in yellow and red where trucks are bunched up, as you choose
  a route and as you drive.
- Maps at night in Apple Maps' own dark colours: slate-blue ground, lighter buildings, deep blue water, teal
  parks, and roads as light lines further out and dark bands closer in.
- Maps by day in Apple Maps' own light colours: cream ground, white streets, grey motorways, sky-blue water;
  the 3D buildings in the colour of the flat ones, their walls softly shaded rather than near black.
- Maps shows the buildings in 3D as you drive, in their own shapes and heights from the game's models (a
  tower's pod, a roof over the pumps) and in the colour of the flat ones, as Apple Maps does. A filling
  station's or a border crossing's roof is left out while you're under it. Every map is prepared again once.
- Filling stations, garages, services, hotels, recruitment agencies and company depots stand in 3D too, their
  own buildings from the game's models, rather than lying flat.
- Warehouses and malls the game builds from walls stand as whole buildings, and the details on their roofs no
  longer stand in rows on the ground.
- Filling stations on Maps: no more white blobs where a station stands beside the road, and the roads through
  stations on the road join on at their own width instead of stopping short.
- One-way service roads in the Balkans join their forks and stations smoothly on Maps, without a step at each join.
- Tunnels on Maps: roads through tunnels are drawn as a faint band, as Apple Maps draws them.
- Text Size in Settings › Appearance, as on iPhone: seven steps from smaller to larger, for the text in every
  app and the names on the map, the icons and artwork as they are.
- An equalizer in Settings › Sound, as on iPhone: Recommended or Custom, Low, Mid and High dragged up or down
  (up to 6 dB each way) for every player and every truck, with the song playing and its waveform moving under
  the curve as you set it.
- The Volvo FH's own speakers: music plays from the woofers low in its doors, with the bass from the panels on
  its back wall.
- With head tracking, the truck's speakers no longer crackle as the tracker's small wobbles turn the sound:
  it follows your head only as it really moves.
- A truck mod is no longer taken for a map mod, so it doesn't get a map of its own prepared for nothing.
- The Companion's Map page shows one progress number in its bar and its sidebar, never running ahead of the
  map being prepared.
- WestPlay removes the maps no profile plays any more (a profile deleted, its map mods changed), freeing their
  space.
- Handing a route to the game's GPS: WestPlay's hidden waypoints go only on real road pieces, never on a
  junction or a border crossing's lanes, and at border crossings and toll plazas the game picks the lane trucks
  use. Before, the screen could flash several times and the game end up on its own way.
- Maps offers routes again where it found none, such as on a toll plaza's approach.
- Routes never go along roads no vehicle may drive.
- With the game's Time zones option on (Only time or Full info), the clock shows the time where you are, as
  the game's clock does: it was an hour early in Finland, the Baltics, Romania, Bulgaria, Greece and Turkey,
  and an hour late in the UK and Portugal. With it off, the clock stays the game's time. Every map is prepared
  again once.
- Pausing the game (its menu, its map) gives the mouse back to the game, also with "Press once instead of
  holding" on: the menu couldn't be used. Back in the game, press WestPlay's key again to use the screen.
- A stop you add goes where it fits along the way, as the game's own map puts one: from A to F, adding D and
  then B gives A, B, D, F. Without a job, a stop no longer becomes the end of the route.
- With stops on the route, the arrival pill shows the time to the next stop beside the time to the end
  ("30 min | 3 h 5 min"); once you reach it, the time to the one after.
- Closing the game's menu, the music comes back as the game's picture does, not 1.5 seconds later when the
  truck moves on.
- "Press once instead of holding" works: once on, pressing WestPlay's key again didn't turn it off.
- Apple Music's lyrics no longer pile up: each song's words stayed on the screen under the next song's. Spotify's
  home no longer risks showing a shelf twice or leaving one out when several share a title.
- Apple Music's synced lyrics follow every song: on songs whose times Apple writes in seconds, the last line had
  always shown as the one sung.
- Back in the game, the music fades in as it starts playing again, instead of staying silent for two seconds
  first (Spotify, Apple Music and YouTube Music).
- Apple Music's lyrics follow the song again, and a song from your Library no longer shows "couldn't load" over
  its own lyrics part way through.
- In Maps, pressing Go no longer makes the search panel jump from side to side while the game takes the route.
- Desktop icons can be clicked again while WestPlay runs: an invisible window of its truck screen covered the top
  left of the main screen and took the clicks there.
- WestPlay in the Volvo FH (2021 and 2024, their DLCs): the real FH has CarPlay with its INFOHIGH package.
- On the Scania S and R's 7" screen, WestPlay shows whole and sharp: its bottom was cut off, everything was
  drawn too tall, and the game drew the screen at a quarter of its resolution. Its sidebar shows two recent
  apps; the Dashboard's arrival time goes to the top of its map, clear of the speed and zoom buttons, and its
  next turn fits its column; Spotify's shortcuts show two across, with their names whole.
- A search box's hint too long for it shows its start, not its end. In Spotify, nothing shows under the player
  bar at the foot.
- The Dashboard's map has zoom buttons, as Maps does. They fade away after 15 seconds without using the map,
  and come back as you point at it.
- Keybinds: the music's volume up and down (5% a press) and play/pause, from the game. By default, hold
  WestPlay's key and press 1 (volume down), 2 (play/pause) or 3 (volume up); any of them can be any key, alone or with WestPlay's key, in the
  Companion's Controls. The volume shows at the top of the screen as it changes, as CarPlay shows it. A key
  bound to WestPlay no longer does anything in the game while it's WestPlay's.
- WestPlay's key can be any key now, not only the four offered, and it can be pressed once to use the screen
  and again to stop, instead of held (Controls, "Press once instead of holding").
- Leaving the game (its pause menu, the map, another window), the music fades out over half a second instead
  of cutting off, and fades back in as you return. Pausing it yourself still stops it at once.
- Spotify starts at the volume you last set, instead of its own every time (YouTube, YouTube Music and Apple
  Music already did).
- After switching from a truck WestPlay supports to one it doesn't, holding WestPlay's key no longer takes
  the mouse from the game.
- Maps shows the rest areas made without a rest area's own building block, where the game offers sleep by the
  road: over a thousand more on the base map, about 1,800 more with ProMods, as the game's own map shows them.
  Every map is prepared again once.
- WestPlay finds your game's folder when the game is started with `-homedir` in its Steam launch options, so
  it reads your own profiles and their mods (ProMods and others) instead of an old folder in Documents.
- In Light mode, the other routes Go offers are drawn pale, as Apple's are, instead of staying dark.
- Maps has a compass right over its zoom buttons, as CarPlay's Maps does: its red mark and N turn with the
  map, always pointing north. Tap it and the map turns north up, seen from above, still following your
  truck; the arrow then brings the view from behind the truck back.
- At toll plazas, the route on the map goes through a booth trucks may use, as the game's GPS sends you (often
  the right-hand ones), instead of straight through a booth for cars only.
- One player at a time, as on a phone: starting music or a video in Apple Music, Spotify, YouTube Music or
  YouTube pauses whichever of them was playing, instead of both playing over each other.
- When WestPlay offers an update, each change in its notes shows whole, instead of being cut off after its
  first line.
- A wallpaper of your own that's a single picture works in Light and Dark mode alike. It had kept the screen
  (and its icons) in one look, dark or light by the picture's brightness, with no way to switch.
- A map mod WestPlay can't read no longer stops a profile's map: the map is made without it, and the Map page
  names it on the profile. Mods whose archives give wrong sizes for their files (a trick of protected mods,
  which the game reads anyway) are read in full.
- On a route, Maps' search and Find nearby offer only places along the rest of the route, nearest along it
  first, with how far along the route each is and what stopping there adds ("+5 min"): no more stops
  behind you. Adding one says what it added, in the game's own distance and time.
- Go offers the routes to a place first, as Apple Maps does: the fastest, the shortest, one on small roads or
  another way, each with its time and distance, drawn on the map. The one you pick is handed to the game's
  GPS, which follows it, held to it by as few waypoints as it needs (up to nine, in the middle of roads); if
  it won't follow, it takes its own way, with none of them left behind. Every map is prepared again once, for
  its routes. The routes show whole, beside the card; a route can be picked on the map too, by tapping it; Go
  sits in the picked route's row. After Go, the map is back on the truck at the zoom it had before. Another
  way no longer leaves a motorway at an interchange only to come straight back onto it.
- WestPlay's truck screens no longer need turning on in Mod Manager, for each profile: WestPlay's plugin
  brings them into the game itself, in every profile and in Convoy, and they're not in your mod list at all.
  The old WestPlay mod is taken out of the game's mod folder and out of your profiles when WestPlay updates
  (with the game closed); uninstalling WestPlay still takes everything out.
- On the Scania Smart Dash Advanced (12.9"), WestPlay is laid out for its own screen: everything is smaller
  than on the 10.1", so it no longer looks too large, with text a little larger than the 10.1"'s so Maps'
  small print stays easy to read. WestPlay's
  screens mod now carries its own copies of those interiors' definitions to tell the two apart. Its taller
  sidebar shows five recent apps.
- Apple Music, Spotify and YouTube Music open smoothly the first time after the screen comes on: their window
  grows out of the icon showing a saved copy of how the app first looks (its own loading screens, signed
  in), and the app takes its place once open, its content loading as usual.
- Closing the game (or the game crashing) stops the music: Apple Music, Spotify, YouTube Music and YouTube
  are closed with it, instead of playing on, unseen, through the truck's speakers with no game. The screen
  starts afresh with the next game.
- When WestPlay's app and its game plugin are of different versions (one updated, the other not yet), they
  no longer try to work together: they had misread each other, and typing could take the truck's driving
  keys.

## 1.2.0 (2026-10-19)
- With map mods (ProMods, Türkiye maps and others), the route follows the mod's own junctions and the
  Maps app gives its turns there, instead of only where the mod left the game's roads as they were.
- WestPlay's screen is drawn on the same graphics card as the game, not on whichever card Windows lists
  first (the slow built-in one on many laptops). If it picks the wrong one, choose another under Truck
  Screen › Graphics Card. About shows WestPlay's card and the game's.
- ProMods maps show all their junctions: about 16,000 were missing, leaving roads cut short (most visible
  with ProMods Maghreb). ProMods players' maps are prepared again once, after the update.
- Maps with ProMods' Middle East add-on can be prepared: one of its roads was taken for a road 116 km away,
  and preparing the map ran out of memory.
- Preparing a map takes about half the memory (ProMods: 4 GB down to 2.2 GB) and runs faster on PCs with
  more cores. A map that would need more memory than the PC can spare is stopped, and the Map page says why.
- A filling station two fuel companies stand by is always named after the nearer one.
- Map mods are layered on the map as the game layers them: the one higher in the Mod Manager wins where two
  change the same thing (WestPlay had them the other way round). Every map is prepared again once.
- The Maps app shows the map of the profile you've loaded, as soon as you load it. It had followed the profile
  with the newest save, so a profile not saved for a while showed another profile's map (and garages).
- After Prepare Maps Again, the Map page's progress bar is all the maps being prepared, each profile an equal
  share (ten profiles: 10% each), instead of saying it's done once yours is. Each profile's row shows its own.

## 1.1.3 (2026-10-18)
- In a convoy, WestPlay's clock, day and night, weather times and arrival times follow the convoy's time,
  as the cab's own clock does, instead of your own game's.
- Preparing a map shows how far it is all the way through, not only at a few points.

## 1.1.2 (2026-10-18)
- ProMods 2.84's map can now be prepared: its older parts, which 1.1.1 still couldn't read, are read too
  (checked against ProMods' own map, all 1,247 of its parts).
- If the screen mod can't be installed, the message says which step failed and where.

## 1.1.1 (2026-10-18)
- Maps from map mods made with an older version of the game's editor, ProMods 2.84 among them, can be
  prepared. Water painted by those mods may be missing for now.
- WestPlay finds the game's folder when it's in OneDrive but Windows' Documents points elsewhere (or the
  other way round), so the screen mod installs and your profiles and maps are found.

## 1.1.0 (2026-10-18)
- WestPlay now appears only in the trucks it's made for: the DAF XF and XG 2021, the Scania S and R, the
  Iveco S-Way and the Renault T 2024. Other trucks (the Mercedes-Benz Actros MP4, say) keep their own screen,
  and holding the key no longer takes their mouse. More trucks come with the tablet.
- WestPlay prepares a map for every profile, one after another, starting with the one you play. A profile
  whose map can't be prepared no longer leaves your other profiles without one, and the Map page shows each
  profile's map: ready, being prepared, or why it couldn't be.
- The Map page has a Prepare Maps Again button: every profile's map is made anew, one by one, failed ones
  included. The cab keeps showing your map until the new one is ready.
- Maps by HVT are recognised whatever they're called, so WestPlay says they aren't allowed instead of failing
  to prepare the map.

## 1.0.4 (2026-10-18)
- Setup no longer counts the Feldbinder and Krone trailer packs as map DLCs.
- The tutorial at the end of setup reads better: rewritten in Turkish, and clearer in English and every
  other language.

## 1.0.3 (2026-10-18)
- Spotify no longer goes silent after a pause, or by itself between songs, when it plays through the truck's
  speakers.
- Uninstalling removes everything you asked it to, your maps and sign-ins included, and no window flashes up.
- Signing out of a service finishes properly, without the button spinning on.
- A truck from a mod (Jasper's DAF 2021, say) counts as installed even when no profile uses the mod yet.

## 1.0.2 (2026-10-17)
- You can join a friend's convoy, or have them join yours, when only one of you has WestPlay: its mod is
  marked as optional in convoys.

## 1.0.1 (2026-10-17)
- A new version of WestPlay is offered as soon as you open it, whichever page it opens on.
- If WestPlay can't check for updates (no internet, say), it tries again in half an hour instead of six hours.

## 1.0.0 (2026-10-17)
- First release.
