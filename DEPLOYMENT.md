# نشر MONOPOLY على Vercel

## رابط ثابت للموقع

الرابط الذي يحتوي على معرّف مثل `monopoly-a20g6gsz5-omargo.vercel.app` هو رابط Deployment وقد يختلف بين عمليات النشر. لا تستخدمه كرابط دائم للمستخدمين. من لوحة Vercel افتح **Project → Settings → Domains**، واجعل نطاق Production ثابتاً مثل `monopoly-sandy.vercel.app` أو اربط نطاقك المخصص واجعله **Primary**. بعد ذلك استخدم ذلك النطاق الثابت في `APP_URL` و`CLIENT_ORIGIN`، ولا تغيّر إعداداته في كل عملية نشر.

## قاعدة البيانات ومتغيرات البيئة

1. أنشئ قاعدة PostgreSQL في Neon وانسخ pooled connection string.
2. في Vercel افتح **Project → Settings → Environment Variables** وأضف القيم التالية إلى **Production** (ولكل بيئة Preview تختبرها بشكل منفصل):
   - `DATABASE_URL`: سلسلة اتصال Neon (سرية).
   - `JWT_ACCESS_SECRET`: سر عشوائي ثابت بطول 32 حرفاً أو أكثر.
   - `NODE_ENV`: `production`.
   - `APP_URL`: النطاق الأساسي الثابت، مثل `https://monopoly-sandy.vercel.app`.
   - `CLIENT_ORIGIN`: أصل الموقع الثابت نفسه، اختياري.
3. تأكد من تشغيل مخطط قاعدة البيانات في Neon عبر `src/server/infra/migrations/0001_init.sql` إذا لم تكن تهيئة المخطط التلقائية متاحة.
4. بعد أي تعديل على متغيرات البيئة، أعد نشر Production؛ التغييرات لا تدخل في النشر السابق.

## إعداد البناء وتشخيص أخطاء الوظيفة

يستخدم `vercel.json` إعداد Vite وBun. بعد النشر اختبر واجهات API، ثم افحص **Project → Deployments → اختر Production deployment → Functions → Logs**. إذا تعطلت استيرادات الوحدة أو إعداد البيئة، يسجل المسار `api/[...path].ts` تفاصيل خطأ منقحة ويعيد JSON `API_STARTUP_FAILED` بدلاً من صفحة Vercel العامة. لا تشارك قيم `DATABASE_URL` أو الأسرار عند إرسال السجلات.

## حدود Vercel

Vercel Functions عديمة الحالة؛ لا تستضيف Socket.IO أو المجدول الخلفي كخادم دائم. HTTP API وتخزين الغرف في Neon يمكن أن يعملا، لكن تحديثات اللعب الحية والحضور والدردشة تحتاج خادماً دائماً يدعم WebSockets.
