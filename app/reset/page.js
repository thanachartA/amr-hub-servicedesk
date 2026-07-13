"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function Reset(){
  const router=useRouter();
  const [ready,setReady]=useState(false); const [ok,setOk]=useState(false); const [forced,setForced]=useState(false);
  const [pw,setPw]=useState(""); const [pw2,setPw2]=useState("");
  const [msg,setMsg]=useState(null); const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const mark=(session)=>{ if(session){ setOk(true); setForced(!!session.user?.user_metadata?.must_change_password); } };
    const { data:sub }=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY") setOk(true);
      mark(session);
    });
    supabase.auth.getSession().then(({data})=>{ mark(data.session); setReady(true); });
    return ()=>{ sub.subscription.unsubscribe(); };
  },[]);
  async function save(e){ e.preventDefault(); setErr(null); setMsg(null);
    if(pw.length<8){ setErr("รหัสผ่านอย่างน้อย 8 ตัวอักษร"); return; }
    if(pw!==pw2){ setErr("รหัสผ่านทั้งสองช่องไม่ตรงกัน"); return; }
    setBusy(true);
    // เคลียร์ธง must_change_password พร้อมกับตั้งรหัสใหม่
    const { error }=await supabase.auth.updateUser({ password:pw, data:{ must_change_password:false } });
    setBusy(false);
    if(error) setErr(error.message);
    else { setMsg("ตั้งรหัสผ่านใหม่แล้ว กำลังเข้าสู่ระบบ…"); setTimeout(()=>{ window.location.href="/"; },1200); }
  }
  return (<div className="login">
    <img className="logo" src="/amr-logo.png" alt="AMR ASIA"/>
    <h1>ตั้งรหัสผ่านใหม่</h1>
    <p>Central Admin Hub · Service Desk</p>
    {forced&&<div style={{background:"#FFF8E6",border:"1px solid #EBD9AE",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12.5,color:"#8A5A00",lineHeight:1.7}}>
      <b>คุณกำลังใช้รหัสผ่านชั่วคราวที่ผู้ดูแลระบบตั้งให้</b><br/>กรุณาตั้งรหัสผ่านของคุณเองก่อนเข้าใช้งาน
    </div>}
    {err&&<div className="err">{err}</div>}{msg&&<div className="ok">{msg}</div>}
    {ready && !ok && <div className="muted" style={{textAlign:"center",lineHeight:1.7}}>ลิงก์ไม่ถูกต้องหรือหมดอายุ<br/>กลับไปที่ <a href="/login" style={{color:"#E81828"}}>หน้าเข้าสู่ระบบ</a> แล้วกด "ลืมรหัสผ่าน" อีกครั้ง</div>}
    {ok && (<form onSubmit={save}>
      <div className="field"><label>รหัสผ่านใหม่</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" autoFocus/></div>
      <div className="field"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" value={pw2} onChange={e=>setPw2(e.target.value)} placeholder="พิมพ์รหัสผ่านอีกครั้ง"/></div>
      <button className="btn" style={{width:"100%"}} disabled={busy||!pw||!pw2}>{busy?"กำลังบันทึก…":"บันทึกรหัสผ่านใหม่"}</button>
    </form>)}
  </div>);
}
