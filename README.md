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

在侧栏选择「在当前窗口打开」时，默认会询问：

- **在本地打开（推荐）**：同步到本机目录，终端与 AI 可访问文件  
- **虚拟打开**：沿用原版远程虚拟工作区（终端无法直接访问）

首次选择本地打开时，会提示指定一个**本地项目根目录**（写入设置，之后复用）。  
项目会落在：

```text
{本地项目根目录}/{项目名称}/
```

可在设置中修改：

| 设置项 | 含义 |
|--------|------|
| `overleaf-workshop.projectOpen.mode` | `prompt`（默认询问）/ `local`（始终本地）/ `virtual`（始终虚拟） |
| `overleaf-workshop.localProjects.rootPath` | 本地项目根目录 |

---

## 相对上游的修改

| 类别 | 说明 |
|------|------|
| 连接协议 | 默认使用 Socket.IO v2 握手（URL 携带 `?projectId=`），以适配 latex.sysu.edu.cn。 |
| HTTP 客户端 | 修补 `xmlhttprequest`，避免 `Host` 头携带默认端口 `:443`（防止 ALB 中断连接）。 |
| 本地打开 | 打开项目时可询问并默认同步到配置的本地根目录。 |
| 发布标识 | 使用独立扩展 ID，便于与商店版区分安装。 |

相关代码：`src/api/socketio.ts`、`src/core/projectManagerProvider.ts`、`patches/xmlhttprequest+1.8.0.patch`。

---

## 许可

AGPL-3.0，与上游一致。上游项目：[overleaf-workshop/Overleaf-Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop)。
