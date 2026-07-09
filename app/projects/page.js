"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { fmtMoney, downloadCSV } from "../../components/util";

const APV={pending:"รออนุมัติ",approved:"อนุมัติแล้ว",rejected:"ไม่อนุมัติ"};

export default function Projects(){
  const [rows,setRows]=useState([]); const [detail,setDetail]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data:exp }=await supabase.from("hub_expense_entries")
      .select("amount,approval_status,created_at,erp_ref,project_id,projects(code,name,budget_amount),hub_cost_codes(code,name),hub_requests(ticket_no,title)");
    setDetail(exp||[]);
    const map={};
    (exp||[]).forEach(x=>{ if(!x.project_id) return; const p=x.projects||{};
      if(!map[x.project_id]) map[x.project_id]={code:p.code,name:p.name,budget:Number(p.budget_amount)||0,actual:0,pending:0};
      map[x.project_id].actual+=Number(x.amount)||0;
      if(x.approval_status==="pending") map[x.project_id].pending+=Number(x.amount)||0;
    });
    setRows(Object.values(map).sort((a,b)=>b.actual-a.actual));
  })(); },[]);
  const day=new Date().toISOString().slice(0,10);
  function exportSummary(){
    downloadCSV("ต้นทุนรายโครงการ_สรุป_"+day+".csv",[
      {label:"โครงการ",get:r=>(r.code||"")+" · "+(r.name||"")},
      {label:"งบประมาณ",key:"budget"},{label:"ใช้จริง",key:"actual"},
      {label:"คงเหลือ",get:r=>r.budget-r.actual},
      {label:"% ใช้",get:r=>r.budget?Math.round(100*r.actual/r.budget):0},
      {label:"รออนุมัติ",key:"pending"},
    ], rows);
  }
  function exportDetail(){
    downloadCSV("ค่าใช้จ่าย_รายการ_"+day+".csv",[
      {label:"วันที่",get:r=>r.created_at?new Date(r.created_at).toLocaleString("th-TH"):""},
      {label:"Ticket",get:r=>r.hub_requests?.ticket_no||""},
      {label:"งาน",get:r=>r.hub_requests?.title||""},
      {label:"โครงการ",get:r=>r.projects?(r.projects.code+" · "+r.projects.name):""},
      {label:"Cost Code",get:r=>r.hub_cost_codes?(r.hub_cost_codes.code+" · "+r.hub_cost_codes.name):""},
      {label:"จำนวนเงิน",key:"amount"},
      {label:"สถานะอนุมัติ",get:r=>APV[r.approval_status]||r.approval_status},
      {label:"ERP Ref",key:"erp_ref"},
    ], detail);
  }
  return (<Shell title="รายงานต้นทุนรายโครงการ">
    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:8}}>
        <h2 style={{margin:0}}>Budget vs Actual (จากค่าใช้จ่ายที่ Hub บันทึก)</h2>
        <div style={{display:"flex",gap:8}}>
          <button className="btn sm sec" onClick={exportSummary}>⬇ สรุป (CSV)</button>
          <button className="btn sm sec" onClick={exportDetail}>⬇ รายการ ({detail.length})</button>
        </div>
      </div>
      <table><thead><tr><th>โครงการ</th><th className="right">งบ (Budget)</th><th className="right">ใช้จริง (Actual)</th><th className="right">คงเหลือ</th><th className="right">% ใช้</th><th className="right">รออนุมัติ</th></tr></thead>
      <tbody>{rows.map((r,i)=>{ const pct=r.budget?Math.round(100*r.actual/r.budget):0; const rem=r.budget-r.actual;
        return (<tr key={i}><td>{r.code} · {r.name}</td>
        <td className="right">{fmtMoney(r.budget)}</td><td className="right">{fmtMoney(r.actual)}</td>
        <td className="right" style={{color:rem<0?"#B03A2E":"inherit"}}>{fmtMoney(rem)}</td>
        <td className="right"><b style={{color:pct>100?"#B03A2E":pct>85?"#B26A00":"#2E7D5B"}}>{pct}%</b></td>
        <td className="right muted">{r.pending?fmtMoney(r.pending):"—"}</td></tr>); })}
        {!rows.length&&<tr><td colSpan="6" className="muted">ยังไม่มีค่าใช้จ่ายที่บันทึก — สร้างคำขอประเภทที่มีค่าใช้จ่าย แล้วระบุโครงการ</td></tr>}</tbody></table>
    </div>
  </Shell>);
}
