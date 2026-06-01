# 明细记账

本地优先的个人记账 App。适合部署到 GitHub Pages 后在手机浏览器中使用，并添加到主屏幕。

## 功能

- 多账本
- 多账户
- 收入 / 支出
- 自定义分类
- 日期、金额、备注
- 月度总览
- 年度总览
- 分类统计图
- 交易列表搜索、筛选、编辑、删除
- CSV 导出
- JSON 完整备份与恢复
- PWA 清单与离线缓存

## 数据保存在哪里

账本数据保存在当前设备浏览器的 IndexedDB 中。部署到 GitHub Pages 后，GitHub 只托管 App 文件，不保存你的账本数据。

如果换手机或换浏览器，需要在旧设备下载完整备份，再在新设备恢复备份。

## 手机添加到主屏幕

iPhone：

1. 用 Safari 打开 GitHub Pages 网址
2. 点击分享按钮
3. 选择“添加到主屏幕”

Android：

1. 用 Chrome 打开 GitHub Pages 网址
2. 点击菜单
3. 选择“添加到主屏幕”或“安装应用”

## GitHub Pages 发布

把本目录中的这些文件上传到 GitHub 仓库根目录：

- `.nojekyll`
- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg`
- `package.json`
- `README.md`

然后在 GitHub 仓库中打开：

`Settings` -> `Pages` -> `Build and deployment` -> `Deploy from a branch`

选择：

- Branch: `main`
- Folder: `/root`

保存后等待 1 到 2 分钟，GitHub 会生成 Pages 网址。
