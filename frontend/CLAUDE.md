# Frontend — Next.js App

## 技術棧

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui + Radix UI

## 目錄結構

```
src/
├── app/              # Next.js App Router
│   ├── (app)/        # 需登入的保護路由（layout 包含 sidebar）
│   │   ├── inbox/    # 對話收件匣
│   │   ├── contacts/ # 聯絡人管理
│   │   ├── dashboard/# 數據儀表板
│   │   ├── actions/  # 待辦事項
│   │   └── settings/ # 設定
│   ├── login/        # 登入頁（無 sidebar）
│   └── layout.tsx    # Root layout
├── components/       # 自訂元件
│   └── ui/           # shadcn/ui 基礎元件（勿手動修改，用 shadcn CLI 管理）
└── lib/              # 工具與 hooks
    ├── api.ts        # API client（fetch wrapper，統一處理 auth header）
    ├── auth.tsx      # AuthContext provider + useAuth hook
    ├── hooks.ts      # 共用 React hooks
    ├── theme.tsx     # 主題 provider
    ├── mock-data.ts  # 開發用模擬資料
    └── utils.ts      # cn() 等工具函數
```

## 慣例

- Route Group `(app)` 用於所有需認證的頁面，共享含 sidebar 的 layout
- API 呼叫統一透過 `lib/api.ts`，自動帶 JWT token
- 元件以 kebab-case 命名檔案（如 `channel-icon.tsx`）
- 建置模式為 standalone（`next.config.ts` 設定 `output: 'standalone'`）
- Icons 使用 lucide-react

## 指令

```bash
npm run dev    # 開發（http://localhost:3000）
npm run build  # 建置
npm run lint   # ESLint 檢查
```
