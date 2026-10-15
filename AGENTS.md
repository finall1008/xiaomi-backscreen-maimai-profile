# 项目约定

## 当前模块交付

- 本项目现为背屏卡片桥 API 2 模块，不生成 APK；构建、测试与打包使用 README 中的 npm 命令。
- `card/` 和 `webroot/` 是直接安装的产物；修改 `src/` 后运行 `npm run build` 并提交产物。
- `bridge-shim.js` 由宿主提供，不复制到模块包。卡片仅使用经典脚本与 Canvas，所有绘制统一走 RAF。
- 背屏只提供下拉免费刷新，使用 `bridge.net`。设置页网络使用 WebView `fetch`，不调用原生网络后端；配置、存储和卡片联动仍使用 bridge。
- 完整资料付费查询与签到留在主屏，付费请求不自动重试。
- 不读取、改写或删除本机 `signing/`。以下签名规则仅在处理历史 APK 时适用。

## 历史 APK 签名与安装

- Debug 和 Release 始终使用所有者的 `finall` 签名，不得使用默认 debug key、生成新密钥或切换签名。
- 构建时始终使用仓库相对路径 [signing/finall.jks](<signing/finall.jks>) 内的签名，alias 为 `finall`。
- 密码仅从 macOS 钥匙串读取。service 和 account 在本机 [signing/signing.properties](<signing/signing.properties>) 中配置（字段 `keychainService`、`keychainAccount`）；整个 `signing/` 目录被 Git 忽略，禁止提交密钥或本机配置，不得打印或落盘密码。
- 构建配置已固定两种变体的签名。密钥或密码不可用时停止，不做替代。
- 手机安装使用 `adb install -r` 覆盖保留数据。签名冲突时报告错误，不得卸载用户应用绕过。
