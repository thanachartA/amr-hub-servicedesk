import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kkbffgbotigddtfmultm.supabase.co"; // URL เป็นข้อมูลสาธารณะ ไม่ใช่ความลับ
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only

function genTempPassword(){
  const U="ABCDEFGHJKLMNPQRSTUVWXYZ", L="abcdefghijkmnpqrstuvwxyz", D="23456789", S="!@#$%*";
  const pick = s => s[Math.floor(Math.random()*s.length)];
  const out = [pick(U), pick(U), pick(L), pick(L), pick(L), pick(D), pick(D), pick(D), pick(S)];
  const all = U+L+D;
  while(out.length < 12) out.push(pick(all));
  for(let i=out.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=out[i]; out[i]=out[j]; out[j]=t; }
  return out.join("");
}

export async function POST(req){
  if(!SERVICE || !SB_URL){
    return Response.json({ error:"เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY บน Vercel (ใส่แล้วต้องกด Redeploy ด้วย)" }, { status:500 });
  }

  const hdr = req.headers.get("authorization") || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if(!token) return Response.json({ error:"ไม่ได้เข้าสู่ระบบ" }, { status:401 });

  const admin = createClient(SB_URL, SERVICE, { auth:{ persistSession:false, autoRefreshToken:false } });

  const { data:who, error:authErr } = await admin.auth.getUser(token);
  const caller = who && who.user;
  if(authErr || !caller) return Response.json({ error:"เซสชันหมดอายุ — เข้าสู่ระบบใหม่" }, { status:401 });

  const { data:me } = await admin.from("hub_team").select("hub_role").eq("user_id", caller.id).maybeSingle();
  if(!me || !["owner","supervisor"].includes(me.hub_role)){
    return Response.json({ error:"เฉพาะ Owner / Supervisor เท่านั้นที่ตั้งรหัสผ่านให้ผู้อื่นได้" }, { status:403 });
  }

  const body = await req.json().catch(()=>({}));
  const targetId = body && body.user_id;
  if(!targetId) return Response.json({ error:"ไม่ได้ระบุผู้ใช้ปลายทาง" }, { status:400 });

  const { data:tg, error:getErr } = await admin.auth.admin.getUserById(targetId);
  if(getErr || !tg || !tg.user) return Response.json({ error:"ไม่พบผู้ใช้คนนี้ในระบบ Auth (อาจยังไม่เคยตั้งรหัสผ่านครั้งแรก)" }, { status:404 });

  const pw = genTempPassword();
  const meta = Object.assign({}, tg.user.user_metadata || {}, { must_change_password:true });
  const { error:updErr } = await admin.auth.admin.updateUserById(targetId, {
    password: pw,
    email_confirm: true,
    user_metadata: meta
  });
  if(updErr) return Response.json({ error:updErr.message }, { status:400 });

  await admin.from("hub_notifications").insert({
    user_id: targetId,
    title: "รหัสผ่านถูกตั้งใหม่โดยผู้ดูแลระบบ",
    body: "กรุณาตั้งรหัสผ่านใหม่ของคุณเองทันทีหลังเข้าสู่ระบบ"
  });

  return Response.json({ ok:true, email: tg.user.email, password: pw });
}
