"use client";
// หน้ารับ redirect กลับจาก Microsoft (OAuth PKCE) — แลก code เป็น session ให้เสร็จก่อนพาไปหน้าแรก
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallback(){
  const router = useRouter();
  const [err, setErr] = useState(null);
  useEffect(()=>{
    let done = false;
    const go = (session)=>{ if(done) return; done = true; router.replace(session ? "/" : "/login"); };
    (async()=>{
      // 1) มี error กลับมาจาก OAuth ไหม (เช่น consent/redirect)
      const q = new URLSearchParams(window.location.search);
      const h = new URLSearchParams(window.location.hash.replace(/^#/,""));
      const oerr = q.get("error_description") || q.get("error") || h.get("error_description") || h.get("error");
      if(oerr){ setErr(decodeURIComponent(oerr)); setTimeout(()=>go(null), 4000); return; }

      // 2) ถ้ามี ?code → แลกเป็น session เอง (PKCE) จะได้เห็น error จริงถ้าล้มเหลว
      if(q.get("code")){
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if(error){ setErr("แลกโทเคนไม่สำเร็จ: "+error.message); setTimeout(()=>go(null), 5000); return; }
        if(data?.session){ go(data.session); return; }
      }

      // 3) เผื่อ implicit (#access_token) — detectSessionInUrl จะจัดการ แล้วรอ event
      const { data:sub } = supabase.auth.onAuthStateChange((_e, session)=>{ if(session) go(session); });
      const { data } = await supabase.auth.getSession();
      if(data.session){ go(data.session); return; }
      const t = setTimeout(()=>{ if(!done){ setErr("เข้าสู่ระบบไม่สำเร็จ — กรุณาลองใหม่"); setTimeout(()=>go(null), 2500); } }, 6000);
      // cleanup
      window.__cbCleanup = ()=>{ try{ sub.subscription.unsubscribe(); }catch(e){} clearTimeout(t); };
    })();
    return ()=>{ try{ window.__cbCleanup && window.__cbCleanup(); }catch(e){} };
  },[]);
  return (
    <div style={{minHeight:"60vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12,padding:20,textAlign:"center"}}>
      <div style={{fontSize:15,color:err?"#B03A2E":"#5A6672",maxWidth:460}}>{err || "กำลังเข้าสู่ระบบ…"}</div>
      {err&&<a href="/login" style={{fontSize:13,color:"#EB0029"}}>← กลับไปหน้าเข้าสู่ระบบ</a>}
    </div>
  );
}
