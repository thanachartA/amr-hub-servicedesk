"use client";
import { useEffect, useState } from "react";
import Shell from "../components/Shell";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge, fmtDate } from "../components/util";

export default function Dashboard(){
  const [k,setK]=useState({open:0,breach:0,review:0,doneWk:0,onSla:0}); const [rows,setRows]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data } = await supabase.from("hub_requests").select("id,ticket_no,title,status,priority,sla_due_at,created_at,closed_at,hub_request_types(name)").order("created_at",{ascending:false}).limit(200);
    const list=data||[]; const now=new Date();
    const open=list.filter(r=>!["closed","cancelled"].includes(r.status)).length;
    const breach=list.filter(r=>r.sla_due_at&&new Date(r.sla_due_at)<now&&!["closed","cancelled","review"].includes(r.status)).length;
    const review=list.filter(r=>r.status==="review").length;
    const wkAgo=new Date(now-7*864e5);
    const doneWk=list.filter(r=>r.closed_at&&new Date(r.closed_at)>wkAgo).length;
    const closed=list.filter(r=>r.closed_at);
    const onSla=closed.length?Math.round(100*closed.filter(r=>!r.sla_due_at||new Date(r.closed_at)<=new Date(r.sla_due_at)).length/closed.length):100;
    setK({open,breach,review,doneWk,onSla}); setRows(list.slice(0,8));
  })(); },[]);
  return (<Shell title="Dashboard">
    <div className="kpis">
      <div className="kpi"><div className="n">{k.open}</div><div className="l">งานที่เปิดอยู่</div></div>
      <div className="kpi amber"><div className="n">{k.breach}</div><div className="l">เกิน SLA</div></div>
      <div className="kpi"><div className="n">{k.review}</div><div className="l">รอตรวจ (Review)</div></div>
      <div className="kpi green"><div className="n">{k.doneWk}</div><div className="l">เสร็จใน 7 วัน</div></div>
      <div className="kpi"><div className="n">{k.onSla}%</div><div className="l">ทำทัน SLA</div></div>
    </div>
    <div className="card"><h2>คำขอล่าสุด</h2>
      <table><thead><tr><th>Ticket</th><th>เรื่อง</th><th>ประเภท</th><th>สถานะ</th><th>ครบ SLA</th></tr></thead>
      <tbody>{rows.map(r=>(<tr key={r.id} onClick={()=>location.href="/requests/"+r.id} style={{cursor:"pointer"}}>
        <td className="mono">{r.ticket_no}</td><td>{r.title}</td><td>{r.hub_request_types?.name}</td>
        <td><StatusBadge s={r.status}/></td><td className="muted">{fmtDate(r.sla_due_at)}</td></tr>))}
        {!rows.length&&<tr><td colSpan="5" className="muted">ยังไม่มีคำขอ — เริ่มที่ + เปิดคำขอ</td></tr>}</tbody></table>
    </div>
  </Shell>);
}
