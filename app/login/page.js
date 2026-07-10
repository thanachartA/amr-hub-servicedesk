"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const okDomain = e => /@amrasia\.com$/i.test((e||"").trim());

export default function Login(){
  const router=useRouter();
  const [email,setEmail]=useState("");
  const [msg,setMsg]=useState(null); const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{ if(data.session) router.replace("/"); }); },[]);
  async function magic(e){ if(e) e.preventDefault(); setErr(null); setMsg(null);
    if(!okDomain(email)){ setErr("กรุณาใช้อีเมลบริษัท @amrasia.com เท่านั้น"); return; }
    setBusy(true);
    const { error }=await supabase.auth.signInWithOtp({ email:email.trim(), options:{ emailRedirectTo: typeof window!=="undefined"?window.location.origin:undefined }});
    setBusy(false); if(error) setErr(error.message); else setMsg("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว — เปิดเมลแล้วกดลิงก์เพื่อเข้าใช้งาน (ลิงก์ใช้ได้ครั้งเดียว)");
  }
  return (<div className="login">
    <img className="logo" src="/amr-logo.png" alt="AMR ASIA"/>
    <h1>Central Admin Hub</h1>
    <p>Service Desk · เข้าใช้งานด้วยอีเมลบริษัท</p>
    {err&&<div className="err">{err}</div>}{msg&&<div className="ok">{msg}</div>}
    <form onSubmit={magic}>
      <div className="field"><label>อีเมลบริษัท</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@amrasia.com" autoFocus/></div>
      <button className="btn" style={{width:"100%"}} disabled={busy||!email}>{busy?"กำลังส่ง…":"เข้าสู่ระบบด้วยอีเมล"}</button>
    </form>
    <div className="muted" style={{fontSize:12,marginTop:14,textAlign:"center",lineHeight:1.7}}>
      ระบบจะส่ง <b>ลิงก์เข้าสู่ระบบ</b> ไปที่อีเมล @amrasia.com ของคุณ<br/>ไม่ต้องตั้งรหัสผ่าน · เฉพาะอีเมลบริษัทเท่านั้น
    </div>
  </div>);
}
