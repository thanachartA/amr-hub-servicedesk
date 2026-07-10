"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const okDomain = e => /@amrasia\.com$/i.test((e||"").trim());

export default function Login(){
  const router=useRouter();
  const [email,setEmail]=useState(""); const [pw,setPw]=useState("");
  const [usePw,setUsePw]=useState(false);
  const [msg,setMsg]=useState(null); const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{ if(data.session) router.replace("/"); }); },[]);

  async function magic(e){ if(e) e.preventDefault(); setErr(null); setMsg(null);
    if(!okDomain(email)){ setErr("กรุณาใช้อีเมลบริษัท @amrasia.com เท่านั้น"); return; }
    setBusy(true);
    const { error }=await supabase.auth.signInWithOtp({ email:email.trim(), options:{ emailRedirectTo: typeof window!=="undefined"?window.location.origin:undefined }});
    setBusy(false);
    if(error) setErr(error.message);
    else setMsg("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว — เปิดเมลแล้วกดลิงก์เพื่อเข้าใช้งาน (ลิงก์ใช้ได้ครั้งเดียว)");
  }
  async function pwLogin(e){ if(e) e.preventDefault(); setErr(null); setMsg(null);
    if(!okDomain(email)){ setErr("กรุณาใช้อีเมลบริษัท @amrasia.com เท่านั้น"); return; }
    setBusy(true);
    const { error }=await supabase.auth.signInWithPassword({ email:email.trim(), password:pw });
    setBusy(false);
    if(error) setErr("อีเมลหรือรหัสผ่านไม่ถูกต้อง"); else router.replace("/");
  }

  return (<div className="login">
    <img className="logo" src="/amr-logo.png" alt="AMR ASIA"/>
    <h1>Central Admin Hub</h1>
    <p>Service Desk · เข้าใช้งานด้วยอีเมลบริษัท</p>
    {err&&<div className="err">{err}</div>}{msg&&<div className="ok">{msg}</div>}

    {!usePw ? (
      <form onSubmit={magic}>
        <div className="field"><label>อีเมลบริษัท</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@amrasia.com" autoFocus/></div>
        <button className="btn" style={{width:"100%"}} disabled={busy||!email}>{busy?"กำลังส่ง…":"ส่งลิงก์เข้าสู่ระบบทางอีเมล"}</button>
        <div style={{textAlign:"center",marginTop:12}}>
          <a href="#" onClick={e=>{e.preventDefault();setErr(null);setMsg(null);setUsePw(true);}} style={{fontSize:13,color:"#E81828"}}>เข้าสู่ระบบด้วยรหัสผ่านแทน</a>
        </div>
      </form>
    ) : (
      <form onSubmit={pwLogin}>
        <div className="field"><label>อีเมลบริษัท</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@amrasia.com" autoFocus/></div>
        <div className="field"><label>รหัสผ่าน</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="รหัสผ่าน"/></div>
        <button className="btn" style={{width:"100%"}} disabled={busy||!email||!pw}>{busy?"กำลังเข้า…":"เข้าสู่ระบบ"}</button>
        <div style={{textAlign:"center",marginTop:12}}>
          <a href="#" onClick={e=>{e.preventDefault();setErr(null);setMsg(null);setUsePw(false);}} style={{fontSize:13,color:"#E81828"}}>← กลับไปเข้าด้วยลิงก์อีเมล</a>
        </div>
      </form>
    )}

    <div className="muted" style={{fontSize:12,marginTop:14,textAlign:"center",lineHeight:1.7}}>
      เฉพาะอีเมล <b>@amrasia.com</b> เท่านั้น
    </div>
  </div>);
}
