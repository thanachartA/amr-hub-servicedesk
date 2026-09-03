"use client";
// หน้ารับ redirect กลับจาก Microsoft (OAuth PKCE)
// Supabase (detectSessionInUrl) แลก code เป็น session ให้อัตโนมัติ — หน้านี้แค่ "รอ" ให้เสร็จ แล้วพาไปหน้าแรก
// (ไม่เรียก exchangeCodeForSession เอง เพื่อไม่ให้ชนกับ auto-exchange)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallback(){
  const router = useRouter();
  const [err, setErr] = useState(null);
  useEffect(()=>{
    let done = false;
    const go = (session)=>{ if(done) return; done = true; router.replace(session ? "/" : "/login"); };

    // error กลับมาจาก OAuth ไหม
    const q = new URLSearchParams(window.location.search);
    const h = new URLSearchParams(window.location.hash.replace(/^#/,""));
    const oerr = q.get("error_description") || q.get("error") || h.get("error_description") || h.get("error");
    if(oerr){ setErr(decodeURIComponent(oerr)); setTimeout(()=>go(null), 4000); return; }

    // ฟัง event SIGNED_IN (ตอน auto-exchange เสร็จ)
    const { data:sub } = supabase.auth.onAuthStateChange((_e, session)=>{ if(session) go(session); });
    // + poll เผื่อ session ถูกตั้งก่อน subscribe (auto-exchange อาจเสร็จเร็ว)
    let tries = 0;
    const iv = setInterval(async()=>{
      tries++;
      const { data } = await supabase.auth.getSession();
      if(data.session){ clearInterval(iv); go(data.session); }
      else if(tries >= 25){ clearInterval(iv); setErr("เข้าสู่ระบบไม่สำเร็จ — กรุณาลองใหม่"); setTimeout(()=>go(null), 2500); }
    }, 400); // รวม ~10 วินาที

    return ()=>{ try{ sub.subscription.unsubscribe(); }catch(e){} clearInterval(iv); };
  },[]);
  return (
    <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:20,textAlign:"center"}}>
      <div style={{fontSize:15,color:err?"#B03A2E":"#5A6672",maxWidth:460}}>{err || "กำลังเข้าสู่ระบบ…"}</div>
      {err&&<a href="/login" style={{fontSize:13,color:"#EB0029"}}>← กลับไปหน้าเข้าสู่ระบบ</a>}
    </div>
  );
}
