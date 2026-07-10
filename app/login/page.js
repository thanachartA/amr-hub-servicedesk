"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const okDomain = e => /@amrasia\.com$/i.test((e||"").trim());

export default function Login(){
  const router=useRouter();
  const [email,setEmail]=useState(""); const [pw,setPw]=useState("");
  const [usePw,setUsePw]=useState(false); const [mode,setMode]=useState("login");
  const [msg,setMsg]=useState(null); const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{ if(data.session) router.replace("/"); }); },[]);
  function guard(){ if(!okDomain(email)){ setErr("กรุณาใช้อีเมลบริษัท @amrasia.com เท่านั้น"); return false; } return true; }
  async function magic(){ setErr(null); setMsg(null); if(!guard()) return; setBusy(true);
    const { error }=await supabase.auth.signInWithOtp({ email:email.trim(), options:{ emailRedirectTo: typeof window!=="undefined"?window.location.origin:undefined }});
    setBusy(false); if(error) setErr(error.message); else setMsg("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว — เปิดเมลแล้วกดลิงก์เพื่อเข้าใช้งาน");
  }
  async function submit(e){ e.preventDefault(); setErr(null); setMsg(null); if(!guard()) return; setBusy(true);
    if(mode==="login"){
      const { error }=await supabase.auth.signInWithPassword({ email:email.trim(), password:pw });
      setBusy(false); if(error) setErr(error.message); else router.replace("/");
    } else {
      const { data,error }=await supabase.auth.signUp({ email:email.trim(), password:pw });
      setBusy(false); if(error){ setErr(error.message); return; }
      if(data.session) router.replace("/");
      else setMsg("สมัครสำเร็จ — ถ้าระบบเปิดยืนยันอีเมล ให้กดลิงก์ในเมลก่อน");
    }
  }
  return (<div className="login">
    <img className="logo" src="/amr-logo.png" alt="AMR ASIA"/>
    <h1>Central Admin Hub</h1>
    <p>Service Desk · เข้าใช้งานด้วยอีเมลบริษัท (@amrasia.com)</p>
    {err&&<div className="err">{err}</div>}{msg&&<div className="ok">{msg}</div>}
    <div className="field"><label>อีเมลบริษัท</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@amrasia.com"/></div>
    <button className="btn" style={{width:"100%"}} disabled={busy||!email} onClick={magic}>✉ รับลิงก์เข้าสู่ระบบ (ไม่ต้องใช้รหัสผ่าน)</button>
    <div className="muted" style={{fontSize:12,margin:"8px 0 2px",textAlign:"center"}}>แนะนำ — ปลอดภัย ไม่ต้องจำรหัสผ่าน</div>
    <div style={{textAlign:"center",margin:"10px 0"}}>
      <a href="#" onClick={e=>{e.preventDefault();setUsePw(v=>!v);setErr(null);setMsg(null);}} style={{color:"#E81828",fontSize:13}}>{usePw?"ซ่อนการใช้รหัสผ่าน":"หรือเข้าด้วยรหัสผ่าน"}</a>
    </div>
    {usePw&&<form onSubmit={submit}>
      <div className="field"><label>รหัสผ่าน{mode==="signup"?" (อย่างน้อย 6 ตัว)":""}</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} minLength={6} placeholder="••••••••"/></div>
      <button className="btn sec" style={{width:"100%"}} disabled={busy||!pw}>{busy?"…":(mode==="login"?"เข้าสู่ระบบด้วยรหัสผ่าน":"สมัคร + ตั้งรหัสผ่าน")}</button>
      <div style={{textAlign:"center",marginTop:10,fontSize:13}}>
        {mode==="login"?<a href="#" onClick={e=>{e.preventDefault();setMode("signup");}} style={{color:"#E81828"}}>ยังไม่มีบัญชี? สมัคร</a>
                       :<a href="#" onClick={e=>{e.preventDefault();setMode("login");}} style={{color:"#E81828"}}>มีบัญชีแล้ว? เข้าสู่ระบบ</a>}
      </div>
    </form>}
  </div>);
}
