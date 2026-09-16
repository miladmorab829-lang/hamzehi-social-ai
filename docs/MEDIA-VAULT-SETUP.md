# HAMZEHI SOCIAL AI — Telegram Media Vault + Ready + Publisher

این نسخه سه مسیر واقعی Telegram را از هم جدا می‌کند:

1. **Archive / Vault** — منبع عکس و ویدیو
2. **Ready / Output** — Media پردازش‌شده و آماده انتشار
3. **Main Publishing Channel** — مقصد انتشار نهایی HAMZEHI BOX

## معماری
- فایل‌های Media در Telegram ذخیره می‌شوند.
- D1 فقط metadata، ارتباط با Content، وضعیت AI و شناسه پیام/فایل را نگه می‌دارد.
- `TELEGRAM_VAULT_CHAT_ID` = کانال خصوصی آرشیو.
- `TELEGRAM_MEDIA_READY_CHAT_ID` = کانال خصوصی Ready/Output.
- `TELEGRAM_CHAT_ID` = کانال اصلی انتشار.
- `TELEGRAM_BOT_TOKEN` = Bot Token موجود Worker.

## راه‌اندازی واقعی Telegram
1. یک کانال خصوصی برای Vault بسازید.
2. یک کانال خصوصی جدا برای Ready/Output بسازید.
3. کانال اصلی انتشار را همان `TELEGRAM_CHAT_ID` نگه دارید.
4. Bot را به هر سه کانال اضافه کنید و دسترسی لازم برای ارسال/دریافت پست را بدهید.
5. این Variables/Secrets را تنظیم کنید:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_VAULT_CHAT_ID`
   - `TELEGRAM_MEDIA_READY_CHAT_ID`
   - `TELEGRAM_CHAT_ID`
6. `POST /api/telegram/webhook/setup` را از پنل اجرا کنید تا ورودی Vault/Archive و Ready ثبت شود.

## جریان انتشار
`Archive/Vault → AI Processing → Ready/Output → Scheduler → Main Telegram Channel`

سیستم برای انتشار Telegram از Media متصل به Content استفاده می‌کند. اگر Ready channel تنظیم شده باشد، Media قبل از انتشار نهایی به آن نیز کپی و در D1 ثبت می‌شود. نبودن Ready channel انتشار اصلی را متوقف نمی‌کند تا سیستم موجود قبلی نشکند.

## مسیرها
- `GET /api/telegram/vault/media`
- `POST /api/telegram/vault/upload` — multipart image/video
- `POST /api/telegram/vault/ai-edit` — ویرایش AI عکس
- `GET /api/telegram/media/ready?content_id=...` — وضعیت خروجی Ready
- `POST /api/telegram/webhook/setup`
- `POST /webhooks/telegram`

## AI Image
اختیاری:
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL` (پیش‌فرض `gpt-image-1`)
- `OPENAI_IMAGE_SIZE` (پیش‌فرض `1024x1024`)

AI output دوباره داخل Vault ذخیره و به Source Image لینک می‌شود.

## نکته
تولید خودکار ویدیو با AI فقط وقتی فعال می‌شود که provider و API واقعی آن در Worker تنظیم شده باشد؛ در این نسخه ادعای fake برای تولید ویدیو وجود ندارد.
