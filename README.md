# 舞萌背屏

Android / Kotlin App，包名 `dev.finall.maiprofile`。UI 使用 Miuix Compose 0.9.4 标准组件，卡片由本地 HTML + 经典 JavaScript Canvas 分层绘制。

## 使用

1. 填写 AWMCNET 公开成绩账号的 QQ 号，保存。默认开启公开 API 自动刷新。
2. 可选填写 AWMC 网关 `gw_` 长期令牌。点击「每日签到」获取服务端发放的额度；已经签到会显示「今日已签到」。
3. 点击「更新完整资料 · 2 Token」，输入二维码内容、图片链接或二维码网页地址，确认查询。客户端只拦截空输入，并保留已验证的官方图片链接转换；其余格式交由上游校验。它读取当前头像、姓名框、背景、称号、段位和阶级。
4. 首次点击「发送到背屏」，通过背屏卡片桥 v2 前台界面配置并绑定动态载体，在系统设置中重新应用一次。绑定后，手动发送和后台自动刷新均使用 v2 后台接口保存最新内容；背屏休眠时在点亮后载入。
5. 也可「导出卡片」保存 ZIP。

## 刷新与计费

- 免费读取：`GET https://net.wmc.pub/api/player/{QQ}`。读取 AWMCNET 最近同步的昵称、Rating、游玩次数，不会访问官方游戏服务器拉取新成绩。需要账号公开资料可访问。
- 默认自动刷新：间隔为 60 分钟，可在「刷新间隔」设置为不少于 15 的整数分钟（WorkManager 最小周期为 15 分钟）。旧版本保存的小时设置会自动换算为分钟。打开 App 时超过所设间隔则读取公开接口；WorkManager 在有网络时按所设间隔安排后台免费刷新并发送到背屏，关闭 App 后仍可调度，实际执行时间由 Android / 省电策略决定。修改间隔会更新现有任务，关闭「后台自动更新背屏」会取消任务。
- 完整资料：`POST https://api.wmc.pub/v1/user/data`，仅点击并确认时调用，成功消耗 2 Token；不自动重试或作为公开接口失败后的兜底。
- 签到：`POST https://api.wmc.pub/checkin`，仅点击签到时调用。奖励数量以服务端结果为准。
- 公开刷新保留完整资料缓存中的装饰字段，公共接口的空 `plate` 不覆盖当前姓名框。
- 自动刷新先更新 App 内缓存；首次手动绑定成功后，将生成的 ZIP 通过桥接后台 API 保存为新的内容版本。尚未绑定时只刷新缓存，不自动打开桥接界面。桥接中恢复原卡、取消绑定后，需再次手动发送以重新配置。后台失败会记录日志，留待下次定时执行，不调用付费接口。

## 致谢与数据来源

感谢 [AWMC NET.](https://net.wmc.pub/) 和
[AWMC API](https://api.wmc.pub/) 提供的数据与接口服务：

- **AWMC NET.**：提供公开玩家资料，包括昵称、Rating 和游玩次数。
- **AWMC API**：提供完整玩家资料查询及签到、额度管理服务。

本项目是基于上述接口开发的第三方背屏展示工具。
接口使用规则与计费以服务提供方的说明为准。

## 卡片与素材

Android 下载并缓存原始素材，将当前绘制需要的图片缩放、编码为脚本配置中的 Base64 Data URL，然后打包 `index.html` 和 `main.js`；不合成整张 PNG。背景用 WebP（质量 90），透明 UI 素材用 PNG，均保留比例且不放大原图。头像、姓名框、背景、Rating 底板、数字、称号和段位素材都随脚本更新，不依赖载体内的图片文件。JS 决定坐标、文字、裁切和素材组合。

- 912×596 画布，核心内容避让左侧 296 px。
- 顶部完整姓名框，中间放大资料，底部完整称号。
- 背景原亮度；资料底板为 55% 不透明度白色，上下内边距 22 px。
- Rating 底板使用 PRiSM PLUS 风格高清原始资源，颜色按 Rating 档位选择；数字来自 CN1.56 更新包。
- 不把浏览器完整 DOM 当作背屏运行时；实际为 MAML / QuickJS / Canvas。
- 首次只有公开资料时，不假造账号的头像、姓名框和背景。完整查询后才显示真实装饰。

素材来源：
- [落雪公开资源文档](https://maimai.lxns.net/docs/api/maimai#游戏资源)：头像、姓名框、背景及称号元数据。
- [maimaiDX 项目](https://github.com/Yuri-YuzuChaN/maimaiDX)：CN1.55 资源包中的 PRiSM PLUS Rating 背景和 CN1.56 数字更新包。
- [官方 NET](https://maimaidx.jp/maimai-mobile/img/trophy_normal.png)：普通称号底板。

原始游戏素材版权归相应权利人所有。

## 与背屏卡片桥的接口

需要支持 v2 的背屏卡片桥。前后台统一使用 `api_version=2`、唯一 `request_id` 和固定 `key=maimai-profile`，分组不随 QQ 设置变化。

首次手动发送使用 Activity Result 启动 `dev.finall.rearcardbridge.action.UPDATE_CONTENT`，通过 FileProvider 传递 ZIP、ClipData 和临时读取权限；桥接 Activity 退出后记录该 key 的绑定结果。`BINDING_REQUIRED` 表示已暂存、尚需绑定。

已绑定后的手动发送及自动刷新在 IO 线程调用 `content://dev.finall.rearcardbridge.update` 的 `update_content`，显式授予 ZIP 读取权限并在调用结束后撤销。`SAVED` 显示「内容已保存」，不等同于背屏已执行。后台遇到 `BINDING_REQUIRED` 不弹出界面；手动发送遇到该结果则转到前台配置。首次配置需要 Shizuku；日常更新不需要 Shizuku、通知或前台服务，也不跳转系统卡片页。

网关令牌仅存应用私有设置，禁用 Android 备份；二维码仅用于本次查询，不写入设置、日志或卡片包。导出的包没有网关令牌。

## Data URL 验证

在连接手机的独立 shell 进程中调用同一套原生 QuickJS Canvas 库，PNG Data URL 的像素检查通过。随后由实际 APK 的打包代码生成 ZIP，再验证其中全部 15 张 PNG / WebP 图片的 Data URL 加载和绘制，检查通过；测试包约 258 KiB，脚本配置约 340 KiB。

完整整卡的独立进程绘制探针触发字体初始化断言，重试进程被终止，因此尚未验证载体上的完整热更新流程。测试没有修改当前背屏卡片，手机上的临时探针已清理。

## 构建

需要 Android SDK 37 和 JDK 17+（本机 JDK 21）：

Debug 和 Release 始终使用仓库相对路径 [signing/finall.jks](<signing/finall.jks>) 中的 `finall` 签名，不使用默认 debug key。密码仅从 macOS 钥匙串读取；本机 [signing/signing.properties](<signing/signing.properties>) 配置 `keychainService` 和 `keychainAccount`，不存储密码。整个 `signing/` 目录被 Git 忽略，密钥和本机配置不随源码发布。构建前需自行准备这些本机文件；缺失或钥匙串不可访问时直接失败，不切换签名。

```sh
./gradlew :app:assembleDebug :app:assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

输出：`app/build/outputs/apk/debug/app-debug.apk` 和 `app/build/outputs/apk/release/app-release.apk`。安装必须使用 `adb install -r` 覆盖保留数据，不能通过卸载绕过签名冲突。
