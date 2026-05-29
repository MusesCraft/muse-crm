# Frontend — Next.js App

## 技術棧

Next.js 16（App Router）+ React 19 + TypeScript 5（strict）+ Tailwind CSS 4 + shadcn/ui（radix-nova style）

## 目錄結構

```
src/
├── app/
│   ├── (app)/           # 需登入的保護路由（共享 sidebar layout）
│   │   ├── inbox/       # 對話收件匣（conversation-detail.tsx, customer-sidebar.tsx）
│   │   ├── contacts/    # 聯絡人管理 + [id] 詳情頁
│   │   ├── dashboard/   # 數據儀表板
│   │   ├── actions/     # 待辦事項
│   │   ├── settings/    # 系統設定
│   │   └── layout.tsx   # 認證檢查 + sidebar（狀態存 localStorage）
│   ├── login/           # 登入頁（無 sidebar）
│   └── layout.tsx       # Root（AuthProvider + ThemeProvider）
├── components/
│   ├── ui/              # shadcn/ui 元件（勿手動改，用 npx shadcn add）
│   └── *.tsx            # 自訂元件（kebab-case 檔名）
└── lib/
    ├── api.ts           # API client（自動 JWT + refresh token 重試）
    ├── auth.tsx         # AuthContext + useAuth hook
    ├── hooks.ts         # 共用 hooks
    ├── theme.tsx        # ThemeProvider
    ├── mock-data.ts     # 開發模擬資料（backend 離線時用）
    └── utils.ts         # cn() 等工具
```

## 關鍵機制

### 認證流程
1. 登入成功 → 儲存 `muse_token`（access）+ `muse_refresh_token`（refresh）到 localStorage
2. API 請求自動帶 `Authorization: Bearer <token>`
3. 收到 401 → 用 refresh token 自動換發新 access token → 重試原請求
4. Refresh 也失敗 → dispatch `auth-expired` event → AuthContext 清除狀態 → 跳轉登入
5. 防止並發 refresh：`isRefreshing` flag + shared `refreshPromise`

### 路由保護
- `(app)/layout.tsx` 用 `useAuth()` 檢查 `isAuthenticated`
- 未登入 → `router.replace('/login')`
- Sidebar 折疊狀態存 `muse_sidebar_collapsed`（localStorage），emit `sidebar-toggle` event

### API Client（lib/api.ts）
- 所有 API 呼叫必須透過此檔案，不要直接 fetch
- `ensureArray()` helper 處理後端回傳格式不一致的情況
- `ApiError` class 攜帶 HTTP status code
- 每個 API 模組獨立匯出：`inboxApi`, `contactsApi`, `tagsApi`, `actionsApi`, `dashboardApi`

## 開發慣例

- 新增 UI 元件：`npx shadcn add <component>`（配置在 `components.json`）
- Icons：lucide-react
- 樣式：Tailwind utility classes，不寫自訂 CSS
- 檔案命名：kebab-case（`channel-icon.tsx`）
- Path alias：`@/components`, `@/lib`
- 建置模式：standalone（`next.config.ts` → `output: 'standalone'`）

## 修改後驗證

修改前端後的標準流程：
```bash
# 1. 靜態檢查
npm run lint
npm run build

# 2. 部署到 Railway
railway link -p "muse-crm-frontend"
railway up --detach

# 3. 瀏覽器驗證
# https://frontend-production-0866.up.railway.app
```

不使用 `npm run dev` 本地跑。所有測試直接在 Railway 線上環境進行。

## 部署

Railway（`railway.json`），Dockerfile multi-stage build（node:22-alpine）。
環境變數 `NEXT_PUBLIC_API_BASE` 指向後端 Railway URL。
