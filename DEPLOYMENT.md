# نشر MONOPOLY على Vercel

## إعداد ثابت لموقع التطبيق

للحصول على عنوان ثابت، اربط نطاقاً مخصصاً بمشروع Vercel من **Project → Settings → Domains**، واجعله النطاق الأساسي (Primary Domain). لا يمكن تثبيت نطاق مخصص من مستودع GitHub وحده؛ يجب إضافة النطاق والتحقق من DNS داخل حساب Vercel. بعد الربط استخدم النطاق نفسه في `APP_URL` و`CLIENT_ORIGIN`، ثم أعد النشر.

عميل الواجهة يستخدم مسارات API نسبية (`/api/...`) واتصال Socket.IO من نفس الأصل، لذلك سيستخدم تلقائياً النطاق الأساسي الذي يفتح منه الموقع. معرّفات الغرف والبيانات محفوظة في PostgreSQL/Neon وليست في ذاكرة نشر Vercel المؤقتة.

## قاعدة البيانات

1. أنشئ قاعدة PostgreSQL في Neon، وانسخ pooled connection string الخاص بها.
2. في Vercel افتح **Project → Settings → Environment Variables** وأضف `DATABASE_URL` إلى Production (وأي بيئة اختبار مستخدمة).
3. يعمل التطبيق على إنشاء جداول المخطط تلقائياً عند أول طلب API. يمكن تشغيل `src/server/infra/migrations/0001_init.sql` يدوياً في Neon SQL Editor كخطوة تهيئة بديلة؛ الأوامر تستخدم `IF NOT EXISTS`.

## متغيرات Vercel

أضف هذه المتغيرات إلى **Production** ثم أعد نشر آخر commit:

- `DATABASE_URL`: سلسلة اتصال Neon، سرية.
- `JWT_ACCESS_SECRET`: سر عشوائي ثابت لا يقل عن 32 حرفاً، سرّي ولا تغيّره بعد إصدار جلسات المستخدمين إلا إذا أردت إبطالها.
- `NODE_ENV`: `production`.
- `APP_URL`: النطاق الأساسي الكامل، مثل `https://game.example.com`.
- `CLIENT_ORIGIN`: اختياري؛ النطاق الأساسي نفسه من دون مسار.

لا تضع قيم الأسرار في GitHub أو في متغيرات `VITE_*`.

## إعداد البناء

إعدادات `vercel.json` تستخدم Vite و`bun install` و`bun run build` وخرج `dist`. المسار `api/[...path].ts` يوجّه API إلى Express ويجهز مخطط قاعدة البيانات قبل كل طلب. افحص اتصال DB عبر `/api/health/ready` بعد النشر إذا كان هذا المسار مفعلاً في إصدار التطبيق، أو افحص Function Logs عند وجود خطأ. تهيئة DB الفاشلة تسجل سبباً منقحاً في Function Logs وتعيد `503 DATABASE_UNAVAILABLE` بدلاً من خطأ غامض.

## حدود Vercel للاتصال الفوري

Vercel Functions عديمة الحالة؛ لا تستضيف Socket.IO أو المجدول الخلفي كخادم دائم. لذلك HTTP API وتخزين الغرف في Neon يمكن أن يعملا، لكن تحديثات اللعب الحية والحضور والدردشة تتطلب خادماً دائماً يدعم WebSockets. لا يمكن إصلاح هذا القيد بمجرد تثبيت نطاق أو إعداد `vercel.json`؛ استضف خادم `server.ts` على منصة تدعم WebSockets للعب الجماعي الفوري بالكامل.
