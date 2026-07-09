"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { fmtMoney } from "../../components/util";

export default function Projects(){
  const [rows,setRows]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data:exp }=await supabase.from("hub_expense_entries").select("amount,approval_status,project_id,projects(code,name,budget_amount)");
    const map={};
    (exp||[]).forEach(x=>{ if(!x.project_id) return; const p=x.projects||{};
      if(!map[x.project_id]) map[x.project_id]={code:p.code,name:p.name,budget:Number(p.budget_amount)||0,actual:0,pending:0};
      map[x.project_id].actual+=Number(x.amount)||0;
      if(x.approval_status==="pending") map[x.project_id].pending+=Number(x.amount)||0;
    });
    setRows(Object.values(map).sort((a,b)=>b.actual-a.actual));
  })(); },[]);
  return (<Shell title="รายงานต้นทุนรายโครงการ">
    <div className="card"><h2>Budget vs Actual (จากค่าใช้จ่ายที่ Hub บันทึก)</h2>
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
