"use client";
// หน้ารับ redirect กลับจาก Microsoft (OAuth) — รอให้ Supabase แลก code เป็น session ให้เสร็จ
// ก่อนพาไปหน้าแรก (ไม่มี auth guard บนหน้านี้ จึงไม่โดนเด้งกลับ /login ระหว่างรอ)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallback(){
  const router = useRouter();
  const [err, setErr] = useState(null);
  useEffect(()=>{
    let done = false;
    const go = (session)=>{ if(done) return; done = true; router.replace(session ? "/" : "/login"); };
    // Supabase (detectSessionInUrl) จะแลก ?code / #token เป็น session อัตโนมัติ แล้วยิง event นี้
    const { data:sub } = supabase.auth.onAuthStateChange((_e, session)=>{ if(session) go(session); });
    // เผื่อ session ถูกตั้งก่อน subscribe
    supabase.auth.getSession().then(({ data })=>{ if(data.session) go(data.session); });
    // ถ้าเกิน 8 วิ ยังไม่ได้ session → กลับไปหน้า login พร้อมข้อความ
    const t = setTimeout(()=>{ if(!done){ setErr("เข้าสู่ระบบไม่สำเร็จ — กรุณาลองใหม่"); setTimeout(()=>go(null), 1500); } }, 8000);
    return ()=>{ try{ sub.subscription.unsubscribe(); }catch(e){} clearTimeout(t); };
  },[]);
  return (
    <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:10,fontFamily:"inherit"}}>
      <div style={{fontSize:15,color:err?"#B03A2E":"#5A6672"}}>{err || "กำลังเข้าสู่ระบบ…"}</div>
    </div>
  );
}
