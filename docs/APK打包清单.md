# APK 打包清单（v1.1.0）

## 一、HBuilderX 云打包参数（照抄）

| 项 | 值 |
|---|---|
| 菜单 | 发行 → 原生App-云打包 |
| 平台 | Android |
| 包名 | `com.yinlang1314.hezhen`（**必须和旧包一致，否则不能覆盖安装**）|
| 证书 | 使用自有证书 |
| 证书文件 | `keystore/hezhen.keystore` |
| 证书别名 | `hezhen` |
| 证书密码 | `Hezhen2026` |
| 版本名 | 1.1.0（自动读 manifest）|
| 版本号 | 110 |
| 打包方式 | 正式版（不要选自定义基座）|

> 证书 SHA-256：`18:64:7B:2D:03:E4:B9:D5:FD:1C:DD:C5:A5:D8:54:7D:85:9B:18:32:81:7E:A8:69:F1:EC:C3:3A:53:0A:4C:80`
> 这串指纹必须和旧包一致，否则手机提示「应用未安装」（签名冲突）。

## 二、打包完成后跑收尾脚本

```bash
node scripts/finalize-apk.js
```

它会：找最新 APK → 读版本 → 复制到 `dist/apk/hezhen-v1.1.0.apk` → 算 sha256 → 更新 `version.json`。

## 三、验证

```powershell
& 'E:\wj\HBuilderX\plugins\uts-development-android\static\win\aapt2.exe' dump badging 'dist/apk/hezhen-v1.1.0.apk' |
  Select-String 'package:|application-label'
```

预期：

```
package: name='com.yinlang1314.hezhen' versionCode='110' versionName='1.1.0'
application-label:'禾诊'
```

## 四、提交

```bash
git add dist/apk agriculture-backend/version.json docs
git commit -m "release: v1.1.0 APK（企业风 UI + 微信登录 + 协议页）"
git push origin main
```
