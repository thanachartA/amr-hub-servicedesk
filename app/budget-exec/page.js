"use client";
import { useEffect, useState, useMemo } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { TrendBars } from "../../components/charts";
import { fmtMoney, fetchAll } from "../../components/util";

const M_TH=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const shortM=p=>{ const m=/^\d{4}-(\d{2})$/.exec(p); return m?M_TH[Number(m[1])-1]:p; };
const bu=ref=>((String(ref||"").match(/[A-Za-z]+/)||["อื่นๆ"])[0]).toUpperCase();

export default function BudgetExec(){
  const [ok,setOk]=useState(null);
  const [pb,setPb]=useState([]); const [db,setDb]=useState([]); const [da,setDa]=useState([]);
  const [exp,setExp]=useState([]); const [tf,setTf]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const uid=sess?.session?.user?.id;
    const { data:t }=await supabase.from("hub_team").select("hub_role,profiles:user_id(id)");
    const lead=(t||[]).some(x=>x.profiles?.id===uid&&["owner","lead","supervisor"].includes(x.hub_role));
    setOk(lead); if(!lead) return;
    const [p,b,a,e,x]=await Promise.all([
      fetchAll("hub_project_budget_summary","ref_code,project_name,pm_name,budget,actual_all",q=>q.order("actual_all",{ascending:false})),
      fetchAll("hub_dept_budgets","department,dept_code,period,amount",q=>q.order("id",{ascending:true})),
      fetchAll("hub_dept_actuals","department,period,amount",q=>q.order("id",{ascending:true})),
      supabase.from("hub_expense_entries").select("amount,approval_status,expense_type,out_of_budget").then(r=>r.data||[]),
      supabase.from("hub_budget_transfers").select("amount,scope,status").then(r=>r.data||[]),
    ]);
    setPb(p||[]); setDb(b||[]); setDa(a||[]); setExp(e||[]); setTf(x||[]);
  })(); },[]);

  const proj=useMemo(()=>{
    const m={};
    pb.forEach(r=>{ const k=r.ref_code; if(!m[k]) m[k]={ref:k,name:r.project_name,pm:r.pm_name,budget:0,actual:0};
      m[k].budget+=Number(r.budget)||0; m[k].actual+=Number(r.actual_all)||0; });
    return Object.values(m).map(r=>({...r,bal:r.budget-r.actual}));
  },[pb]);
  const kpi=useMemo(()=>{
    const budget=proj.reduce((s,r)=>s+r.budget,0), actual=proj.reduce((s,r)=>s+r.actual,0);
    return { budget, actual, bal:budget-actual, pct:budget?Math.round(100*actual/budget):0,
      over:proj.filter(r=>r.bal<0).length, warn:proj.filter(r=>r.budget>0&&r.bal>=0&&r.actual/r.budget>0.85).length,
      n:proj.length };
  },[proj]);

  const buRows=useMemo(()=>{
    const m={}; proj.forEach(r=>{ const g=bu(r.ref); if(!m[g]) m[g]={g,budget:0,actual:0,over:0,n:0};
      m[g].budget+=r.budget; m[g].actual+=r.actual; m[g].n++; if(r.bal<0)m[g].over++; });
    return Object.values(m).sort((a,b)=>b.budget-a.budget);
  },[proj]);

  const burn=useMemo(()=>{
    const m={}; da.forEach(x=>{ if(!x.period) return; m[x.period]=(m[x.period]||0)+(Number(x.amount)||0); });
    return Object.keys(m).sort().map(p=>({label:shortM(p),short:shortM(p),value:Math.round(m[p])}));
  },[da]);

  const deptRows=useMemo(()=>{
    const m={};
    db.forEach(x=>{ const k=String(x.department||"").trim(); if(!k)return;
      if(!m[k])m[k]={dept:k,code:x.dept_code||"",budget:0,actual:0}; m[k].budget+=Number(x.amount)||0; if(x.dept_code)m[k].code=x.dept_code; });
    da.forEach(x=>{ const k=String(x.department||"").trim(); if(!k)return;
      if(!m[k])m[k]={dept:k,code:"",budget:0,actual:0}; m[k].actual+=Number(x.amount)||0; });
    return Object.values(m).map(r=>({...r,bal:r.budget-r.actual})).sort((a,b)=>b.actual-a.actual);
  },[db,da]);

  const gov=useMemo(()=>{
    const pend=exp.filter(e=>["pending_supervisor","pending_owner"].includes(e.approval_status));
    const ob=exp.filter(e=>e.out_of_budget && e.approval_status==="approved");
    return {
      pendVal:pend.reduce((s,e)=>s+(Number(e.amount)||0),0), pendCnt:pend.length,
      obVal:ob.reduce((s,e)=>s+(Number(e.amount)||0),0),
      capex:ob.filter(e=>e.expense_type==="capex").length, opex:ob.filter(e=>e.expense_type==="opex").length,
      tfVal:tf.filter(t=>t.status==="active").reduce((s,t)=>s+(Number(t.amount)||0),0), tfCnt:tf.filter(t=>t.status==="active").length,
    };
  },[exp,tf]);

  const topOver=useMemo(()=>proj.filter(r=>r.bal<0).sort((a,b)=>a.bal-b.bal).slice(0,10),[proj]);

  if(ok===null) return <Shell title="Dashboard งบประมาณ"><div className="muted">กำลังโหลด…</div></Shell>;
  if(ok===false) return <Shell title="Dashboard งบประมาณ"><div className="card"><div className="muted">🔒 หน้านี้เฉพาะหัวหน้าทีม / ผู้บริหาร</div></div></Shell>;

  const maxBU=Math.max(1,...buRows.map(r=>Math.max(r.budget,r.actual)));

  return (<Shell title="Dashboard งบประมาณ">
    <div className="hero">
      <div><h2>ภาพรวมงบประมาณบริษัท</h2>
        <div className="sub">งบโครงการจาก ERP + งบฝ่าย · สำหรับผู้บริหารตัดสินใจ</div></div>
      <div className="pill">ใช้ไป {kpi.pct}% ของงบ · เหลือ {fmtMoney(kpi.bal)}</div>
    </div>

    <div className="kpis" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
      <div className="kpi"><div className="n" style={{fontSize:18}}>{fmtMoney(kpi.budget)}</div><div className="l">งบโครงการรวม ({kpi.n})</div></div>
      <div className="kpi"><div className="n" style={{fontSize:18}}>{fmtMoney(kpi.actual)}</div><div className="l">ใช้จริง (ALL)</div></div>
      <div className="kpi green"><div className="n" style={{fontSize:18}}>{fmtMoney(kpi.bal)}</div><div className="l">คงเหลือ</div></div>
      <div className="kpi amber"><div className="n" style={{fontSize:18}}>{kpi.warn}</div><div className="l">ใกล้เต็มงบ (&gt;85%)</div></div>
      <div className="kpi red"><div className="n" style={{fontSize:18}}>{kpi.over}</div><div className="l">เกินงบแล้ว</div></div>
    </div>

    <div className="grid2">
      <div className="chartcard">
        <h3>📉 Burn Rate ใช้จริงฝ่าย (รายเดือน)</h3>
        {burn.length? <TrendBars data={burn}/> : <div className="muted" style={{fontSize:13}}>ยังไม่มีข้อมูลใช้จริงฝ่าย</div>}
        <div className="muted" style={{fontSize:11.5,marginTop:8}}>ผลรวมค่าใช้จ่ายจริงของทุกฝ่ายที่บันทึกจากบัญชี</div>
      </div>
      <div className="chartcard">
        <h3>🧭 การอนุมัติ & งบนอกแผน</h3>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{background:"#FFF8E6",border:"1px solid #EBD9AE",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:22,fontWeight:700,color:"#8A5A00"}}>{fmtMoney(gov.pendVal)}</div>
            <div className="muted" style={{fontSize:12}}>รออนุมัติค่าใช้จ่าย · {gov.pendCnt} รายการ</div>
          </div>
          <div style={{background:"#FDECEE",border:"1px solid #F3C9CE",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:22,fontWeight:700,color:"#B03A2E"}}>{fmtMoney(gov.obVal)}</div>
            <div className="muted" style={{fontSize:12}}>อนุมัติซื้อนอกงบแล้ว · Capex {gov.capex} / Opex {gov.opex}</div>
          </div>
          <div style={{background:"#EEF6FF",border:"1px solid #C7D9F7",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:22,fontWeight:700,color:"#2453A8"}}>{fmtMoney(gov.tfVal)}</div>
            <div className="muted" style={{fontSize:12}}>โยกงบ (Opex) · {gov.tfCnt} ครั้ง</div>
          </div>
          <div style={{background:"#F2F4F6",border:"1px solid var(--line)",borderRadius:10,padding:"12px 14px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
            <a href="/projects" style={{color:"#2453A8",fontSize:13,fontWeight:600}}>→ ดูต้นทุนรายโครงการ</a>
            <a href="/budget" style={{color:"#2453A8",fontSize:13,fontWeight:600,marginTop:4}}>→ ดูงบประมาณฝ่าย</a>
          </div>
        </div>
      </div>
    </div>

    <div className="chartcard" style={{marginBottom:18}}>
      <h3>🏢 งบ vs ใช้จริง ตาม Business Unit</h3>
      <table style={{fontSize:13}}><thead><tr>
        <th>BU</th><th className="right">โครงการ</th><th>สัดส่วน Budget / Actual</th>
        <th className="right">Budget</th><th className="right">ใช้จริง</th><th className="right">% ใช้</th><th className="right">เกินงบ</th>
      </tr></thead><tbody>
      {buRows.map(r=>{ const p=r.budget?Math.round(100*r.actual/r.budget):0;
        return (<tr key={r.g}>
          <td><b>{r.g}</b></td>
          <td className="right muted">{r.n}</td>
          <td style={{minWidth:180}}>
            <div style={{position:"relative",height:16,background:"#EEF1F3",borderRadius:8,overflow:"hidden"}}>
              <div style={{position:"absolute",left:0,top:0,bottom:0,background:"#DCE6F5",width:(100*r.budget/maxBU)+"%"}}/>
              <div style={{position:"absolute",left:0,top:0,bottom:0,background:p>100?"#EA0029":p>85?"#E8A200":"#1F9D57",width:(100*r.actual/maxBU)+"%"}}/>
            </div>
          </td>
          <td className="right">{fmtMoney(r.budget)}</td>
          <td className="right"><b>{fmtMoney(r.actual)}</b></td>
          <td className="right"><b style={{color:p>100?"#B03A2E":p>85?"#B26A00":"#2E7D5B"}}>{p}%</b></td>
          <td className="right" style={{color:r.over?"#B03A2E":"#98A4AE"}}>{r.over||"—"}</td>
        </tr>);
      })}
      </tbody></table>
    </div>

    <div className="grid2">
      <div className="chartcard">
        <h3>🚨 Top 10 โครงการเกินงบมากสุด</h3>
        <table style={{fontSize:12.5}}><thead><tr>
          <th>โครงการ</th><th className="right">เกินงบ</th><th className="right">% ใช้</th>
        </tr></thead><tbody>
        {topOver.map(r=>{ const p=r.budget?Math.round(100*r.actual/r.budget):0;
          return (<tr key={r.ref}>
            <td><b className="mono" style={{fontSize:11.5}}>{r.ref}</b>
              <div className="muted" style={{fontSize:11,maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</div></td>
            <td className="right" style={{color:"#B03A2E",fontWeight:700}}>{fmtMoney(r.bal)}</td>
            <td className="right"><b style={{color:"#B03A2E"}}>{p}%</b></td>
          </tr>);
        })}
        {!topOver.length&&<tr><td colSpan="3" className="muted">ไม่มีโครงการเกินงบ 🎉</td></tr>}
        </tbody></table>
      </div>
      <div className="chartcard">
        <h3>🏬 งบประมาณฝ่าย — งบ vs ใช้จริง</h3>
        {deptRows.length? <table style={{fontSize:12.5}}><thead><tr>
          <th>ฝ่าย</th><th className="right">งบ</th><th className="right">ใช้จริง</th><th className="right">คงเหลือ</th>
        </tr></thead><tbody>
        {deptRows.slice(0,12).map(r=>(<tr key={r.dept}>
          <td>{r.code?<span className="muted mono" style={{fontSize:11}}>{r.code} · </span>:""}{r.dept}</td>
          <td className="right">{r.budget?fmtMoney(r.budget):"—"}</td>
          <td className="right"><b>{fmtMoney(r.actual)}</b></td>
          <td className="right" style={{color:r.bal<0?"#B03A2E":"inherit"}}>{r.budget?fmtMoney(r.bal):"—"}</td>
        </tr>))}
        </tbody></table> : <div className="muted" style={{fontSize:13}}>ยังไม่มีงบฝ่าย — อัปโหลดที่หน้า "งบประมาณฝ่าย"</div>}
      </div>
    </div>

    <p className="muted" style={{fontSize:11.5}}>ตัวเลขโครงการมาจาก ERP Budget Report (snapshot) · งบฝ่ายมาจากไฟล์ที่อัปโหลด · อัปเดตเมื่อมีการนำเข้าข้อมูลใหม่</p>
  </Shell>);
}
