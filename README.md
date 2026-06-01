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
- CSV 导入
- JSON 完整备份与恢复
- PWA 清单与离线缓存
- Supabase 邮箱登录
- 多设备手动同步与自动同步

## 数据保存在哪里

账本数据保存在当前设备浏览器的 IndexedDB 中。部署到 GitHub Pages 后，GitHub 只托管 App 文件，不保存你的账本数据。

如果换手机或换浏览器，需要在旧设备下载完整备份，再在新设备恢复备份。

配置 Supabase 后，可以用同一个邮箱账号在多台设备之间同步数据。

## CSV 导入格式

导入页支持标准 CSV，建议表头：

```text
日期,类型,分类,账户,金额,备注
```

也兼容英文表头：

```text
date,type,category,account,amount,note
```

类型可填：

```text
收入 / 支出 / income / expense
```

如果 CSV 里出现当前账本没有的账户或分类，App 会自动创建。

## Supabase 设置

1. 新建 Supabase 项目
2. 打开 `SQL Editor`
3. 执行 `outputs/supabase-schema.sql` 中的 SQL
4. 打开 `Authentication -> Providers`，启用 Email
5. 打开 `Authentication -> URL Configuration`
6. `Site URL` 填 GitHub Pages 网址
7. `Redirect URLs` 添加 GitHub Pages 网址
8. 在 `Project Settings -> API` 复制 Project URL 和 anon public key
9. 打开记账 App，在“导出”页保存 Supabase 配置并登录

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
