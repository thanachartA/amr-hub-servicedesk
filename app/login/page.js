"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function Login() {
  const router = useRouter();
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState(""); const [pw,setPw]=useState("");
  const [msg,setMsg]=useState(null); const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{ if(data.session) router.replace("/"); }); },[]);
  async function submit(e){ e.preventDefault(); setBusy(true); setErr(null); setMsg(null);
    if(mode==="login"){
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      setBusy(false); if(error) setErr(error.message); else router.replace("/");
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password: pw });
      setBusy(false);
      if(error){ setErr(error.message); return; }
      if(data.session){ router.replace("/"); }
      else setMsg("สมัครสำเร็จ — ถ้าระบบเปิด 'ยืนยันอีเมล' ให้กดลิงก์ในเมลก่อน แล้วค่อยเข้าสู่ระบบ");
    }
  }
  async function magic(){ setBusy(true); setErr(null); setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo: typeof window!=="undefined"?window.location.origin:undefined }});
    setBusy(false); if(error) setErr(error.message); else setMsg("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว");
  }
  return (<div className="login">
    <h1>Central Admin Hub</h1><p className="muted">Service Desk · {mode==="login"?"เข้าสู่ระบบ":"สมัครใช้งาน"}ด้วยอีเมลบริษัท</p>
    {err&&<div className="err">{err}</div>}{msg&&<div className="ok">{msg}</div>}
    <form onSubmit={submit}>
      <div className="field"><label>อีเมล</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@amrasia.com"/></div>
      <div className="field"><label>รหัสผ่าน{mode==="signup"?" (ตั้งใหม่ อย่างน้อย 6 ตัว)":""}</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} required minLength={6} placeholder="••••••••"/></div>
      <button className="btn" style={{width:"100%"}} disabled={busy}>{busy?"…":(mode==="login"?"เข้าสู่ระบบ":"สมัคร + ตั้งรหัส")}</button>
    </form>
    <div style={{textAlign:"center",margin:"12px 0",fontSize:13}}>
      {mode==="login"
        ? <a href="#" onClick={e=>{e.preventDefault();setMode("signup");setErr(null);setMsg(null);}} style={{color:"#0E7C86"}}>ยังไม่มีบัญชี? สมัครที่นี่</a>
        : <a href="#" onClick={e=>{e.preventDefault();setMode("login");setErr(null);setMsg(null);}} style={{color:"#0E7C86"}}>มีบัญชีแล้ว? เข้าสู่ระบบ</a>}
    </div>
    <button className="btn sec" style={{width:"100%"}} onClick={magic} disabled={busy||!email}>ส่งลิงก์เข้าสู่ระบบทางอีเมล (Magic Link)</button>
  </div>);
}
