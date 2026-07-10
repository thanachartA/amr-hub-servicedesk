"use client";
import { useEffect, useState } from "react";
import Shell from "../components/Shell";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge, fmtDate } from "../components/util";
import { Donut, BarsH, TrendBars, STATUS_COLOR, STATUS_TH } from "../components/charts";

const OPEN=["new","assigned","in_progress","waiting","review"];
const dayKey=d=>new Date(d).toISOString().slice(0,10);

export default function Dashboard(){
  const [list,setList]=useState([]);
  useEffect(()=>{ (async()=>{
    const { data }=await supabase.from("hub_requests").select("id,ticket_no,title,status,priority,sla_due_at,created_at,closed_at,csat_rating,assignee_id,hub_request_types(name),assignee:assignee_id(full_name)").order("created_at",{ascending:false}).limit(1000);
    setList(data||[]);
  })(); },[]);
  const now=new Date();
  const total=list.length;
  const open=list.filter(r=>OPEN.includes(r.status)).length;
  const breach=list.filter(r=>r.sla_due_at&&new Date(r.sla_due_at)<now&&!["review","closed","cancelled"].includes(r.status)).length;
  const review=list.filter(r=>r.status==="review").length;
  const wk=new Date(now-7*864e5);
  const closed7=list.filter(r=>r.closed_at&&new Date(r.closed_at)>wk).length;
  const closedAll=list.filter(r=>r.closed_at);
  const slaPct=closedAll.length?Math.round(100*closedAll.filter(r=>!r.sla_due_at||new Date(r.closed_at)<=new Date(r.sla_due_at)).length/closedAll.length):100;
  const rated=list.filter(r=>r.csat_rating); const csat=rated.length?(rated.reduce((s,r)=>s+r.csat_rating,0)/rated.length):null;

  const sc={}; list.forEach(r=>sc[r.status]=(sc[r.status]||0)+1);
  const donut=Object.keys(sc).map(s=>({key:s,label:STATUS_TH[s]||s,value:sc[s],color:STATUS_COLOR[s]||"#98A4AE"})).sort((a,b)=>b.value-a.value);
  const days=[]; for(let i=13;i>=0;i--){ const d=new Date(now-i*864e5); days.push({k:dayKey(d),short:String(d.getDate())}); }
  const cc={}; list.forEach(r=>{ if(r.created_at){const k=dayKey(r.created_at); cc[k]=(cc[k]||0)+1;} });
  const trend=days.map(d=>({label:d.k,short:d.short,value:cc[d.k]||0}));
  const tc={}; list.forEach(r=>{ const n=r.hub_request_types?.name||"อื่นๆ"; tc[n]=(tc[n]||0)+1; });
  const palette=["#E81828","#2D6CDF","#0E9AA6","#F5A623","#7A5AF8","#23A55A"];
  const topTypes=Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value],i)=>({label,value,color:palette[i%6]}));
  const wl={}; list.filter(r=>OPEN.includes(r.status)&&r.assignee_id).forEach(r=>{ const n=r.assignee?.full_name||"—"; wl[n]=(wl[n]||0)+1; });
  const workload=Object.entries(wl).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,value])=>({label,value,color:value>6?"#E85D2A":"#0E9AA6"}));

  const stats=[
    {n:open,l:"งานที่เปิดอยู่",ic:"📋",c:"#E81828",bg:"#FDECEE"},
    {n:breach,l:"เกิน SLA",ic:"⏰",c:"#E85D2A",bg:"#FCEAE1"},
    {n:review,l:"รอตรวจ",ic:"🔎",c:"#7A5AF8",bg:"#EEEAFB"},
    {n:closed7,l:"เสร็จใน 7 วัน",ic:"✅",c:"#23A55A",bg:"#E4F3EA"},
    {n:slaPct+"%",l:"ทำทัน SLA",ic:"🎯",c:"#2D6CDF",bg:"#E7EEF7"},
    {n:csat==null?"—":csat.toFixed(1),l:"CSAT เฉลี่ย (เต็ม 5)",ic:"⭐",c:"#B26A00",bg:"#FFF4E0"},
  ];
  return (<Shell title="Dashboard">
    <div className="hero">
      <div><h2>ภาพรวมระบบ Service Desk</h2><div className="sub">Central Admin Hub · AMR Asia — {now.toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div></div>
      <div className="pill">{total} คำขอสะสม</div>
    </div>
    <div className="stats">
      {stats.map((s,i)=>(<div className="stat" key={i}>
        <div className="bar" style={{background:s.c}}/>
        <div className="ico" style={{background:s.bg,color:s.c}}>{s.ic}</div>
        <div className="n" style={{color:s.c}}>{s.n}</div>
        <div className="l">{s.l}</div>
      </div>))}
    </div>
    <div className="grid2">
      <div className="chartcard"><h3>สัดส่วนตามสถานะ</h3>
        <div style={{display:"flex",alignItems:"center",gap:18}}>
          <Donut data={donut}/>
          <div className="legend" style={{flex:1}}>
            {donut.length? donut.map(d=>(<div className="row" key={d.key}><span><span className="dot" style={{background:d.color}}/>{d.label}</span><b>{d.value}</b></div>)) : <div className="muted">ยังไม่มีคำขอ</div>}
          </div>
        </div>
      </div>
      <div className="chartcard"><h3>คำขอเข้าใหม่ 14 วันล่าสุด</h3>
        <TrendBars data={trend}/>
        <div className="muted" style={{fontSize:11,marginTop:8}}>รวม {trend.reduce((s,d)=>s+d.value,0)} คำขอใน 14 วัน</div>
      </div>
    </div>
    <div className="grid2">
      <div className="chartcard"><h3>ประเภทงานยอดนิยม</h3><BarsH data={topTypes}/></div>
      <div className="chartcard"><h3>โหลดงานค้าง รายคน</h3><BarsH data={workload} unit=" งาน"/></div>
    </div>
    <div className="card"><h2>คำขอล่าสุด</h2>
      <table><thead><tr><th>Ticket</th><th>เรื่อง</th><th>ประเภท</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th>ครบ SLA</th></tr></thead>
      <tbody>{list.slice(0,8).map(r=>(<tr key={r.id} onClick={()=>location.href="/requests/"+r.id} style={{cursor:"pointer"}}>
        <td className="mono">{r.ticket_no}</td><td>{r.title}</td><td>{r.hub_request_types?.name}</td>
        <td>{r.assignee?.full_name||<span className="muted">—</span>}</td>
        <td><StatusBadge s={r.status}/></td><td className="muted">{fmtDate(r.sla_due_at)}</td></tr>))}
        {!list.length&&<tr><td colSpan="6" className="muted">ยังไม่มีคำขอ — เริ่มที่ + เปิดคำขอ</td></tr>}</tbody></table>
    </div>
  </Shell>);
}
