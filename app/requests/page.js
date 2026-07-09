"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { StatusBadge, fmtDate } from "../../components/util";

export default function Requests(){
  const [rows,setRows]=useState([]); const [f,setF]=useState("open");
  useEffect(()=>{ (async()=>{
    let q=supabase.from("hub_requests").select("id,ticket_no,title,status,priority,sla_due_at,created_at,hub_request_types(name),assignee:assignee_id(full_name)").order("created_at",{ascending:false}).limit(300);
    const { data }=await q; setRows(data||[]);
  })(); },[]);
  const shown=rows.filter(r=> f==="all"?true : f==="open"?!["closed","cancelled"].includes(r.status) : r.status===f);
  return (<Shell title="คำขอทั้งหมด">
    <div className="card">
      <div style={{marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}>
        {[["open","เปิดอยู่"],["all","ทั้งหมด"],["new","ใหม่"],["in_progress","กำลังทำ"],["waiting","รอข้อมูล"],["done","เสร็จ"],["closed","ปิด"]].map(([v,l])=>(
          <button key={v} className={"btn sm "+(f===v?"":"sec")} onClick={()=>setF(v)}>{l}</button>))}
      </div>
      <table><thead><tr><th>Ticket</th><th>เรื่อง</th><th>ประเภท</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th>ครบ SLA</th></tr></thead>
      <tbody>{shown.map(r=>(<tr key={r.id} onClick={()=>location.href="/requests/"+r.id} style={{cursor:"pointer"}}>
        <td className="mono">{r.ticket_no}</td><td>{r.title}</td><td>{r.hub_request_types?.name}</td>
        <td>{r.assignee?.full_name||<span className="muted">ยังไม่มอบหมาย</span>}</td>
        <td><StatusBadge s={r.status}/></td><td className="muted">{fmtDate(r.sla_due_at)}</td></tr>))}
        {!shown.length&&<tr><td colSpan="6" className="muted">ไม่มีรายการ</td></tr>}</tbody></table>
    </div>
  </Shell>);
}
