# نشر MONOPOLY على Vercel

## 1) إنشاء قاعدة بيانات Neon

Vercel لا ينشئ قاعدة بيانات تلقائياً من إعدادات هذا المستودع. أنشئ مشروع PostgreSQL في Neon يدوياً:

1. افتح https://console.neon.tech/ وسجّل الدخول.
2. أنشئ مشروعاً جديداً، واختر المنطقة المناسبة.
3. من صفحة الاتصال بالمشروع، انسخ **Postgres connection string**. استخدم الرابط المخصص للتطبيق (ويُفضّل pooled connection string عند توفره)، ولا تنشره في المستودع أو ترسله في المحادثات.
4. افتح **SQL Editor** في Neon، والصق محتوى `src/server/infra/migrations/0001_init.sql` كاملاً وشغّله مرة واحدة لإنشاء جداول التطبيق.

## 2) إعداد متغيرات Vercel

في Vercel افتح **Project → Settings → Environment Variables**، وأضف المتغيرات التالية إلى Production (وأضفها إلى Preview/Development أيضاً إذا كنت تختبر تلك البيئات):

- `DATABASE_URL`: سلسلة الاتصال التي نسختها من Neon.
- `JWT_ACCESS_SECRET`: قيمة سرية عشوائية قوية بطول 32 حرفاً أو أكثر.
- `NODE_ENV`: `production`.
- `APP_URL`: عنوان Vercel الفعلي للموقع، مثل `https://your-project.vercel.app`.
- `CLIENT_ORIGIN`: اختياري؛ أصل الموقع نفسه، من دون مسار، إذا احتجت تحديده صراحة.

لا تضع هذه القيم في متغيرات `VITE_*` ولا تحفظها داخل ملفات المستودع. بعد حفظها، نفّذ **Redeploy** لآخر commit لكي تدخل المتغيرات حيز التنفيذ.

## 3) إعداد البناء

اربط مستودع `omarabohassangoo-prog/MONOPOLY` بمشروع Vercel. استخدم:

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

المسار `api/[...path].ts` يمرر طلبات `/api/*` إلى تطبيق Express. تحقق من اتصال قاعدة البيانات عبر `https://your-project.vercel.app/health/ready`؛ يجب أن يعيد `{"ok":true,"database":true}`. إذا ظهر 500، راجع **Vercel → Deployments → Function Logs** وتأكد من اسم متغير البيئة، صلاحية سلسلة Neon، وتشغيل ملف SQL أعلاه.

## حدود Vercel للعب الجماعي

وظائف Vercel عديمة الحالة ولا تدعم تشغيل خادم Socket.IO دائم أو المجدول الخلفي الموجود في `server.ts`. واجهات HTTP مثل إنشاء الغرفة وبدء المباراة يمكنها العمل كوظائف، لكن الاتصال الفوري (الحضور والدردشة وتحديثات Socket.IO) والمهام المجدولة تحتاج خادماً دائماً يدعم WebSockets. لتفعيل اللعب الجماعي الفوري بالكامل، استضف خادم `server.ts` على خدمة تدعم WebSockets، ثم اربط الواجهة والخادم بها.
