# Overleaf Workshop (SYSU)

基于 [Overleaf Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop) 的个人维护版本，用于连接中山大学 LaTeX 平台：

**https://latex.sysu.edu.cn**

商店原版常见问题：Cookie 能登录、能看到项目列表，但一点进项目就加载失败。

---

## 改了什么

1. **Socket 握手 Host 修复**  
   老依赖会发 `Host: latex.sysu.edu.cn:443`，学校 ALB 会直接掐连接（`socket hang up`）。  
   补丁：`patches/xmlhttprequest+1.8.0.patch`

2. **默认使用 v2 连接**  
   学校实例要求握手 URL 带 `?projectId=...`，否则拒绝进项目。  
   改动：`src/api/socketio.ts`

3. **打包标识**  
   扩展 ID：`cham.overleaf-workshop-sysu`，避免和商店版冲突。

---

## 安装

### 方式 A：用 Release 里的 VSIX（推荐）

1. 打开本仓库 GitHub **Releases**，下载最新 `.vsix`
2. VS Code：`Cmd+Shift+P` → **Extensions: Install from VSIX...**
3. 建议先**禁用/卸载**商店版 `Overleaf Workshop`

### 方式 B：本地打包

```bash
npm install
npm run package
# 生成 overleaf-workshop-sysu-*.vsix
```

---

## 使用

1. 浏览器登录 https://latex.sysu.edu.cn  
2. F12 → Network → 点开 `/project` 请求 → 复制 Cookie 里的：

   ```text
   overleaf.sid=...
   ```

3. 插件里添加服务器：`https://latex.sysu.edu.cn`  
4. **Login with Cookies**，粘贴上面的 SID  
5. 打开项目

### 终端 / AI 要读写文件时

直接打开项目是**虚拟文件系统**，终端里看不到真实路径。  
请在项目上右键 **Open Project Locally...**，同步到本机文件夹后再用终端或 AI。

---

## 开发

```bash
npm install
npm run compile   # 编译一次
npm run watch     # 改代码自动编译（tsc -watch）
```

推送到 `master` 后，GitHub Actions 会：

1. 打包 `.vsix`（Actions → Artifacts 里也能下）  
2. **自动创建/更新 GitHub Release**（tag = `v` + `package.json` 的 version，例如 `v0.15.11`）

---

## 许可

与上游相同（AGPL-3.0）。感谢 [overleaf-workshop](https://github.com/overleaf-workshop/Overleaf-Workshop) 原作者。
