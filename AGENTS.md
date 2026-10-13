# 项目约定

## APK 签名与安装

- Debug 和 Release 始终使用所有者的 `finall` 签名，不得使用默认 debug key、生成新密钥或切换签名。
- 构建时始终使用仓库相对路径 [signing/finall.jks](<signing/finall.jks>) 内的签名，alias 为 `finall`。
- 密码仅从 macOS 钥匙串读取。service 和 account 在本机 [signing/signing.properties](<signing/signing.properties>) 中配置（字段 `keychainService`、`keychainAccount`）；整个 `signing/` 目录被 Git 忽略，禁止提交密钥或本机配置，不得打印或落盘密码。
- 构建配置已固定两种变体的签名。密钥或密码不可用时停止，不做替代。
- 手机安装使用 `adb install -r` 覆盖保留数据。签名冲突时报告错误，不得卸载用户应用绕过。
