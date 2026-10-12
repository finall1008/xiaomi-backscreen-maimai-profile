# 舞萌背屏

Android / Kotlin App，包名 `dev.finall.maiprofile`。UI 使用 Miuix Compose 0.9.4 标准组件，卡片由本地 HTML + 经典 JavaScript Canvas 分层绘制。

## 使用

1. 填写 AWMCNET 公开成绩账号的 QQ 号，保存。默认开启公开 API 自动刷新。
2. 可选填写 AWMC 网关 `gw_` 长期令牌。点击「每日签到」获取服务端发放的额度；已经签到会显示「今日已签到」。
3. 点击「更新完整资料 · 2 Token」，输入二维码内容、图片链接或二维码网页地址，确认查询。客户端只拦截空输入，并保留已验证的官方图片链接转换；其余格式交由上游校验。它读取当前头像、姓名框、背景、称号、段位和阶级。
4. 首次在背屏卡片桥配置并绑定动态载体。之后查看预览，点击「发送到背屏」导入最新内容；背屏休眠时在点亮后载入。
5. 也可「导出卡片」保存 ZIP。

## 刷新与计费

- 免费读取：`GET https://net.wmc.pub/api/player/{QQ}`。读取 AWMCNET 最近同步的昵称、Rating、游玩次数，不会访问官方游戏服务器拉取新成绩。需要账号公开资料可访问。
- 默认自动刷新：打开 App 时如果超过一小时未刷新则读取公开接口；WorkManager 在有网络时每小时安排公开刷新，实际时间由 Android 调度。
- 完整资料：`POST https://api.wmc.pub/v1/user/data`，仅点击并确认时调用，成功消耗 2 Token；不自动重试或作为公开接口失败后的兜底。
- 签到：`POST https://api.wmc.pub/checkin`，仅点击签到时调用。奖励数量以服务端结果为准。
- 公开刷新保留完整资料缓存中的装饰字段，公共接口的空 `plate` 不覆盖当前姓名框。
- 自动刷新更新 App 内缓存；点击「发送到背屏」后通过桥接 App 保存为新的内容版本。

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

使用 `dev.finall.rearcardbridge.action.UPDATE_CONTENT`，通过 FileProvider 传递 ZIP 并授予读取权限，继续使用 `api_version=1` 和 `request_id`。桥接 Activity 退出时读取结果：`SAVED` 显示「内容已保存」，不等同于背屏已执行。首次载体绑定由桥接 App 完成；日常导入不需要 Shizuku，也不跳转系统卡片页。

网关令牌仅存应用私有设置，禁用 Android 备份；二维码仅用于本次查询，不写入设置、日志或卡片包。导出的包没有网关令牌。

## Data URL 验证

在连接手机的独立 shell 进程中调用同一套原生 QuickJS Canvas 库，PNG Data URL 的像素检查通过。随后由实际 APK 的打包代码生成 ZIP，再验证其中全部 15 张 PNG / WebP 图片的 Data URL 加载和绘制，检查通过；测试包约 258 KiB，脚本配置约 340 KiB。

完整整卡的独立进程绘制探针触发字体初始化断言，重试进程被终止，因此尚未验证载体上的完整热更新流程。测试没有修改当前背屏卡片，手机上的临时探针已清理。

## 构建

需要 Android SDK 37 和 JDK 17+（本机 JDK 21）：

```sh
./gradlew :app:assembleDebug
```

输出：`app/build/outputs/apk/debug/app-debug.apk`。
