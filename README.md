# 舞萌背屏

[背屏卡片桥](https://github.com/finall1008/rear-card-bridge) API 2 应用卡模块，不再是独立 Android App。模块包含背屏 QuickJS / Canvas 卡片和主屏 WebUI。设置页通过 WebView 的 `fetch` 直接联网；背屏通过 `bridge.net` 联网；两端通过卡片桥共享配置和缓存。

## 安装与使用

需要支持卡片模块及 **WebUI 直接联网** 的卡片桥（`feature/card-modules-webui` 分支 `17b42d4` 或后续版本）。设置页不再依赖原生网络后端，也不回退到 `bridge.net`。

1. 在桥中选择「安装 ZIP 模块」，导入 Release 的 `MaimaiRearProfile-v版本号.zip`；也可输入本 Git 仓库地址安装。
2. 在桥中选择扫描出的本地卡片作为载体，完成绑定后，到系统背屏设置移除旧卡并重新应用。不硬编码替换目标。
3. 打开模块设置，填写 AWMCNET 公开账号 QQ，保存。默认开启免费自动刷新，间隔 60 分钟，可设为不少于 15 的整数分钟。
4. 可选保存 AWMC 网关 `gw_` 长期令牌。在主屏点击「每日签到」领取服务端额度；已签到显示「今日已签到」。
5. 需要头像、姓名框、背景、称号、段位和阶级时，在主屏点击「更新完整资料 · 2 Token」，填写本次二维码内容、图片链接或网页地址并确认。
6. 背屏右侧可视区域**下拉达到阈值后松手**，立即免费刷新。短拖动、横向滑动、取消手势不触发请求；刷新中不能重复触发。背屏不设菜单、付费按钮或签到按钮。

没有宿主 bridge 时，页面显示“未连接卡片桥”，操作按钮禁用。

### 从旧 APK 切换

旧 App 的私有设置与缓存不会自动转入模块。需重新填写 QQ、令牌，完整资料仍由用户主动确认查询。模块不会卸载旧 App、取消它的任务或自动接管背屏绑定；切换时请自行关闭旧 App 的后台更新，避免继续维护旧卡片。

## 刷新、计费与缓存

- 免费资料：`GET https://net.wmc.pub/api/player/{QQ}`，读取 AWMCNET 最近同步的昵称、Rating、游玩次数，不访问官方游戏服务器拉取新成绩。账号需允许公开访问。
- 完整资料：`POST https://api.wmc.pub/v1/user/data`，只在主屏确认后调用，成功消耗 2 Token。保留已验证的官方图片链接转换，其余非空二维码输入交上游校验。
- 签到：`POST https://api.wmc.pub/checkin`，只在主屏手动调用，奖励以服务端结果为准。
- 设置页的公开资料、完整查询、签到及图片下载都直接使用 WebView `fetch`。完整查询通过 `AbortController` 设置 180 秒客户端总等待时间（包括响应体读取），其余请求默认 15 秒；不代理到原生 `ModuleBackend`。
- 付费请求不自动重试，也不作为免费接口失败的兜底。请求超时或连接中断时结果可能未知，请先核对服务端状态，避免重复扣费。服务端返回的 HTTP 504 不会因改用 `fetch` 而保证消失。
- 免费刷新只更新昵称、Rating、游玩次数和公开更新时间，不覆盖完整资料缓存中的装饰字段。切换 QQ 后不沿用旧账号资料。
- 数据失败保留已有缓存。完整资料查询成功但素材下载失败会单独提示；可以重新准备素材，不重复调用付费查询。
- 背屏脚本启动、设置页打开时检查数据时间戳。背屏运行期间每 30 秒检查是否到达所设间隔；免费请求失败后按所设间隔再尝试，不每 30 秒重试。
- **休眠期间不执行 JS**。恢复执行后检查实际时间戳，过期再查；没有 WorkManager、后台服务或精确定时保证。关闭自动刷新不影响手动下拉刷新。
- 主屏保存的数据通过 `bridge.card.requestRefresh()` 通知卡片重读缓存。保存成功不等于背屏已执行，休眠时显示可能延后。

## 图片与绘制

沿用原有 912×596 设计坐标、左侧镜头避让、顶部完整姓名框、中央资料和底部称号。背景原亮度，资料底板为 55% 不透明度白色。只有公开资料时，不假造头像、姓名框、背景或段位。

- 卡片是 QuickJS / Canvas，不是完整网页。首屏、图片回调、手势动画和数据变化都从 `requestAnimationFrame` 发布画面；静止时没有永久 RAF 循环。
- 触摸仅使用 `pointerdown/move/up/cancel` 等指针事件，绘制与手势共用坐标；滑动取消不会当成点击。
- Rating 底板、数字、称号底板随模块预先缩放。主屏 WebUI 下载动态图片，用 Canvas 保持比例缩放且不放大原图：背景 WebP 质量 90，其余透明素材 PNG。
- 动态图片逐张以 Data URL 文本缓存在 `bridge.files`，背屏读取缓存，不合成整张 PNG、不在每帧下载或解码图片。文字不必等待全部图片加载。
- 配置、业务数据和动态图片改变不需要重新应用。**包内静态资源改变**需在桥中更新载体，再到系统移除旧卡并重新应用；脚本更新可热加载。

## 数据与隐私

模块 ID 固定为 `dev.finall.maiprofile`，`apiVersion` 为 2，声明 `network`、`storage`、`files` 三项能力。

- `bridge.config`：公开 QQ、自动刷新开关与间隔。
- `bridge.storage`：网关令牌、账号对应的资料与更新时间；背屏免费刷新代码不读取令牌。
- `bridge.files`：按素材类型及 ID 保存处理后的动态图片。
- 二维码仅用于本次查询，不存入配置、缓存、日志或发布包。
- 令牌只保存在桥的模块私有数据中，不进入发布 ZIP 或日志；这里没有额外的加密保险箱。
- 同模块 ID 更新保留配置与业务数据，`versionCode` 必须严格递增。卸载模块会删除该模块的数据。

设置页第一个脚本引用 `bridge-shim.js`，由宿主提供，不随模块固定旧版本。它只负责配置、存储、文件和卡片联动，不承担设置页网络请求。两端共用资料和绘制源码，构建时复制各自需要的静态资源。

## 开发与发布

需要 Node.js 22.18+、Python 3（仅打 ZIP，使用标准库）。构建依赖只有 Babel 的 async-to-generator 插件，不需要 Android SDK、Gradle 或签名密钥。

```sh
npm ci
npm test
npm run build
npm run build:check
npm run pack
```

构建输出为 [card](<card/>) 与 [webroot](<webroot/>)，需要随源码提交，保证桥可从 Git 仓库直接安装。背屏宿主不执行原生 Promise 任务，构建会把 `card/main.js` 的 async/await 编译成生成器，交给桥运行时驱动；设置页不编译。发布包位于 `dist/MaimaiRearProfile-v<版本>.zip`；ZIP 根目录直接包含模块清单，不多套文件夹。

- [模块清单](<module.json>)：模块 ID、版本和能力声明。
- [共享资料服务](<src/shared/profile.js>)：资料解析、接口与缓存。
- [共享绘制](<src/shared/render.js>)：主屏预览与背屏画面。
- [下拉手势](<src/shared/pull-refresh.js>)、[背屏入口](<src/card.js>)。
- [设置页入口](<src/webui.js>)、[直接网络请求](<src/webui-network.js>)、[设置页 HTML](<webroot/index.html>)、[样式](<webroot/styles.css>)。
- [构建脚本](<scripts/build.mjs>)、[打包脚本](<scripts/pack.py>)。

修改源码后执行 `npm run build`。发布时同时更新模块清单及 npm 包版本，递增 `versionCode`；Git tag 使用 `v` 加版本号。CI 执行业务测试、检查已提交产物并发布模块 ZIP，不再生成 APK，也不读取签名 secrets。

### 验证范围

Node 测试覆盖资料合并、账号切换、二维码转换、计费请求边界、手势判定及 RAF 绘制时机。浏览器预览只能验证布局和普通网页交互，不能证明 QuickJS 宿主的画面发布、触摸及休眠恢复行为。真机安装、系统重新应用及付费查询需另行授权验证。

## 致谢与数据来源

感谢 [AWMC NET.](https://net.wmc.pub/) 提供公开玩家资料，以及 [AWMC API](https://api.wmc.pub/) 提供完整资料查询、签到与额度服务。本项目为第三方展示工具，接口使用与计费以服务方说明为准。

素材来源：

- [落雪公开资源文档](https://maimai.lxns.net/docs/api/maimai#游戏资源)：头像、姓名框、背景及称号元数据。
- [maimaiDX](https://github.com/Yuri-YuzuChaN/maimaiDX)：PRiSM PLUS Rating 背景和 CN1.56 数字资源。
- [官方 NET](https://maimaidx.jp/maimai-mobile/img/trophy_normal.png)：普通称号底板。

原始游戏素材版权归相应权利人所有。
