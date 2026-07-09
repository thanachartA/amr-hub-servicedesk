"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { fmtMoney, downloadCSV } from "../../components/util";

const APV={pending:"รออนุมัติ",approved:"อนุมัติแล้ว",rejected:"ไม่อนุมัติ",not_required:"ไม่ต้องอนุมัติ"};
function ym(d){ return d.toISOString().slice(0,7); }

export default function Reports(){
  const [month,setMonth]=useState(ym(new Date()));
  const [reqs,setReqs]=useState([]); const [exp,setExp]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data:r }=await supabase.from("hub_requests").select("id,ticket_no,title,status,priority,created_at,closed_at,hub_request_types(name),requester:requester_id(full_name),assignee:assignee_id(full_name)").limit(3000);
    setReqs(r||[]);
    const { data:e }=await supabase.from("hub_expense_entries").select("amount,approval_status,created_at,erp_ref,projects(code,name),hub_cost_codes(code,name),hub_requests(ticket_no,title)").limit(3000);
    setExp(e||[]);
  })(); },[]);
  const [y,m]=month.split("-").map(Number);
  const start=new Date(y,m-1,1), end=new Date(y,m,1);
  const inM=(d)=> d && new Date(d)>=start && new Date(d)<end;
  const opened=reqs.filter(r=>inM(r.created_at));
  const closed=reqs.filter(r=>inM(r.closed_at));
  const expM=exp.filter(x=>inM(x.created_at));
  const byType={}; closed.forEach(r=>{ const n=r.hub_request_types?.name||"อื่นๆ"; byType[n]=(byType[n]||0)+1; });
  const totalExp=expM.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const pendingExp=expM.filter(x=>x.approval_status==="pending").reduce((s,x)=>s+(Number(x.amount)||0),0);
  const byProj={}; expM.forEach(x=>{ const k=x.projects?(x.projects.code+" · "+x.projects.name):"(ไม่ระบุโครงการ)"; byProj[k]=(byProj[k]||0)+(Number(x.amount)||0); });
  const byCC={}; expM.forEach(x=>{ const k=x.hub_cost_codes?(x.hub_cost_codes.code+" · "+x.hub_cost_codes.name):"(ไม่ระบุ)"; byCC[k]=(byCC[k]||0)+(Number(x.amount)||0); });

  function exportTickets(){
    downloadCSV("ปิดเดือน_tickets_"+month+".csv",[
      {label:"Ticket",key:"ticket_no"},{label:"เรื่อง",key:"title"},
      {label:"ประเภท",get:r=>r.hub_request_types?.name||""},
      {label:"ผู้ขอ",get:r=>r.requester?.full_name||""},
      {label:"ผู้รับผิดชอบ",get:r=>r.assignee?.full_name||""},
      {label:"เปิดเมื่อ",get:r=>r.created_at?new Date(r.created_at).toLocaleString("th-TH"):""},
      {label:"ปิดเมื่อ",get:r=>r.closed_at?new Date(r.closed_at).toLocaleString("th-TH"):""},
    ], closed);
  }
  function exportExpenses(){
    downloadCSV("ปิดเดือน_ค่าใช้จ่าย_"+month+".csv",[
      {label:"วันที่",get:x=>x.created_at?new Date(x.created_at).toLocaleString("th-TH"):""},
      {label:"Ticket",get:x=>x.hub_requests?.ticket_no||""},
      {label:"งาน",get:x=>x.hub_requests?.title||""},
      {label:"โครงการ",get:x=>x.projects?(x.projects.code+" · "+x.projects.name):""},
      {label:"Cost Code",get:x=>x.hub_cost_codes?(x.hub_cost_codes.code+" · "+x.hub_cost_codes.name):""},
      {label:"จำนวนเงิน",key:"amount"},
      {label:"สถานะอนุมัติ",get:x=>APV[x.approval_status]||x.approval_status},
      {label:"ERP Ref",key:"erp_ref"},
    ], expM);
  }
  return (<Shell title="รายงานปิดเดือน">
    <div style={{display:"flex",alignItems:"center",marginBottom:12,gap:10}}>
      <label style={{fontSize:13,fontWeight:600,color:"#5A6672"}}>เดือน</label>
      <input type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{width:"auto"}}/>
    </div>
    <div className="kpis">
      <div className="kpi"><div className="n">{opened.length}</div><div className="l">คำขอเปิดใหม่</div></div>
      <div className="kpi green"><div className="n">{closed.length}</div><div className="l">ปิดงาน</div></div>
      <div className="kpi"><div className="n">{fmtMoney(totalExp)}</div><div className="l">ค่าใช้จ่ายรวม (บาท)</div></div>
      <div className="kpi amber"><div className="n">{fmtMoney(pendingExp)}</div><div className="l">รออนุมัติ (บาท)</div></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
      <div className="card"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{margin:0}}>งานปิดตามประเภท</h2><button className="btn sm sec" onClick={exportTickets}>⬇ Tickets</button></div>
        <table><thead><tr><th>ประเภทงาน</th><th className="right">จำนวน</th></tr></thead>
        <tbody>{Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(<tr key={k}><td>{k}</td><td className="right">{v}</td></tr>))}
          {!closed.length&&<tr><td colSpan="2" className="muted">ไม่มีงานปิดในเดือนนี้</td></tr>}</tbody></table></div>
      <div className="card"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{margin:0}}>ค่าใช้จ่ายตามโครงการ</h2><button className="btn sm sec" onClick={exportExpenses}>⬇ ค่าใช้จ่าย</button></div>
        <table><thead><tr><th>โครงการ</th><th className="right">จำนวนเงิน</th></tr></thead>
        <tbody>{Object.entries(byProj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(<tr key={k}><td>{k}</td><td className="right">{fmtMoney(v)}</td></tr>))}
          {!expM.length&&<tr><td colSpan="2" className="muted">ไม่มีค่าใช้จ่ายในเดือนนี้</td></tr>}</tbody></table></div>
    </div>
    <div className="card"><h2>ค่าใช้จ่ายตาม Cost Code</h2>
      <table><thead><tr><th>Cost Code</th><th className="right">จำนวนเงิน</th></tr></thead>
      <tbody>{Object.entries(byCC).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(<tr key={k}><td>{k}</td><td className="right">{fmtMoney(v)}</td></tr>))}
        {!expM.length&&<tr><td colSpan="2" className="muted">—</td></tr>}</tbody></table>
      <div className="muted" style={{fontSize:12,marginTop:8}}>ตัวเลขนับตามวันที่บันทึกในระบบ (เดือนที่เลือก) · ใช้ประกอบการลงบัญชี — ควรกระทบยอดกับ ERP อีกครั้ง</div>
    </div>
  </Shell>);
}
