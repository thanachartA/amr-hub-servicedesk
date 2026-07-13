"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";

const ROLE_TH={owner:"Owner",supervisor:"Supervisor",lead:"Lead",agent:"Agent"};

export default function Team(){
  const [members,setMembers]=useState([]); const [unassigned,setUnassigned]=useState([]);
  const [uid,setUid]=useState(null); const [canManage,setCanManage]=useState(false); const [msg,setMsg]=useState(null);
  async function load(){
    const { data:t }=await supabase.from("hub_team").select("hub_role,is_available,away_note,profiles:user_id(id,full_name)");
    const { data:reqs }=await supabase.from("hub_requests")
      .select("id,ticket_no,title,status,assignee_id,suggested_assignee_id,suggested_reason,hub_request_types(name),suggested:suggested_assignee_id(full_name)")
      .not("status","in","(closed,cancelled)");
    const open=reqs||[];
    const withLoad=(t||[]).map(m=>({...m,count:open.filter(r=>r.assignee_id===m.profiles?.id).length}));
    setMembers(withLoad.sort((a,b)=>b.count-a.count));
    setUnassigned(open.filter(r=>!r.assignee_id));
  }
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const u=sess.session.user.id; setUid(u);
    const { data:me }=await supabase.from("hub_team").select("hub_role").eq("user_id",u).maybeSingle();
    setCanManage(["owner","supervisor"].includes(me?.hub_role));
    load();
  })(); },[]);

  async function assign(reqId,target){
    const { data:sess }=await supabase.auth.getSession();
    await supabase.from("hub_requests").update({assignee_id:target,status:"assigned",assigned_at:new Date().toISOString()}).eq("id",reqId);
    await supabase.from("hub_assignments").insert({request_id:reqId,assignee_id:target,assigned_by:sess.session.user.id,is_current:true});
    await supabase.from("hub_activity_log").insert({request_id:reqId,actor_id:sess.session.user.id,action:"assign",to_status:"assigned",note:"มอบหมายจากหน้า ทีม"});
    await supabase.from("hub_notifications").insert({user_id:target,title:"ได้รับมอบหมายงานใหม่",link:"/requests/"+reqId,request_id:reqId});
    load();
  }
  async function toggleAvail(m){
    const target=m.profiles?.id; if(!target) return;
    const next=!m.is_available;
    let note=null;
    if(!next){ note=prompt("เหตุผล (เช่น ลาพักร้อน, ลาป่วย) — เว้นว่างได้:",""); if(note===null) return; }
    const { error }=await supabase.rpc("hub_set_availability",{p_user:target,p_available:next,p_note:note});
    setMsg(error ? ("ผิดพลาด: "+error.message) : (next?"เปิดรับงานแล้ว":"ตั้งเป็นไม่รับงานแล้ว"));
    load();
  }

  return (<Shell title="ทีม Hub (มุมมองหัวหน้า)">
    {msg&&<div className="ok">{msg}</div>}
    <div className="card"><h2>โหลดงานปัจจุบัน & สถานะรับงาน</h2>
      <table><thead><tr><th>สมาชิก</th><th>บทบาท</th><th className="right">งานที่ถืออยู่</th><th>สถานะรับงาน</th><th></th></tr></thead>
      <tbody>{members.map(m=>{ const own=m.profiles?.id===uid; const canEdit=canManage||own;
        return (<tr key={m.profiles?.id}>
        <td><b>{m.profiles?.full_name}</b>{own&&<span className="muted" style={{marginLeft:6,fontSize:11}}>(คุณ)</span>}</td>
        <td><span className="tag">{ROLE_TH[m.hub_role]||m.hub_role}</span></td>
        <td className="right"><b>{m.count}</b></td>
        <td>
          {m.is_available
            ? <span className="badge b-closed">พร้อมรับงาน</span>
            : <span className="badge b-cancelled">ไม่รับงาน{m.away_note?" · "+m.away_note:""}</span>}
        </td>
        <td className="right">{canEdit&&<button className="btn sm sec" onClick={()=>toggleAvail(m)}>{m.is_available?"ตั้งเป็นลา/ไม่รับงาน":"กลับมารับงาน"}</button>}</td>
      </tr>); })}
        {!members.length&&<tr><td colSpan="5" className="muted">ยังไม่มีสมาชิกทีม</td></tr>}</tbody></table>
      <p className="muted" style={{marginTop:8,fontSize:11.5}}>คนที่ตั้งเป็น "ไม่รับงาน" จะไม่ถูกระบบแนะนำให้รับงานใหม่ · Owner/Supervisor ตั้งให้ใครก็ได้ · ทุกคนตั้งของตัวเองได้</p>
    </div>

    <div className="card"><h2>งานที่ยังไม่มอบหมาย ({unassigned.length})</h2>
      <table><thead><tr><th>Ticket</th><th>เรื่อง</th><th>ประเภท</th><th>🤖 ระบบแนะนำ</th><th>มอบหมายให้</th></tr></thead>
      <tbody>{unassigned.map(r=>(<tr key={r.id}>
        <td className="mono">{r.ticket_no}</td><td>{r.title}</td><td>{r.hub_request_types?.name}</td>
        <td>{r.suggested_assignee_id
          ? <div><b style={{fontSize:12.5}}>{r.suggested?.full_name}</b>
              <div className="muted" style={{fontSize:11}}>{r.suggested_reason}</div>
              <button className="btn sm" style={{marginTop:4}} onClick={()=>assign(r.id,r.suggested_assignee_id)}>✓ ยืนยัน</button></div>
          : <span className="muted" style={{fontSize:12}}>— ไม่มีคำแนะนำ —</span>}</td>
        <td><select defaultValue="" onChange={e=>e.target.value&&assign(r.id,e.target.value)}>
          <option value="">— เลือกเอง —</option>
          {members.filter(m=>m.is_available).map(m=>(<option key={m.profiles?.id} value={m.profiles?.id}>{m.profiles?.full_name} ({m.count})</option>))}</select></td></tr>))}
        {!unassigned.length&&<tr><td colSpan="5" className="muted">ไม่มีงานค้างมอบหมาย</td></tr>}</tbody></table>
    </div>
  </Shell>);
}
