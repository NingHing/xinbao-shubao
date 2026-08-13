# Chat Review / Agent Handoff · 并记（馨宝与树宝）

> 给下一位 Agent：请先读完本文，再继续改代码。  
> 用户会把这份 review 贴到新对话里。

---

## 1. 项目是什么

- **产品名**：并记  
- **私人站**：情侣二人私密日记（目前主要给用户和对象用）  
- **本地路径**：`/Users/ninghing/Desktop/馨宝与树宝`  
- **线上地址**：https://xinbao-shubao.pages.dev/  
- **仓库**：GitHub `NingHing/xinbao-shubao` → Cloudflare Pages 自动部署  
- **当前分支**：`main`（与 `origin/main` 同步）  
- **最新提交**（写本文时）：`891e0f0` Make mobile circular homepage entries slightly larger.

### 技术栈

静态站点，无构建框架：

| 文件 | 作用 |
|------|------|
| `index.html` | 页面结构、门禁登录脚本 |
| `styles.css` | 样式（雾蓝灰主题） |
| `script.js` | 主应用逻辑（模块 CRUD、渲染、同步触发） |
| `cloud-sync.js` | Supabase 登录 / 配对 / journal 同步 / Realtime |
| `config.js` | Supabase URL + anon key（**勿提交密钥到公开场合讨论**） |
| `seed-data.js` | 约 400KB 种子数据（**已改为按需加载，勿再同步塞进首页**） |
| `vendor/supabase.js` | 本地备份；**线上登录目前仍优先用 CDN** |
| `schema-*.sql` | Supabase 表/策略参考 |

五个模块：`anniversaries` / `events` / `sweets` / `places` / `fights`  
（纪念日 / 重要的事 / 想对你说 / 足迹 / 和解）

---

## 2. 用户是谁、怎么协作

- 用户**不是职业程序员**，偏好中文、步骤清晰、少术语。  
- 改完功能后通常需要 **commit + `git push origin main`** 才能上线（Cloudflare Pages）。  
- `main` 受保护时，push 可能需要用户在 Cursor 里点批准。  
- 用户曾纠结是否上架 App；**当前决策：先继续完善网页，不上架**。  
- 曾讨论市场版 iOS / 小程序 MVP；桌面有空壳 `并记-app`（Expo），**与私人站分离，未完成，可暂缓**。

---

## 3. 本对话已完成的重要工作

### 3.1 隐私 / 登录

- 必须云端账号登录才能进（去掉公开注册、「改用本地暗号」绕过）。  
- 本地暗号仅在未配置 Supabase 时备用。  
- 建议用户在 Supabase 后台关闭公开注册（若尚未做，请提醒）。

### 3.2 性能（手机打开慢）

已做：

1. `seed-data.js` 不再每次同步下载，改为按需加载。  
2. 登录后 **先画本机内容**，云端后台同步。  
3. 启动时不 `renderPlaces` 大图（进足迹页再渲染）。  
4. 启动时不把整本日记（含大图）写回 localStorage。  
5. 去掉阻塞式谷歌字体依赖（系统字体优先）。  
6. 每次打开弹出「照片未能完整同步…」已修：后台同步静默，仅手动同步/主动保存时提示。

曾踩坑：

- 把 supabase 改成本地 `vendor/` 后，手机登录按钮无反应 → **已改回 CDN**（`cdn.jsdelivr.net/npm/@supabase/supabase-js@2`），并给 `signIn` 加了空客户端报错提示。  
- **不要轻易再换掉 CDN**，除非同时验证手机登录。

### 3.3 UI

- 主题：雾蓝灰（曾试过灰粉又改回）。  
- 首页入口：由方块改为 **圆形虚线**。  
  - 桌面：轻弧线排布  
  - 手机：**上三下二**，圆略加大（约 `6.15rem`）  
- 手机模块页字体已略收紧（`@media max-width: 640px`）。  
- 缓存版本（写本文时）：  
  - `styles.css?v=circular-arc-v2`  
  - `script.js?v=mobile-fast-v2`  
  - `cloud-sync.js?v=login-fix-v1`

### 3.4 其他已有能力（更早会话）

- 配对房间 / 邀请码 / 云端 journal JSON 同步 / Realtime  
- 「我是谁」角色（本机 `localStorage`）  
- 想对你说嵌套回复、日期时间到分钟  
- 足迹照片合并防覆盖、首页滚动位置恢复  
- 门禁后设置抽屉（账户、配对、同步）

---

## 4. 当前已知问题 / 注意点

1. **手机仍可能偏慢**：本机 journal 若含大量 base64 照片，`JSON.parse` 仍重。进一步优化可考虑缩略图/只存 Storage URL。  
2. **足迹云相册**：需 Supabase Storage bucket + `schema-place-photos.sql`；未配好时大图可能无法完整上云（提示已改为不每次弹）。  
3. **`seed-data.js` 变量名**：文件是 `window.SEED_DATA`，脚本已兼容 `XINBAO_SEED || SEED_DATA`。  
4. **桌面旁路文件**：`找回-*.json`、`并记-app/`、备份 html/json —— 一般不要提交/不要当主站依赖。  
5. **`config.js` 含真实 key**：`.gitignore` 应已忽略；勿把 key 写进公开文档。

---

## 5. 推荐工作习惯

1. 工作区必须是：`/Users/ninghing/Desktop/馨宝与树宝`（不是「灯下读书」）。  
2. 改 CSS/JS 后 ** bump `?v=` **，否则手机强缓存看不到更新。  
3. 上线：`git add` 相关文件 → commit → `git push origin main`。  
4. 验证：https://xinbao-shubao.pages.dev/ （手机建议强刷）。  
5. 用户说「好丑 / 再大一点」等，优先做小步视觉调整并推线上，再问反馈。

---

## 6. 可能的后续方向（用户未强制优先级）

按对话中出现过的意向，供下一位 Agent 询问用户后选择：

- [ ] 继续打磨首页圆形入口（样式/间距/是否去掉 01–05 编号）  
- [ ] 继续优化手机首屏速度（照片策略）  
- [ ] 补齐/确认 Supabase 云相册与内容安全  
- [ ] 隐私政策页（若以后要上架）  
- [ ] 市场版 App / 小程序（需新工程 + 新 Supabase，勿混私人库）——用户目前倾向先不做  

---

## 7. 给下一位 Agent 的开场建议

可直接问用户：

> 工作区已在「馨宝与树宝」。线上是 xinbao-shubao.pages.dev。  
> 你接下来最想先做哪一件？例如：首页入口再改好看一点 / 手机再加速 / 某个模块功能 / 其他。

---

## 8. 关键代码锚点

- 门禁登录：`index.html` 底部 inline gate script  
- 启动与本地优先：`script.js` → `startApp` / `bootWithData` / `renderAll({ homeOnly })`  
- 云同步：`cloud-sync.js` → `XinbaoCloud.*`  
- 圆形入口：`styles.css` → `.tile-grid` / `.tile`（桌面弧线 + 手机上三下二）  
- 照片同步提示：`script.js` → `ensureCloudPayload(..., { notify: true|false })`

---

**谢谢上一位对话里完成的登录门禁、性能与 UI 迭代。请在新对话中延续以上约束，避免重复踩 CDN/种子数据/每次弹照片 toast 的坑。**
