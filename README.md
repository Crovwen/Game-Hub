# پلتفرم بازی داخل تلگرام (Telegram Mini App Game Platform)

یک Telegram Mini App فارسی، RTL، موبایل‌محور برای بازی‌های آنلاین دو نفره، با معماری
Plugin برای بازی‌ها، اقتصاد سکه/امتیاز کاملاً اتمیک، و آماده Deploy رایگان روی Render.

بازی‌های همراه پروژه: **منچ** (۲ تا ۴ نفر) و **گل یا پوچ** (۲ نفره).

---

## ۱. معماری در یک نگاه

```
                         ┌─────────────────────────┐
   Telegram Client  ───▶ │   Frontend (Render        │
   (Mini App WebView)    │   Static Site — React/Vite)│
                         └───────────┬─────────────┘
                                     │ HTTPS (REST) + WSS
                                     ▼
                         ┌─────────────────────────┐
   Telegram Bot API  ◀─▶ │   Backend (Render Web      │
   (webhook)             │   Service — Express + ws)  │
                         │                            │
                         │  ┌──────────────────────┐  │
                         │  │ Game Registry          │  │◀── games/<id>/manifest.json + engine.js
                         │  │ (auto-discovery)       │  │    (auto-discovered, zero Core changes)
                         │  └──────────────────────┘  │
                         └───────────┬─────────────┘
                                     ▼
                         ┌─────────────────────────┐
                         │  Postgres (any provider)  │
                         └─────────────────────────┘
```

**دو سرویس Render جدا از یک ریپو (`render.yaml`):**
- `game-hub-api` — وب‌سرویس Node (Express + WebSocket + Telegram webhook، همه در یک پردازش).
- `game-hub-frontend` — Static Site (build خروجی Vite).

چرا دو سرویس؟ Static Site رایگان Render هرگز نمی‌خوابد (CDN است)، در حالی که وب‌سرویس رایگان
بعد از ۱۵ دقیقه بی‌کاری می‌خوابد. با این تفکیک، باز شدن Mini App همیشه فوری است؛ فقط اولین
درخواست API ممکن است به‌خاطر Cold Start چند ثانیه طول بکشد — که منطق Reconnect بخش ۵ دقیقاً
همین را پوشش می‌دهد.

**چرا بات تلگرام در همان وب‌سرویس (Webhook)، نه یک Worker جدا؟** پلن رایگان Render
Background Worker ندارد؛ فقط وب‌سرویس (که به HTTP جواب می‌دهد). پس بات به‌صورت Webhook روی
مسیر `POST /bot/webhook` در همان Express app اجرا می‌شود — نه Long Polling در یک پردازش جدا.

---

## ۲. Stack انتخابی و چرایی آن

| لایه | انتخاب | چرا |
|---|---|---|
| Backend | Node.js + Express | سبک، اکوسیستم بزرگ، سازگار با Render Free |
| Realtime | `ws` (WebSocket خام) | بدون وابستگی به Socket.IO؛ روی همان HTTP server سوار می‌شود |
| DB | PostgreSQL + Prisma | Migration و Schema امن؛ با هر Provider سازگار (فقط `DATABASE_URL`) |
| Auth | Telegram `initData` (HMAC) + JWT سبک دست‌ساز | بدون وابستگی خارجی برای JWT — کد کوچک، قابل ممیزی، تست‌شده |
| Bot | grammy (Webhook mode) | مدرن، پشتیبانی خوب از Webhook و Inline Keyboard |
| Frontend | React + Vite + Tailwind | سریع، RTL-friendly، بدون overhead فریم‌ورک سنگین |
| فونت | Vazirmatn | طراحی‌شده برای فارسی/RTL، وزن‌های متعدد برای سلسله‌مراتب تایپوگرافی |

### تصمیم مهم زیرساختی: Render Free Postgres

