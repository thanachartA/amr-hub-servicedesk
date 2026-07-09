"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { downloadCSV } from "../../components/util";

const OPEN=["new","assigned","in_progress","waiting","review"];
function hrs(a,b){ if(!a||!b) return null; return (new Date(b)-new Date(a))/3600000; }
function fmtDur(h){ if(h==null) return "—"; if(h<48) return h.toFixed(1)+" ชม."; return (h/24).toFixed(1)+" วัน"; }

export default function Performance(){
  const [ok,setOk]=useState(null); const [rows,setRows]=useState([]); const [team,setTeam]=useState([]); const [period,setPeriod]=useState("90");
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const uid=sess?.session?.user?.id;
    const { data:t }=await supabase.from("hub_team").select("hub_role,profiles:user_id(id,full_name)");
    setTeam(t||[]);
    const lead=(t||[]).some(x=>x.profiles?.id===uid && x.hub_role==="lead");
    setOk(lead);
    if(!lead) return;
    const { data }=await supabase.from("hub_requests").select("id,status,priority,created_at,assigned_at,started_at,done_at,closed_at,sla_due_at,rework_count,assignee_id,assignee:assignee_id(full_name)").limit(2000);
    setRows(data||[]);
  })(); },[]);
  if(ok===null) return <Shell title="Performance"><div className="muted">กำลังโหลด…</div></Shell>;
  if(ok===false) return <Shell title="Performance"><div className="card"><div className="muted">🔒 หน้านี้เฉพาะหัวหน้าทีม (Lead) เท่านั้น — เป็นข้อมูลผลงานรายบุคคล (PDPA)</div></div></Shell>;

  const now=new Date(); const cut = period==="all"? null : new Date(now - Number(period)*864e5);
  const inP = r => !cut || (r.closed_at && new Date(r.closed_at)>=cut);
  const map={};
  team.forEach(m=>{ const id=m.profiles?.id; if(id) map[id]={id,name:m.profiles.full_name,role:m.hub_role,assigned:0,closed:0,open:0,tSum:0,tN:0,onSla:0,slaN:0,rework:0}; });
  rows.forEach(r=>{ const id=r.assignee_id; if(!id) return; if(!map[id]) map[id]={id,name:r.assignee?.full_name||"—",role:"",assigned:0,closed:0,open:0,tSum:0,tN:0,onSla:0,slaN:0,rework:0};
    const m=map[id];
    if(OPEN.includes(r.status)) m.open++;
    if(r.status==="closed" && inP(r)){
      m.closed++;
      const d=hrs(r.assigned_at||r.created_at, r.closed_at); if(d!=null){ m.tSum+=d; m.tN++; }
      if(r.sla_due_at){ m.slaN++; if(new Date(r.closed_at)<=new Date(r.sla_due_at)) m.onSla++; }
      if((r.rework_count||0)>0) m.rework++;
    }
    if(inP(r)||OPEN.includes(r.status)) m.assigned++;
  });
  const people=Object.values(map).sort((a,b)=>b.closed-a.closed||b.open-a.open);
  const T={closed:0,tSum:0,tN:0,onSla:0,slaN:0,rework:0,open:0};
  people.forEach(p=>{ T.closed+=p.closed;T.tSum+=p.tSum;T.tN+=p.tN;T.onSla+=p.onSla;T.slaN+=p.slaN;T.rework+=p.rework;T.open+=p.open; });
  const teamTurn=T.tN?T.tSum/T.tN:null; const teamSla=T.slaN?Math.round(100*T.onSla/T.slaN):100; const teamRw=T.closed?Math.round(100*T.rework/T.closed):0;
  const maxOpen=Math.max(1,...people.map(p=>p.open));

  function exportCSV(){
    downloadCSV("performance_"+period+"d_"+new Date().toISOString().slice(0,10)+".csv",[
      {label:"สมาชิก",key:"name"},{label:"บทบาท",get:p=>p.role||"agent"},
      {label:"ปิดงาน",key:"closed"},{label:"งานค้าง",key:"open"},
      {label:"Turnaround(ชม.)",get:p=>p.tN?(p.tSum/p.tN).toFixed(1):""},
      {label:"%ทัน SLA",get:p=>p.slaN?Math.round(100*p.onSla/p.slaN):""},
      {label:"งานถูกตีกลับ",key:"rework"},
    ], people);
  }
  return (<Shell title="Performance รายบุคคล">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
      <div style={{display:"flex",gap:8}}>
        {[["30","30 วัน"],["90","90 วัน"],["all","ทั้งหมด"]].map(([v,l])=>(
          <button key={v} className={"btn sm "+(period===v?"":"sec")} onClick={()=>setPeriod(v)}>{l}</button>))}
      </div>
      <button className="btn sm sec" onClick={exportCSV}>⬇ Export CSV</button>
    </div>
    <div className="kpis">
      <div className="kpi green"><div className="n">{T.closed}</div><div className="l">ปิดงานรวม ({period==="all"?"ทั้งหมด":period+" วัน"})</div></div>
      <div className="kpi"><div className="n">{fmtDur(teamTurn)}</div><div className="l">Turnaround เฉลี่ยทีม</div></div>
      <div className="kpi"><div className="n">{teamSla}%</div><div className="l">ทำทัน SLA (ทีม)</div></div>
      <div className="kpi amber"><div className="n">{teamRw}%</div><div className="l">งานถูกตีกลับ (rework)</div></div>
    </div>
    <div className="card"><h2>ตารางผลงานรายคน</h2>
      <table><thead><tr><th>สมาชิก</th><th className="right">ปิดงาน</th><th>โหลดปัจจุบัน</th><th className="right">Turnaround</th><th className="right">%ทัน SLA</th><th className="right">ตีกลับ</th></tr></thead>
      <tbody>{people.map(p=>{ const turn=p.tN?p.tSum/p.tN:null; const sla=p.slaN?Math.round(100*p.onSla/p.slaN):null;
        return (<tr key={p.id}>
        <td><b>{p.name}</b>{p.role==="lead"&&<span className="tag" style={{marginLeft:6}}>Lead</span>}</td>
        <td className="right">{p.closed}</td>
        <td><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{height:8,width:120,background:"#EEF1F3",borderRadius:6,overflow:"hidden"}}><div style={{height:"100%",width:(100*p.open/maxOpen)+"%",background:p.open>6?"#B26A00":"#0E7C86"}}/></div><span className="muted">{p.open}</span></div></td>
        <td className="right">{fmtDur(turn)}</td>
        <td className="right">{sla==null?"—":<b style={{color:sla>=90?"#2E7D5B":sla>=75?"#B26A00":"#B03A2E"}}>{sla}%</b>}</td>
        <td className="right muted">{p.rework||"—"}</td></tr>); })}
        {!people.length&&<tr><td colSpan="6" className="muted">ยังไม่มีสมาชิกทีม</td></tr>}</tbody></table>
      <div className="muted" style={{fontSize:12,marginTop:8}}>Turnaround = เวลาเฉลี่ยจากรับงานถึงปิดงาน · %ทัน SLA = ปิดงานก่อนกำหนด SLA · ตีกลับ = งานที่ถูกส่งกลับให้แก้</div>
    </div>
  </Shell>);
}
