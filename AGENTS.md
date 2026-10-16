# 项目约定

## 当前模块交付

- 本项目现为背屏卡片桥 API 2 模块，不生成 APK；构建、测试与打包使用 README 中的 npm 命令。
- `card/`、`webroot/` 和 `background/` 是直接安装的产物；修改 `src/` 后运行 `npm run build` 并提交产物。
- `bridge-shim.js` 由宿主提供，不复制到模块包。卡片仅使用经典脚本与 Canvas，所有绘制统一走 RAF。
- 背屏只提供下拉免费刷新，使用 `bridge.net`。设置页网络使用 WebView `fetch`，不调用原生网络后端；配置、存储和卡片联动仍使用 bridge。
- 完整资料付费查询与签到留在主屏，付费请求不自动重试。
- 不读取、改写或删除本机 `signing/`，不提交其内容。
