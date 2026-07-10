"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const okDomain = e => /@amrasia\.com$/i.test((e||"").trim());
const ORIGIN = () => typeof window!=="undefined" ? window.location.origin : undefined;

export default function Login(){
  const router=useRouter();
  const [mode,setMode]=useState("pw"); // pw | signup | magic
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [pw2,setPw2]=useState("");
  const [msg,setMsg]=useState(null); const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{ if(data.session) router.replace("/"); }); },[]);
  const clr=()=>{ setErr(null); setMsg(null); };

  async function pwLogin(e){ e.preventDefault(); clr();
    if(!okDomain(email)){ setErr("กรุณาใช้อีเมลบริษัท @amrasia.com เท่านั้น"); return; }
    setBusy(true);
    const { error }=await supabase.auth.signInWithPassword({ email:email.trim(), password:pw });
    setBusy(false);
    if(error) setErr("อีเมลหรือรหัสผ่านไม่ถูกต้อง"); else router.replace("/");
  }
  async function signup(e){ e.preventDefault(); clr();
    if(!okDomain(email)){ setErr("กรุณาใช้อีเมลบริษัท @amrasia.com เท่านั้น"); return; }
    if(pw.length<6){ setErr("รหัสผ่านอย่างน้อย 6 ตัวอักษร"); return; }
    if(pw!==pw2){ setErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setBusy(true);
    const { data, error }=await supabase.auth.signUp({ email:email.trim(), password:pw, options:{ emailRedirectTo: ORIGIN() }});
    setBusy(false);
    if(error){ setErr(/registered|already/i.test(error.message)?"อีเมลนี้มีบัญชีแล้ว — เข้าด้วยรหัสผ่าน หรือกด \"ลืมรหัสผ่าน\"":error.message); return; }
    if(data.session){ router.replace("/"); }
    else setMsg("ตั้งรหัสผ่านแล้ว — เปิดอีเมลแล้วกดยืนยันเพื่อเข้าใช้งานครั้งแรก");
  }
  async function magic(e){ e.preventDefault(); clr();
    if(!okDomain(email)){ setErr("กรุณาใช้อีเมลบริษัท @amrasia.com เท่านั้น"); return; }
    setBusy(true);
    const { error }=await supabase.auth.signInWithOtp({ email:email.trim(), options:{ emailRedirectTo: ORIGIN() }});
    setBusy(false);
    if(error) setErr(error.message); else setMsg("ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว — เปิดเมลแล้วกดลิงก์");
  }
  async function forgot(){ clr();
    if(!okDomain(email)){ setErr("กรอกอีเมล @amrasia.com ก่อน แล้วกด \"ลืมรหัสผ่าน\" อีกครั้ง"); return; }
    setBusy(true);
    const { error }=await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: ORIGIN()+"/reset" });
    setBusy(false);
    if(error) setErr(error.message); else setMsg("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว");
  }

  return (<div className="login">
    <img className="logo" src="/amr-logo.png" alt="AMR ASIA"/>
    <h1>Central Admin Hub</h1>
    <p>Service Desk · เข้าใช้งานด้วยอีเมลบริษัท</p>
    {err&&<div className="err">{err}</div>}{msg&&<div className="ok">{msg}</div>}

    {mode==="pw" && (
      <form onSubmit={pwLogin}>
        <div className="field"><label>อีเมลบริษัท</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@amrasia.com" autoFocus/></div>
        <div className="field"><label>รหัสผ่าน</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="รหัสผ่าน"/></div>
        <button className="btn" style={{width:"100%"}} disabled={busy||!email||!pw}>{busy?"กำลังเข้า…":"เข้าสู่ระบบ"}</button>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:12,fontSize:13}}>
          <a href="#" onClick={e=>{e.preventDefault();clr();setMode("signup");}} style={{color:"#E81828"}}>ตั้งรหัสผ่านครั้งแรก</a>
          <a href="#" onClick={e=>{e.preventDefault();forgot();}} style={{color:"#5A6672"}}>ลืมรหัสผ่าน?</a>
        </div>
        <div style={{textAlign:"center",marginTop:10}}>
          <a href="#" onClick={e=>{e.preventDefault();clr();setMode("magic");}} style={{fontSize:12,color:"#98A4AE"}}>หรือเข้าด้วยลิงก์อีเมล</a>
        </div>
      </form>
    )}

    {mode==="signup" && (
      <form onSubmit={signup}>
        <div className="field"><label>อีเมลบริษัท</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@amrasia.com" autoFocus/></div>
        <div className="field"><label>ตั้งรหัสผ่าน</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร"/></div>
        <div className="field"><label>ยืนยันรหัสผ่าน</label><input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} placeholder="พิมพ์รหัสผ่านอีกครั้ง"/></div>
        <button className="btn" style={{width:"100%"}} disabled={busy||!email||!pw||!pw2}>{busy?"กำลังตั้ง…":"ตั้งรหัสผ่านและเข้าใช้งาน"}</button>
        <div style={{textAlign:"center",marginTop:12}}>
          <a href="#" onClick={e=>{e.preventDefault();clr();setMode("pw");}} style={{fontSize:13,color:"#E81828"}}>← มีรหัสผ่านแล้ว เข้าสู่ระบบ</a>
        </div>
      </form>
    )}

    {mode==="magic" && (
      <form onSubmit={magic}>
        <div className="field"><label>อีเมลบริษัท</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@amrasia.com" autoFocus/></div>
        <button className="btn" style={{width:"100%"}} disabled={busy||!email}>{busy?"กำลังส่ง…":"ส่งลิงก์เข้าสู่ระบบ"}</button>
        <div style={{textAlign:"center",marginTop:12}}>
          <a href="#" onClick={e=>{e.preventDefault();clr();setMode("pw");}} style={{fontSize:13,color:"#E81828"}}>← กลับไปเข้าด้วยรหัสผ่าน</a>
        </div>
      </form>
    )}

    <div className="muted" style={{fontSize:12,marginTop:14,textAlign:"center",lineHeight:1.7}}>
      เฉพาะอีเมล <b>@amrasia.com</b> เท่านั้น
    </div>
  </div>);
}
