# AMR Central Admin Hub — Service Desk : คู่มือ Deploy

แอป Next.js 14 (App Router) พร้อม deploy แล้ว — Backend (Supabase) ตั้งค่าเสร็จและใช้งานได้จริง

## 1) Environment Variables (ตั้งใน Vercel)
```
NEXT_PUBLIC_SUPABASE_URL = https://wrxmedciurajjckvbrxy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_x3LpLEREYNqUBNapmpv3-g_zpJ8XU4P
```
(ค่าเหล่านี้ฝัง fallback ไว้ในโค้ดแล้ว — เป็น publishable key ปลอดภัยต่อ public)

## 2) Deploy (เลือกทางใดทางหนึ่ง)
**A. Vercel Dashboard (ง่ายสุด):** vercel.com → Add New Project → อัปโหลด/เชื่อม repo โฟลเดอร์นี้ → Framework = Next.js → Deploy
**B. Vercel CLI:**
```
cd hub-servicedesk
npx vercel --prod
```

## 3) ตั้งค่า Supabase Auth (สำคัญ)
Supabase Dashboard → Authentication → URL Configuration
- Site URL: ใส่ URL ที่ Vercel ให้มา (เช่น https://amr-hub-servicedesk.vercel.app)
- Redirect URLs: เพิ่ม URL เดียวกัน (สำหรับ Magic Link)

## 4) เข้าใช้งาน
- ล็อกอินด้วยอีเมลบริษัท (มีบัญชีใน profiles/auth อยู่แล้ว 161 คน) — ใช้ Magic Link ได้
- ทีม Hub ที่จัดการงานได้ = สมาชิกใน hub_team (ตอนนี้ seed ไว้ 7 คน, ธัญรัตน์ = lead)
- เพิ่ม/แก้สมาชิกทีม, ประเภทงาน, cost code ได้ที่ตาราง hub_* ใน Supabase (หรือทำหน้า /admin เพิ่มภายหลัง)

## Backend ที่ตั้งไว้แล้ว (live)
โปรเจกต์: AMR Utilization & Budget Control (wrxmedciurajjckvbrxy)
- 10 ตาราง hub_* + RLS + trigger ออกเลข ticket (HUB-YYYY-00001)
- reuse profiles (พนักงาน) + projects (77 โครงการ, มี budget_amount)
- seed: 8 ประเภทงาน, 4 cost code, ทีม 7 คน, skill matrix ผู้รับผิดชอบหลัก

## หน้าจอในแอป
/ dashboard · /requests รายการ · /requests/new เปิดคำขอ · /requests/[id] รายละเอียด+จัดการ · /team มุมมองหัวหน้า · /projects ต้นทุนโครงการ
