"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";

export default function Admin(){
  const [isLead,setIsLead]=useState(false); const [ready,setReady]=useState(false);
  const [rows,setRows]=useState([]); const [team,setTeam]=useState({}); const [q,setQ]=useState(""); const [msg,setMsg]=useState(null);
  async function load(){
    const { data:prof }=await supabase.from("profiles").select("id,full_name,email,department,role").order("full_name").limit(1000);
    const { data:t }=await supabase.from("hub_team").select("user_id,hub_role");
    const map={}; (t||[]).forEach(x=>map[x.user_id]=x.hub_role);
    setRows(prof||[]); setTeam(map);
  }
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession();
    const { data:t }=await supabase.from("hub_team").select("hub_role").eq("user_id",sess.session.user.id).maybeSingle();
    setIsLead(t?.hub_role==="lead"); setReady(true); load();
  })(); },[]);
  async function setRole(uid, role){
    setMsg(null);
    if(role==="none"){ const {error}=await supabase.from("hub_team").delete().eq("user_id",uid); if(error){setMsg("ผิดพลาด: "+error.message);return;} }
    else { const {error}=await supabase.from("hub_team").upsert({user_id:uid,hub_role:role},{onConflict:"user_id"}); if(error){setMsg("ผิดพลาด: "+error.message);return;} }
    setTeam(t=>({...t,[uid]:role==="none"?undefined:role})); setMsg("บันทึกสิทธิ์แล้ว");
  }
  if(ready && !isLead) return <Shell title="จัดการผู้ใช้"><div className="card"><div className="muted">หน้านี้เฉพาะหัวหน้าทีม (Lead) เท่านั้น</div></div></Shell>;
  const shown=rows.filter(r=>!q || (r.full_name||"").toLowerCase().includes(q.toLowerCase()) || (r.email||"").toLowerCase().includes(q.toLowerCase()));
  const nTeam=Object.values(team).filter(Boolean).length;
  return (<Shell title="จัดการผู้ใช้ & สิทธิ์">
    {msg&&<div className="ok">{msg}</div>}
    <div className="kpis" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
      <div className="kpi"><div className="n">{rows.length}</div><div className="l">ผู้ใช้ทั้งหมด</div></div>
      <div className="kpi green"><div className="n">{nTeam}</div><div className="l">อยู่ในทีม Hub</div></div>
      <div className="kpi"><div className="n">{Object.values(team).filter(r=>r==="lead").length}</div><div className="l">Lead</div></div>
    </div>
    <div className="card">
      <div className="field" style={{maxWidth:340}}><label>ค้นหา ชื่อ / อีเมล</label><input value={q} onChange={e=>setQ(e.target.value)} placeholder="พิมพ์เพื่อค้นหา…"/></div>
      <table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>ฝ่าย</th><th>สิทธิ์ใน Hub</th></tr></thead>
      <tbody>{shown.map(r=>{ const role=team[r.id]||"none";
        return (<tr key={r.id}>
          <td><b>{r.full_name}</b></td><td className="muted">{r.email||"—"}</td><td>{r.department||"—"}</td>
          <td><select value={role} onChange={e=>setRole(r.id,e.target.value)} style={{minWidth:170,borderColor:role==="lead"?"#2E7D5B":role==="agent"?"#0E7C86":"#E2E7EB"}}>
            <option value="none">— ไม่ใช่ทีม Hub —</option>
            <option value="agent">Agent (สมาชิกทีม)</option>
            <option value="lead">Lead (หัวหน้าทีม)</option>
          </select></td>
        </tr>); })}
        {!shown.length&&<tr><td colSpan="4" className="muted">ไม่พบผู้ใช้</td></tr>}</tbody></table>
      <p className="muted" style={{marginTop:10}}>เปลี่ยน dropdown = อัปเดตสิทธิ์ทันที · <b>Agent</b> = รับ/จัดการงานได้ · <b>Lead</b> = จัดการงาน+ทีม+ตั้งค่า · <b>ไม่ใช่ทีม</b> = เปิดคำขอได้อย่างเดียว</p>
    </div>
  </Shell>);
}