پلن رایگان Postgres در Render بعد از ۳۰ روز منقضی می‌شود (با ۱۴ روز مهلت قبل از حذف کامل).
برای یک دموی کوتاه‌مدت مشکلی ندارد، اما برای داده واقعی کاربران (سکه، امتیاز، دوستان) توصیه
می‌شود از یک Postgres رایگان بلندمدت‌تر مثل Neon یا Supabase استفاده کنید و فقط مقدار
`DATABASE_URL` را عوض کنید — هیچ کد دیگری تغییر نمی‌کند، چون فقط از `postgresql://` استاندارد
استفاده شده است.

---

## ۳. ساختار پوشه‌ها

```
backend/
  src/
    api/routes/       — Express routers (auth, users, friends, leaderboard, games, matches)
    auth/             — Telegram initData validation + JWT + middleware
    bot/              — ربات تلگرام (grammy, webhook)
    config/           — بارگذاری Environment Variables
    db/               — Prisma client singleton
    economy/          — لجر اتمیک سکه/امتیاز (فقط این فایل‌ها اجازه تغییر موجودی دارند)
    friends/          — منطق درخواست دوستی
    games/            — GameEngineBase (مستندات) + registry.js (auto-discovery)
    matchmaking/       — صف رندوم + دعوت دوست
    realtime/         — MatchSession, sessionManager, wsServer
    utils/            — logger
  prisma/schema.prisma
  tests/unit/          — ۳۷ تست، فقط با `node --test` (بدون وابستگی خارجی)

games/                — بازی‌ها، کاملاً جدا از backend/src
  GAME_ENGINE_CONTRACT.md  — قرارداد کامل برای اضافه کردن بازی جدید
  ludo/{manifest.json, engine.js}
  gol-ya-pooch/{manifest.json, engine.js}

frontend/
  src/
    pages/            — Home, GamePage, Players, Friends, Profile
    games/            — رندرهای گرافیکی هر بازی + registry.js
    components/       — Card, Toast, Modal, BottomSheet, StatPills
    layouts/BottomNav.jsx
    services/         — api.js (REST), ws.js (WebSocket با Reconnect خودکار)
    state/AppContext.jsx
    styles/index.css  — توکن‌های طراحی (رنگ، گرادیان، افکت شیشه‌ای)
```

---

## ۴. سیستم Plugin بازی‌ها (مهم‌ترین اصل پروژه)

Core فقط `games/<id>/manifest.json` و `engine.js` را می‌شناسد — هیچ‌کجای
`backend/src` اسم "ludo" یا "gol-ya-pooch" هاردکد نشده است. جزئیات کامل و مثال در
[`games/GAME_ENGINE_CONTRACT.md`](games/GAME_ENGINE_CONTRACT.md).

خلاصه اضافه کردن بازی جدید (مثلاً شطرنج):
1. `games/chess/manifest.json` + `games/chess/engine.js` — همین. Backend خودش در Startup
   بعدی آن را پیدا می‌کند (Auto-Discovery در زمان Startup؛ چون Render Free در هر Deploy
   ری‌استارت می‌شود، نیازی به Watch کردن فایل‌سیستم در Runtime نبود — تصمیم مهندسی مستندشده).
2. `frontend/src/games/chess/ChessBoard.jsx` + یک خط در `frontend/src/games/registry.js`.

هیچ فایل دیگری در users/friends/economy/leaderboard/matchmaking/bot/navigation
تغییر نمی‌کند.

---

## ۵. اقتصاد سکه و امتیاز — اتمیک و Idempotent

هر تغییر سکه یا امتیاز از یک تابع مرکزی در `backend/src/economy/` عبور می‌کند که:
- در یک تراکنش دیتابیس واحد، هم رکورد Ledger (`CoinTransaction`/`ScoreTransaction`) و هم
  موجودی کش‌شده کاربر را آپدیت می‌کند — این دو هرگز نمی‌توانند از هم جدا بیفتند.
- با `idempotencyKey` منحصربه‌فرد (مثلاً `stake_lock:<matchId>:<userId>`) تضمین می‌کند هر
  رویداد مالی حداکثر یک‌بار اعمال شود، حتی اگر به‌خاطر قطعی اینترنت یا Reconnect دوباره
  فراخوانی شود.
