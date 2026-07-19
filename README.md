# Overleaf Workshop (SYSU)

基于 [Overleaf Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop) 适配中山大学 LaTeX 平台的版本：

**https://latex.sysu.edu.cn**

扩展标识：`cham.overleaf-workshop-sysu`

---

## 安装

1. 打开本仓库 [Releases](https://github.com/ChambersXDU/overleaf-workshop-sysu/releases) 页面，下载最新的 `.vsix` 文件。
2. 在 VS Code / Cursor 中执行 **Extensions: Install from VSIX...**，选择刚下载的文件。
3. 若已安装商店版 `iamhyc.overleaf-workshop`，请先禁用或卸载，以免命令冲突。
4. 安装完成后重新加载窗口。

---

## 使用

### 登录

1. 在浏览器中登录 https://latex.sysu.edu.cn 。
2. 打开开发者工具（F12）→ **Network**，打开或刷新项目列表页。
3. 选中对 `/project` 的请求，复制会话 Cookie，例如：

   ```text
   overleaf.sid=...
   ```

4. 在扩展中添加服务器地址 `https://latex.sysu.edu.cn`，使用 **Login with Cookies** 完成登录。

### 打开项目

在侧栏 Overleaf Workshop 中选择项目即可打开。

**说明：** 直接打开使用的是虚拟文件系统（`overleaf-workshop://...`），集成终端及仅能访问本地路径的工具无法看到这些文件。若需本地路径（终端、AI 辅助、LaTeX Workshop 等），请在项目上右键选择 **Open Project Locally...**，同步到本机目录后再打开。

---

## 相对上游的修改

| 类别 | 说明 |
|------|------|
| 连接协议 | 默认使用 Socket.IO v2 握手（URL 携带 `?projectId=`），以适配 latex.sysu.edu.cn。 |
| HTTP 客户端 | 修补 `xmlhttprequest`，避免 `Host` 头携带默认端口 `:443`（防止 ALB 中断连接）。 |
| 发布标识 | 使用独立扩展 ID，便于与商店版区分安装。 |

相关代码：`src/api/socketio.ts`、`patches/xmlhttprequest+1.8.0.patch`。

---

## 许可

AGPL-3.0，与上游一致。上游项目：[overleaf-workshop/Overleaf-Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop)。
