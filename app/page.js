"use client";
import { useEffect, useState } from "react";
import Shell from "../components/Shell";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge, fmtDate } from "../components/util";
import { Donut, BarsH, TrendBars, STATUS_COLOR, STATUS_TH } from "../components/charts";

const OPEN=["new","assigned","in_progress","waiting","review"];
const dayKey=d=>new Date(d).toISOString().slice(0,10);

export default function Dashboard(){
  const [list,setList]=useState([]); const [my,setMy]=useState(null);
  useEffect(()=>{ (async()=>{
    const [{ data }, { data:d2 }]=await Promise.all([
      supabase.from("hub_requests").select("id,ticket_no,title,status,priority,sla_due_at,created_at,closed_at,csat_rating,assignee_id,hub_request_types(name),assignee:assignee_id(full_name)").order("created_at",{ascending:false}).limit(1000),
      supabase.rpc("hub_my_dashboard"),
    ]);
    setList(data||[]); setMy(d2||null);
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
  const palette=["#EA0029","#2453A8","#0FA3B1","#E8A200","#6B4EF0","#1F9D57"];
  const topTypes=Object.entries(tc).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([label,value],i)=>({label,value,color:palette[i%6]}));
  const wl={}; list.filter(r=>OPEN.includes(r.status)&&r.assignee_id).forEach(r=>{ const n=r.assignee?.full_name||"—"; wl[n]=(wl[n]||0)+1; });
  const workload=Object.entries(wl).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([label,value])=>({label,value,color:value>6?"#E5602A":"#0FA3B1"}));

  const stats=[
    {n:open,l:"งานที่เปิดอยู่",ic:"📋",c:"#EA0029",bg:"#FDE7EC"},
    {n:breach,l:"เกิน SLA",ic:"⏰",c:"#E5602A",bg:"#FCEAE1"},
    {n:review,l:"รอตรวจ",ic:"🔎",c:"#6B4EF0",bg:"#ECEAFB"},
    {n:closed7,l:"เสร็จใน 7 วัน",ic:"✅",c:"#1F9D57",bg:"#E3F4EA"},
    {n:slaPct+"%",l:"ทำทัน SLA",ic:"🎯",c:"#052460",bg:"#E4EAF5"},
    {n:csat==null?"—":csat.toFixed(1),l:"CSAT เฉลี่ย (เต็ม 5)",ic:"⭐",c:"#C77700",bg:"#FFF3DE"},
  ];
  // การ์ด "งานของฉัน" — actionable คลิกไปหน้าที่กรองแล้ว
  const myCards = my ? [
    { n:my.assigned_to_me, l:"งานที่ต้องทำ", ic:"🎯", c:"#E81828", bg:"#FDECEE", link:"/requests?view=mine", show:true },
    { n:my.awaiting_review, l:"รอฉันตรวจ", ic:"🔎", c:"#7A5AF8", bg:"#EEEAFB", link:"/requests?view=review", show:["owner","supervisor","lead"].includes(my.role) },
    { n:my.overdue, l:"เกิน SLA", ic:"⏰", c:"#E85D2A", bg:"#FCEAE1", link:"/requests?view=overdue", show:true },
    { n:my.unassigned, l:"ยังไม่มอบหมาย", ic:"📥", c:"#B26A00", bg:"#FFF4E0", link:"/requests?view=unassigned", show:["owner","supervisor","lead"].includes(my.role) },
    { n:my.pending_expense, l:"รอฉันอนุมัติเงิน", ic:"💰", c:"#2E7D5B", bg:"#E4F3EA", link:"/requests?view=review", show:["owner","supervisor"].includes(my.role) },
  ].filter(c=>c.show) : [];

  return (<Shell title="Dashboard">
    <div className="hero">
      <div><h2>ภาพรวมระบบ Service Desk</h2><div className="sub">Central Admin Hub · AMR Asia — {now.toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div></div>
      <div className="pill">{total} คำขอสะสม</div>
    </div>

    {my&&myCards.length>0&&(<div style={{marginBottom:18}}>
      <div style={{fontSize:13,fontWeight:700,color:"#5A6672",margin:"0 0 8px 2px"}}>⚡ สิ่งที่รอคุณอยู่</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
        {myCards.map((c,i)=>(<a key={i} href={c.link} style={{textDecoration:"none",display:"block",
          background:"#fff",border:"1px solid #E4E7EB",borderLeft:"4px solid "+c.c,borderRadius:10,padding:"12px 14px",
          transition:"box-shadow .15s"}}
          onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 14px rgba(0,0,0,.08)"}
          onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,background:c.bg}}>{c.ic}</span>
            <div style={{fontSize:28,fontWeight:800,color:c.n>0?c.c:"#B4BBC2",lineHeight:1}}>{c.n}</div>
          </div>
          <div style={{fontSize:12.5,color:"#5A6672",marginTop:8}}>{c.l} <span style={{color:c.c}}>→</span></div>
        </a>))}
      </div>
    </div>)}
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