- برداشت سکه (`amount < 0`) با شرط `WHERE coins >= amount` انجام می‌شود — موجودی هرگز
  نمی‌تواند منفی شود، حتی زیر بار همزمان (Race Condition).
- قفل کردن Stake برای چند بازیکن با هم (`lockStakesForMatch`) در یک تراکنش واحد است:
  یا همه بازیکنان کسر می‌شوند یا هیچ‌کدام (طبق بخش ۱۵ مشخصات).

---

## ۶. تصمیمات مهندسی مستندشده (ابهامات مشخصات)

طبق درخواست صریح بخش ۳۵ مشخصات، هرجا ابهام یا تعارضی وجود داشت، بهترین تصمیم گرفته شد و
اینجا مستند شده — نه پنهان:

- **منچ:** پیاده‌سازی طبق قوانین استاندارد ساده‌شده (۵۲ خانه مشترک + ۶ خانه راهروی خانگی،
  ۸ خانه امن، نیاز به عدد دقیق برای رسیدن به خانه نهایی، پاداش تاس اضافه برای ۶/زدن
  حریف/رسیدن به خانه، بدون قانون Block کردن با مهره‌های خودی). جزئیات کامل در بالای
  `games/ludo/engine.js`.
- **گل یا پوچ — تساوی جزئی:** مشخصات فقط دو حالت مرزی را گفته (۵-۵ → تمدید، ۰-۰ → مساوی).
  یک تساوی دیگر (مثلاً ۳-۳) تصریح نشده بود؛ تصمیم گرفته شد هر تساوی غیر از صفر-صفر مثل
  حالت ۵-۵ رفتار کند (تمدید ۲ فرصته) — کوچک‌ترین تعمیمی که هر دو قانون گفته‌شده را حفظ
  می‌کند. جزئیات در بالای `games/gol-ya-pooch/engine.js`.
- **Matchmaking رندوم برای منچ:** به‌صورت پیش‌فرض ۲ نفره (`defaultRandomPlayers` در
  manifest) تا صف‌بندی برای شروع سریع باشد؛ موتور بازی از قبل از ۲ تا ۴ نفر پشتیبانی
  می‌کند و تغییر این عدد در manifest کافی است.
- **بازی با دوست:** همیشه ۲ نفره (طبق فلوی دعوت در بخش ۹ مشخصات که یک دعوت مشخص برای یک
  دوست مشخص است).
- **Auto-Discovery:** «در زمان Startup» تفسیر شد، نه Watch کردن زنده فایل‌سیستم — چون
  Render Free در هر Deploy از نو بالا می‌آید و این ساده‌ترین راه‌حل درست برای این محیط است.

---

## ۷. راه‌اندازی محلی (Local Development)

