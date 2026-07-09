"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { StatusBadge, fmtDate, fmtMoney } from "../../../components/util";

export default function RequestDetail(){
  const { id }=useParams();
  const [r,setR]=useState(null); const [exp,setExp]=useState([]); const [log,setLog]=useState([]);
  const [team,setTeam]=useState([]); const [uid,setUid]=useState(null); const [staff,setStaff]=useState(false);
  const [assignee,setAssignee]=useState(""); const [msg,setMsg]=useState(null);
  const load=useCallback(async()=>{
    const { data:req }=await supabase.from("hub_requests").select("*,hub_request_types(name,default_sla_hours),requester:requester_id(full_name),assignee:assignee_id(full_name)").eq("id",id).single();
    setR(req); setAssignee(req?.assignee_id||"");
    const { data:e }=await supabase.from("hub_expense_entries").select("*,projects(code,name,budget_amount),hub_cost_codes(code,name)").eq("request_id",id);
    setExp(e||[]);
    const { data:l }=await supabase.from("hub_activity_log").select("*,actor:actor_id(full_name)").eq("request_id",id).order("created_at",{ascending:true});
    setLog(l||[]);
  },[id]);
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const u=sess.session.user.id; setUid(u);
    const { data:t }=await supabase.from("hub_team").select("hub_role,profiles:user_id(id,full_name)"); setTeam(t||[]);
    setStaff((t||[]).some(x=>x.profiles?.id===u));
    load();
  })(); },[id]);
  if(!r) return <Shell title="คำขอ"><div className="muted">กำลังโหลด…</div></Shell>;
  async function act(action,changes,note){
    const from=r.status;
    await supabase.from("hub_requests").update(changes).eq("id",id);
    await supabase.from("hub_activity_log").insert({request_id:id,actor_id:uid,action,from_status:from,to_status:changes.status||from,note:note||null});
    setMsg("อัปเดตแล้ว"); load();
  }
  const now=new Date();
  return (<Shell title={"คำขอ "+(r.ticket_no||"")}>
    {msg&&<div className="ok">{msg}</div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:18}}>
      <div>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><span className="mono">{r.ticket_no}</span> &nbsp; <StatusBadge s={r.status}/></div>
            <span className="tag">{r.hub_request_types?.name}</span>
          </div>
          <h2 style={{fontSize:18}}>{r.title}</h2>
          <p className="muted" style={{whiteSpace:"pre-wrap",margin:"8px 0"}}>{r.detail||"—"}</p>
          <div className="muted">ผู้ขอ: {r.requester?.full_name||"—"} · ความเร่งด่วน: {r.priority} · ครบ SLA: {fmtDate(r.sla_due_at)}
            {r.sla_due_at&&new Date(r.sla_due_at)<now&&!["done","closed","cancelled"].includes(r.status)&&<b style={{color:"#B03A2E"}}> · เกิน SLA</b>}</div>
        </div>
        {exp.length>0&&(<div className="card"><h2>ค่าใช้จ่ายโครงการ</h2>
          <table><thead><tr><th>โครงการ</th><th>Cost Code</th><th className="right">จำนวนเงิน</th><th>อนุมัติ</th><th></th></tr></thead>
          <tbody>{exp.map(x=>(<tr key={x.id}>
            <td>{x.projects?<span>{x.projects.code} · {x.projects.name}</span>:<span className="muted">—</span>}</td>
            <td>{x.hub_cost_codes?x.hub_cost_codes.code:"—"}</td>
            <td className="right">{fmtMoney(x.amount)}</td>
            <td><span className="tag">{x.approval_status}</span></td>
            <td className="right">{staff&&x.approval_status==="pending"&&<button className="btn sm" onClick={async()=>{await supabase.from("hub_expense_entries").update({approval_status:"approved",approved_by:uid}).eq("id",x.id);load();}}>อนุมัติ</button>}</td>
          </tr>))}</tbody></table></div>)}
        <div className="card"><h2>Timeline</h2>
          {log.map(l=>(<div key={l.id} style={{padding:"7px 0",borderBottom:"1px solid #EEF1F3",fontSize:13}}>
            <b>{l.action}</b> {l.from_status&&l.to_status&&<span className="muted">{l.from_status} → {l.to_status}</span>} {l.note&&<span> · {l.note}</span>}
            <div className="muted" style={{fontSize:11}}>{l.actor?.full_name||"ระบบ"} · {fmtDate(l.created_at)}</div></div>))}
          {!log.length&&<div className="muted">—</div>}
        </div>
      </div>
      <div>
        <div className="card"><h2>การดำเนินการ</h2>
          {!staff&&<div className="muted">เฉพาะทีม Hub เท่านั้นที่จัดการได้</div>}
          {staff&&<>
            <div className="field"><label>มอบหมายให้</label>
              <select value={assignee} onChange={e=>setAssignee(e.target.value)}>
                <option value="">— เลือกสมาชิก —</option>
                {team.map(m=>(<option key={m.profiles?.id} value={m.profiles?.id}>{m.profiles?.full_name}{m.hub_role==="lead"?" (Lead)":""}</option>))}</select></div>
            <button className="btn sm" style={{marginBottom:8,width:"100%"}} disabled={!assignee}
              onClick={()=>{ act("assign",{assignee_id:assignee,status:"assigned",assigned_at:new Date().toISOString()},"มอบหมายงาน"); supabase.from("hub_assignments").insert({request_id:id,assignee_id:assignee,assigned_by:uid,is_current:true}); }}>มอบหมาย</button>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <button className="btn sm sec" onClick={()=>act("start",{status:"in_progress"})}>เริ่มทำ</button>
              <button className="btn sm sec" onClick={()=>act("waiting",{status:"waiting"},"รอข้อมูล")}>รอข้อมูล</button>
              <button className="btn sm" onClick={()=>act("done",{status:"done",closed_at:new Date().toISOString()})}>เสร็จ</button>
              <button className="btn sm sec" onClick={()=>act("close",{status:"closed",closed_at:new Date().toISOString()})}>ปิดงาน</button>
            </div>
          </>}
        </div>
      </div>
    </div>
  </Shell>);
}
