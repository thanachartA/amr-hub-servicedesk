"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { Donut, BarsH, TrendBars, Ring, STATUS_COLOR, STATUS_TH } from "../../components/charts";
import { fmtMoney } from "../../components/util";

const OPEN=["new","assigned","in_progress","waiting","review"];
function hrs(a,b){ if(!a||!b) return null; return (new Date(b)-new Date(a))/3600000; }
function durTxt(h){ if(h==null) return "—"; return h<48?h.toFixed(1)+" ชม.":(h/24).toFixed(1)+" วัน"; }

export default function Executive(){
  const [ok,setOk]=useState(null); const [list,setList]=useState([]); const [exp,setExp]=useState([]); const [team,setTeam]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const uid=sess?.session?.user?.id;
    const { data:t }=await supabase.from("hub_team").select("hub_role,profiles:user_id(id,full_name)"); setTeam(t||[]);
    const lead=(t||[]).some(x=>x.profiles?.id===uid&&["owner","lead","supervisor"].includes(x.hub_role)); setOk(lead);
    if(!lead) return;
    const { data:r }=await supabase.from("hub_requests").select("id,status,created_at,closed_at,assigned_at,sla_due_at,csat_rating,rework_count,assignee_id,hub_request_types(name),assignee:assignee_id(full_name)").limit(3000);
    setList(r||[]);
    const { data:e }=await supabase.from("hub_expense_entries").select("amount,approval_status,projects(code,name)").limit(3000);
    setExp(e||[]);
  })(); },[]);
  if(ok===null) return <Shell title="รายงานผู้บริหาร"><div className="muted">กำลังโหลด…</div></Shell>;
  if(ok===false) return <Shell title="รายงานผู้บริหาร"><div className="card"><div className="muted">🔒 หน้านี้เฉพาะหัวหน้าทีม/ผู้บริหาร (Lead)</div></div></Shell>;

  const now=new Date();
  const total=list.length; const openN=list.filter(r=>OPEN.includes(r.status)).length;
  const closedAll=list.filter(r=>r.closed_at);
  const slaPct=closedAll.length?Math.round(100*closedAll.filter(r=>!r.sla_due_at||new Date(r.closed_at)<=new Date(r.sla_due_at)).length/closedAll.length):100;
  const rated=list.filter(r=>r.csat_rating); const csat=rated.length?(rated.reduce((s,r)=>s+r.csat_rating,0)/rated.length):null;
  const turns=closedAll.map(r=>hrs(r.assigned_at||r.created_at,r.closed_at)).filter(v=>v!=null);
  const avgTurn=turns.length?turns.reduce((a,b)=>a+b,0)/turns.length:null;

  const months=[]; for(let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({y:d.getFullYear(),m:d.getMonth(),short:d.toLocaleDateString("th-TH",{month:"short"})}); }
  const trend=months.map(mo=>({label:mo.short,short:mo.short,value:list.filter(r=>{const d=r.created_at&&new Date(r.created_at);return d&&d.getFullYear()===mo.y&&d.getMonth()===mo.m;}).length}));

  const sc={}; list.forEach(r=>sc[r.status]=(sc[r.status]||0)+1);
  const donut=Object.keys(sc).map(s=>({key:s,label:STATUS_TH[s]||s,value:sc[s],color:STATUS_COLOR[s]||"#98A4AE"})).sort((a,b)=>b.value-a.value);
  const tc={}; list.forEach(r=>{const n=r.hub_request_types?.name||"อื่นๆ";tc[n]=(tc[n]||0)+1;});
  const palette=["#E81828","#2D6CDF","#0E9AA6","#F5A623","#7A5AF8","#23A55A"];
  const topTypes=Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value],i)=>({label,value,color:palette[i%6]}));

  const totalCost=exp.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const pendCost=exp.filter(x=>x.approval_status==="pending").reduce((s,x)=>s+(Number(x.amount)||0),0);
  const byProj={}; exp.forEach(x=>{const k=x.projects?(x.projects.code+" · "+x.projects.name):"(ไม่ระบุ)";byProj[k]=(byProj[k]||0)+(Number(x.amount)||0);});
  const costBars=Object.entries(byProj).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value],i)=>({label,value:Math.round(value),color:palette[i%6]}));

  const pm={}; team.forEach(m=>{const id=m.profiles?.id; if(id) pm[id]={name:m.profiles.full_name,role:m.hub_role,closed:0,tSum:0,tN:0,sla:0,slaN:0,cs:0,csN:0};});
  list.forEach(r=>{const id=r.assignee_id; if(!id||!pm[id])return; if(r.status==="closed"){const p=pm[id];p.closed++;const d=hrs(r.assigned_at||r.created_at,r.closed_at);if(d!=null){p.tSum+=d;p.tN++;}if(r.sla_due_at){p.slaN++;if(new Date(r.closed_at)<=new Date(r.sla_due_at))p.sla++;}if(r.csat_rating){p.cs+=r.csat_rating;p.csN++;}}});
  const people=Object.values(pm).sort((a,b)=>b.closed-a.closed);

  const kpis=[
    {n:total,l:"คำขอสะสมทั้งหมด",c:"#E81828"},
    {n:openN,l:"กำลังดำเนินการ",c:"#F5A623"},
    {n:closedAll.length,l:"ปิดงานสะสม",c:"#23A55A"},
    {n:durTxt(avgTurn),l:"Turnaround เฉลี่ย",c:"#2D6CDF"},
  ];
  return (<Shell title="รายงานผู้บริหาร (Executive)">
    <div className="hero">
      <div><h2>Executive Summary — Central Admin Hub</h2><div className="sub">AMR Asia · Service Desk — ณ {now.toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"})}</div></div>
      <button className="btn dark no-print" onClick={()=>window.print()}>🖨 พิมพ์ / บันทึก PDF</button>
    </div>
    <div className="stats">
      {kpis.map((k,i)=>(<div className="stat" key={i}><div className="bar" style={{background:k.c}}/><div className="n" style={{color:k.c}}>{k.n}</div><div className="l">{k.l}</div></div>))}
    </div>
    <div className="grid3">
      <div className="chartcard" style={{textAlign:"center"}}><h3>ระดับการทำทัน SLA</h3><Ring value={slaPct} label="ปิดงานทันกำหนด" color={slaPct>=90?"#23A55A":slaPct>=75?"#F5A623":"#E81828"}/></div>
      <div className="chartcard" style={{textAlign:"center"}}><h3>ความพึงพอใจ (CSAT)</h3><Ring value={csat==null?0:csat} max={5} suffix="" label={csat==null?"ยังไม่มีคะแนน":"เฉลี่ยจากผู้ใช้ (เต็ม 5)"} color="#B26A00"/></div>
      <div className="chartcard"><h3>งบประมาณ/ค่าใช้จ่าย</h3>
        <div style={{fontSize:24,fontWeight:800,color:"#202028"}}>{fmtMoney(totalCost)} <span style={{fontSize:13,color:"#7A828C"}}>บาท</span></div>
        <div className="muted" style={{marginTop:6}}>รออนุมัติ: <b style={{color:"#B26A00"}}>{fmtMoney(pendCost)}</b> บาท</div>
        <div className="muted" style={{fontSize:11,marginTop:8}}>รวมค่าใช้จ่ายที่ Hub บันทึกทั้งหมด</div>
      </div>
    </div>
    <div className="grid2">
      <div className="chartcard"><h3>ปริมาณคำขอ 6 เดือนล่าสุด</h3><TrendBars data={trend} height={120}/></div>
      <div className="chartcard"><h3>สัดส่วนตามสถานะ</h3>
        <div style={{display:"flex",alignItems:"center",gap:18}}><Donut data={donut}/>
          <div className="legend" style={{flex:1}}>{donut.length?donut.map(d=>(<div className="row" key={d.key}><span><span className="dot" style={{background:d.color}}/>{d.label}</span><b>{d.value}</b></div>)):<div className="muted">—</div>}</div>
        </div>
      </div>
    </div>
    <div className="grid2">
      <div className="chartcard"><h3>ประเภทงานยอดนิยม</h3><BarsH data={topTypes}/></div>
      <div className="chartcard"><h3>ค่าใช้จ่ายตามโครงการ (Top 6)</h3><BarsH data={costBars} unit=" ฿"/></div>
    </div>
    <div className="card"><h2>ผลงานทีม Hub</h2>
      <table><thead><tr><th>สมาชิก</th><th className="right">ปิดงาน</th><th className="right">Turnaround</th><th className="right">%ทัน SLA</th><th className="right">CSAT</th></tr></thead>
      <tbody>{people.map((p,i)=>{const turn=p.tN?p.tSum/p.tN:null;const sla=p.slaN?Math.round(100*p.sla/p.slaN):null;const cs=p.csN?(p.cs/p.csN):null;
        return (<tr key={i}><td><b>{p.name}</b>{p.role==="lead"&&<span className="tag" style={{marginLeft:6}}>Lead</span>}</td>
        <td className="right">{p.closed}</td><td className="right">{durTxt(turn)}</td>
        <td className="right">{sla==null?"—":<b style={{color:sla>=90?"#23A55A":sla>=75?"#B26A00":"#E81828"}}>{sla}%</b>}</td>
        <td className="right">{cs==null?"—":cs.toFixed(2)}</td></tr>);})}
        {!people.length&&<tr><td colSpan="5" className="muted">ยังไม่มีข้อมูล</td></tr>}</tbody></table>
    </div>
  </Shell>);
}
