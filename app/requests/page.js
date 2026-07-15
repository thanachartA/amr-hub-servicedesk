"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { StatusBadge, fmtDate, downloadCSV } from "../../components/util";

const TH={new:"ใหม่",assigned:"มอบหมายแล้ว",in_progress:"กำลังทำ",waiting:"รอข้อมูล",review:"รอตรวจ",done:"เสร็จ",closed:"ปิด",cancelled:"ยกเลิก"};

const OPEN2=["new","assigned","in_progress","waiting","review"];
export default function Requests(){
  const [rows,setRows]=useState([]); const [f,setF]=useState("open"); const [uid,setUid]=useState(null);
  // มุมมองพิเศษจาก Dashboard (?view=mine / overdue / unassigned / review)
  const [view,setView]=useState(null);
  useEffect(()=>{
    const v=new URLSearchParams(window.location.search).get("view");
    if(v) setView(v);
  },[]);
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); setUid(sess?.session?.user?.id||null);
    let q=supabase.from("hub_requests").select("id,ticket_no,title,status,priority,sla_due_at,created_at,rework_count,assignee_id,hub_request_types(name),requester:requester_id(full_name),assignee:assignee_id(full_name)").order("created_at",{ascending:false}).limit(500);
    const { data }=await q; setRows(data||[]);
  })(); },[]);
  const now=new Date();
  const shown=rows.filter(r=>{
    if(view==="mine")       return r.assignee_id===uid && OPEN2.includes(r.status);
    if(view==="overdue")    return r.sla_due_at && new Date(r.sla_due_at)<now && !["review","closed","cancelled"].includes(r.status);
    if(view==="unassigned") return r.status==="new" && !r.assignee_id;
    if(view==="review")     return r.status==="review";
    return f==="all"?true : f==="open"?!["closed","cancelled"].includes(r.status) : r.status===f;
  });
  const viewLabel={mine:"งานที่มอบหมายให้ฉัน",overdue:"เกิน SLA",unassigned:"ยังไม่มอบหมาย",review:"รอตรวจ"}[view];
  function exportCSV(){
    downloadCSV("service-desk_"+new Date().toISOString().slice(0,10)+".csv",[
      {label:"Ticket",key:"ticket_no"},
      {label:"เรื่อง",key:"title"},
      {label:"ประเภท",get:r=>r.hub_request_types?.name||""},
      {label:"ผู้ขอ",get:r=>r.requester?.full_name||""},
      {label:"ผู้รับผิดชอบ",get:r=>r.assignee?.full_name||""},
      {label:"สถานะ",get:r=>TH[r.status]||r.status},
      {label:"ความเร่งด่วน",key:"priority"},
      {label:"ตีกลับ(ครั้ง)",get:r=>r.rework_count||0},
      {label:"วันที่สร้าง",get:r=>r.created_at?new Date(r.created_at).toLocaleString("th-TH"):""},
      {label:"ครบ SLA",get:r=>r.sla_due_at?new Date(r.sla_due_at).toLocaleString("th-TH"):""},
    ], shown);
  }
  return (<Shell title="คำขอทั้งหมด">
    <div className="card">
      {view&&<div style={{marginBottom:12,display:"flex",alignItems:"center",gap:10,background:"#EEF4FF",border:"1px solid #C7D9F7",borderRadius:8,padding:"8px 12px"}}>
        <b style={{color:"#2D6CDF",fontSize:13}}>🔎 กรอง: {viewLabel}</b>
        <span className="muted" style={{fontSize:12}}>{shown.length} รายการ</span>
        <button className="btn sm sec" style={{marginLeft:"auto"}} onClick={()=>setView(null)}>ล้างตัวกรอง</button>
      </div>}
      <div style={{marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",opacity:view?0.5:1}}>
        {[["open","เปิดอยู่"],["all","ทั้งหมด"],["new","ใหม่"],["in_progress","กำลังทำ"],["waiting","รอข้อมูล"],["review","รอตรวจ"],["closed","ปิด"]].map(([v,l])=>(
          <button key={v} className={"btn sm "+(f===v&&!view?"":"sec")} onClick={()=>{setView(null);setF(v);}}>{l}</button>))}
        <button className="btn sm sec" style={{marginLeft:"auto"}} onClick={exportCSV}>⬇ Export CSV ({shown.length})</button>
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
