"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { StatusBadge } from "../../components/util";

export default function Team(){
  const [members,setMembers]=useState([]); const [unassigned,setUnassigned]=useState([]);
  async function load(){
    const { data:t }=await supabase.from("hub_team").select("hub_role,profiles:user_id(id,full_name)");
    const { data:reqs }=await supabase.from("hub_requests").select("id,ticket_no,title,status,assignee_id,hub_request_types(name)").not("status","in","(closed,cancelled)");
    const open=reqs||[];
    const load=(t||[]).map(m=>({...m,count:open.filter(r=>r.assignee_id===m.profiles?.id&&!["done"].includes(r.status)).length}));
    setMembers(load.sort((a,b)=>b.count-a.count));
    setUnassigned(open.filter(r=>!r.assignee_id));
  }
  useEffect(()=>{ load(); },[]);
  async function assign(reqId,uid){
    const { data:sess }=await supabase.auth.getSession();
    await supabase.from("hub_requests").update({assignee_id:uid,status:"assigned",assigned_at:new Date().toISOString()}).eq("id",reqId);
    await supabase.from("hub_assignments").insert({request_id:reqId,assignee_id:uid,assigned_by:sess.session.user.id,is_current:true});
    await supabase.from("hub_activity_log").insert({request_id:reqId,actor_id:sess.session.user.id,action:"assign",to_status:"assigned",note:"มอบหมายจากหน้า ทีม"});
    load();
  }
  return (<Shell title="ทีม Hub (มุมมองหัวหน้า)">
    <div className="card"><h2>โหลดงานปัจจุบันของสมาชิก</h2>
      <table><thead><tr><th>สมาชิก</th><th>บทบาท</th><th className="right">งานที่ถืออยู่</th></tr></thead>
      <tbody>{members.map(m=>(<tr key={m.profiles?.id}><td>{m.profiles?.full_name}</td>
        <td><span className="tag">{m.hub_role}</span></td><td className="right"><b>{m.count}</b></td></tr>))}
        {!members.length&&<tr><td colSpan="3" className="muted">ยังไม่มีสมาชิกทีม</td></tr>}</tbody></table>
    </div>
    <div className="card"><h2>งานที่ยังไม่มอบหมาย ({unassigned.length})</h2>
      <table><thead><tr><th>Ticket</th><th>เรื่อง</th><th>ประเภท</th><th>มอบหมายให้</th></tr></thead>
      <tbody>{unassigned.map(r=>(<tr key={r.id}>
        <td className="mono">{r.ticket_no}</td><td>{r.title}</td><td>{r.hub_request_types?.name}</td>
        <td><select defaultValue="" onChange={e=>e.target.value&&assign(r.id,e.target.value)}>
          <option value="">— เลือก —</option>{members.map(m=>(<option key={m.profiles?.id} value={m.profiles?.id}>{m.profiles?.full_name} ({m.count})</option>))}</select></td></tr>))}
        {!unassigned.length&&<tr><td colSpan="4" className="muted">ไม่มีงานค้างมอบหมาย</td></tr>}</tbody></table>
    </div>
  </Shell>);
}