```bash
# بک‌اند
cd backend
cp ../.env.example .env   # مقادیر را پر کنید (حداقل BOT_TOKEN, DATABASE_URL, JWT_SECRET)
npm install
npm run prisma:migrate:dev
npm run dev                # http://localhost:3000

# فرانت‌اند (ترمینال دوم)
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

> ⚠️ Mini App تلگرام نیاز به HTTPS دارد. برای تست محلی داخل تلگرام واقعی، از یک تانل
> (مثل ngrok) روی هر دو سرویس استفاده کنید و آدرس‌ها را در `.env` بگذارید.

### اجرای تست‌ها

```bash
cd backend
npm test
```

همه‌ی منطق حیاتی (موتور منچ، موتور گل یا پوچ، قوانین اقتصاد، JWT، اعتبارسنجی initData،
Auto-Discovery) بدون نیاز به دیتابیس یا هیچ سرویس خارجی تست می‌شود
(`node --test`, بدون وابستگی خارجی).

---

## ۸. Deploy روی Render (رایگان)

### روش سریع: Render Blueprint
1. ریپو را در GitHub پوش کنید.
2. در Render: **New → Blueprint** → ریپو را انتخاب کنید → Render فایل `render.yaml` را
   می‌خواند و هر دو سرویس را می‌سازد.
3. برای هر Environment Variable که `sync: false` دارد (BOT_TOKEN، DATABASE_URL،
   WEBAPP_URL، BACKEND_URL، VITE_API_URL، VITE_WS_URL)، مقدار را دستی در Render وارد کنید.

### روش دستی (مرحله‌به‌مرحله، طبق بخش ۲۵ مشخصات)

1. **ساخت Repository در GitHub** و پوش کردن این پروژه.
2. یک **PostgreSQL Database** بسازید (Render یا Neon/Supabase) و `DATABASE_URL` را کپی
   کنید.
3. **وب‌سرویس Backend**: New → Web Service → `rootDir: backend`
   - Build Command: `npm install && npm run prisma:generate && npm run prisma:migrate`
   - Start Command: `npm start`
4. **Environment Variables** بک‌اند را تنظیم کنید: `BOT_TOKEN`, `DATABASE_URL`,
   `JWT_SECRET` (یک رشته تصادفی طولانی)، `WEBAPP_URL` (آدرس فرانت‌اند — در مرحله ۶ می‌گیرید)،
   `NODE_ENV=production`. (`BACKEND_URL` را خالی بگذارید — Render خودش `RENDER_EXTERNAL_URL`
   را می‌سازد.)
5. Deploy کنید و آدرس عمومی backend را یادداشت کنید (مثلاً `https://game-hub-api.onrender.com`).
6. **Static Site فرانت‌اند**: New → Static Site → `rootDir: frontend`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
   - Environment Variables: `VITE_API_URL` و `VITE_WS_URL` = آدرس backend (با `wss://`
     برای دومی).
7. آدرس Static Site را در Environment Variable بک‌اند به‌عنوان `WEBAPP_URL` بگذارید و
   backend را Redeploy کنید (برای CORS و دکمه بات).
8. **Webhook تلگرام**: خودش هنگام بالا آمدن سرور با `BACKEND_URL`/`RENDER_EXTERNAL_URL`
   ثبت می‌شود — نیازی به کار دستی نیست (به‌جز اطمینان از درست بودن `BOT_TOKEN`).
9. در @BotFather دستور `/setmenubutton` یا از طریق پیام `/start` بات (که در کد آماده است)
   دکمه باز کردن Mini App را تنظیم کنید — لینک همان `WEBAPP_URL` است.
10. Mini App را از داخل تلگرام باز کنید و تست کنید 🎉

---

## ۹. متغیرهای محیطی

جدول کامل و توضیح هرکدام در [`.env.example`](.env.example) (بک‌اند) و
[`frontend/.env.example`](frontend/.env.example) موجود است. **هیچ Secret واقعی در این
ریپو نیست** — همه از Environment Variables خوانده می‌شوند.

---

## ۱۰. محدودیت‌های شناخته‌شده (برای سخت‌سازی بیشتر در آینده)

- فرانت‌اند در این محیط build/اجرا نشده (بدون دسترسی شبکه برای `npm install` هنگام
  توسعه) — کد به‌دقت مرور شده ولی توصیه می‌شود قبل از Deploy یک‌بار `npm run build`
  را محلی اجرا کنید.
- اگر سرور دقیقاً بین «علامت‌گذاری Match به‌عنوان finished» و «واریز نهایی سکه/امتیاز»
  کرش کند، یک Match ممکن است بدون واریز متناظر بماند (به‌خاطر Idempotency Key هرگز
  دوبار واریز نمی‌شود، ولی ممکن است صفر بار هم بماند در این حالت نادر). یک Job دوره‌ای
  برای پیدا کردن Matchهای finished بدون Ledger متناظر، گام بعدی طبیعی Production است.
- بدون افزونه Redis فعال (نیازی هم نیست — یک Instance رایگان Render نیازی به هماهنگی
  چند-پردازشی ندارد)؛ `REDIS_URL` برای روز مقیاس‌پذیری افقی رزرو شده.
- Matchmaking رندوم منچ به‌صورت پیش‌فرض ۲نفره است (بالا توضیح داده شد).
