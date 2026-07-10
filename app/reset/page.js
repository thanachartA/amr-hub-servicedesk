"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function Reset(){
  const router=useRouter();
  const [ready,setReady]=useState(false); const [ok,setOk]=useState(false);
  const [pw,setPw]=useState(""); const [pw2,setPw2]=useState("");
  const [msg,setMsg]=useState(null); const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const { data:sub }=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY" || session) setOk(true);
    });
    supabase.auth.getSession().then(({data})=>{ if(data.session) setOk(true); setReady(true); });
    return ()=>{ sub.subscription.unsubscribe(); };
  },[]);
  async function save(e){ e.preventDefault(); setErr(null); setMsg(null);
    if(pw.length<6){ setErr("รหัสผ่านอย่างน้อย 6 ตัวอักษร"); return; }
    if(pw!==pw2){ setErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setBusy(true);
    const { error }=await supabase.auth.updateUser({ password:pw });
    setBusy(false);
    if(error) setErr(error.message);
    else { setMsg("ตั้งรหัสผ่านใหม่แล้ว กำลังเข้าสู่ระบบ…"); setTimeout(()=>router.replace("/"),1200); }
  }
  return (<div className="login">
    <img className="logo" src="/amr-logo.png" alt="AMR ASIA"/>
    <h1>ตั้งรหัสผ่านใหม่</h1>
    <p>Central Admin Hub · Service Desk</p>
    {err&&<div className="err">{err}</div>}{msg&&<div className="ok">{msg}</div>}
    {ready && !ok && <div className="muted" style={{textAlign:"center",lineHeight:1.7}}>ลิงก์ไม่ถูกต้องหรือหมดอายุ<br/>กลับไปที่ <a href="/login" style={{color:"#E81828"}}>หน้าเข้าสู่ระบบ</a> แล้วกด "ลืมรหัสผ่าน" อีกครั้ง</div>}
    {ok && (<form onSubmit={save}>
      <div className="field"><label>รหัสผ่านใหม่</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" autoFocus/></div>
      <div className="field"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} placeholder="พิมพ์รหัสผ่านอีกครั้ง"/></div>
      <button className="btn" style={{width:"100%"}} disabled={busy||!pw||!pw2}>{busy?"กำลังบันทึก…":"บันทึกรหัสผ่านใหม่"}</button>
    </form>)}
  </div>);
}
