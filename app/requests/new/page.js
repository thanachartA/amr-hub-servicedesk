"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { notifyMany } from "../../../components/util";

const THRESHOLD=100000;
const CAT={ finance:{label:"💰 การเงิน & เบิกจ่าย",order:1}, procurement:{label:"🛒 จัดซื้อ & Vendor",order:2}, ga:{label:"🏢 ธุรการ & ยานพาหนะ",order:3} };
const CAT_OTHER={label:"อื่น ๆ",order:9};
function groupTypes(types){
  const g={};
  types.forEach(t=>{ const k=CAT[t.category]?t.category:"_other"; (g[k]=g[k]||[]).push(t); });
  return Object.entries(g)
    .map(([k,items])=>({ key:k, meta:CAT[k]||CAT_OTHER, items:items.sort((a,b)=>(a.sort_order||100)-(b.sort_order||100)) }))
    .sort((a,b)=>a.meta.order-b.meta.order);
}
export default function NewRequest(){
  const router=useRouter();
  const [types,setTypes]=useState([]); const [projects,setProjects]=useState([]); const [codes,setCodes]=useState([]);
  const [form,setForm]=useState({type:"",title:"",detail:"",priority:"normal",due:"",project:"",cost:"",amount:""});
  const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  useEffect(()=>{ (async()=>{
    const [t,p,c]=await Promise.all([
      supabase.from("hub_request_types").select("*").eq("is_active",true).order("sort_order"),
      supabase.from("projects").select("id,code,name,budget_amount").order("code").limit(500),
      supabase.from("hub_cost_codes").select("*").eq("is_active",true).order("code")]);
    setTypes(t.data||[]); setProjects(p.data||[]); setCodes(c.data||[]);
  })(); },[]);
  const sel=types.find(t=>t.id===form.type); const needExpense=sel?.incurs_expense;
  function up(k,v){ setForm(s=>({...s,[k]:v})); }
  async function submit(e){ e.preventDefault(); setBusy(true); setErr(null);
    const { data:sess }=await supabase.auth.getSession(); const uid=sess.session.user.id;
    const sla=new Date(Date.now()+(Number(sel?.default_sla_hours||24))*3600e3).toISOString();
    const { data:req, error }=await supabase.from("hub_requests").insert({
      requester_id:uid, request_type_id:form.type, title:form.title, detail:form.detail,
      priority:form.priority, requested_due:form.due||null, sla_due_at:sla, status:"new"
    }).select().single();
    if(error){ setErr(error.message); setBusy(false); return; }
    if(needExpense && form.amount){
      const amt=Number(form.amount);
      await supabase.from("hub_expense_entries").insert({
        request_id:req.id, project_id:form.project||null, cost_code_id:form.cost||null,
        amount:amt, approval_status: amt>THRESHOLD?"pending":"not_required"
      });
    }
    await supabase.from("hub_activity_log").insert({request_id:req.id,actor_id:uid,action:"created",to_status:"new"});
    const { data:leads }=await supabase.from("hub_team").select("user_id").eq("hub_role","lead");
    notifyMany((leads||[]).map(l=>l.user_id),"มีคำขอใหม่เข้ามา",(req.ticket_no||"")+" · "+form.title,"/requests/"+req.id,req.id);
    router.replace("/requests/"+req.id);
  }
  return (<Shell title="เปิดคำขอใหม่">
    <div className="card" style={{maxWidth:720}}>
      {err&&<div className="err">{err}</div>}
      <form onSubmit={submit}>
        <div className="field"><label>ประเภทงาน *</label>
          <select value={form.type} onChange={e=>up("type",e.target.value)} required>
            <option value="">— เลือกหมวด / ประเภทงาน —</option>
            {groupTypes(types).map(g=>(
              <optgroup key={g.key} label={g.meta.label}>
                {g.items.map(t=>(<option key={t.id} value={t.id}>{t.name}{t.incurs_expense?" (มีค่าใช้จ่าย)":""}</option>))}
              </optgroup>
            ))}
          </select></div>
        <div className="field"><label>หัวข้อ *</label><input value={form.title} onChange={e=>up("title",e.target.value)} required/></div>
        <div className="field"><label>รายละเอียด</label><textarea value={form.detail} onChange={e=>up("detail",e.target.value)}/></div>
        <div className="row2">
          <div className="field"><label>ความเร่งด่วน</label>
            <select value={form.priority} onChange={e=>up("priority",e.target.value)}>
              <option value="low">ต่ำ</option><option value="normal">ปกติ</option><option value="high">สูง</option><option value="urgent">ด่วนมาก</option></select></div>
          <div className="field"><label>กำหนดส่งที่ต้องการ</label><input type="date" value={form.due} onChange={e=>up("due",e.target.value)}/></div>
        </div>
        {needExpense&&(<div style={{background:"#E4F3EA",border:"1px solid #B7DEC8",borderRadius:10,padding:14,marginBottom:14}}>
          <div style={{fontWeight:700,color:"#2E7D5B",marginBottom:10}}>ค่าใช้จ่ายโครงการ</div>
          <div className="row2">
            <div className="field"><label>โครงการ</label>
              <select value={form.project} onChange={e=>up("project",e.target.value)}>
                <option value="">— เลือกโครงการ —</option>{projects.map(p=>(<option key={p.id} value={p.id}>{p.code} · {p.name}</option>))}</select></div>
            <div className="field"><label>Cost Code</label>
              <select value={form.cost} onChange={e=>up("cost",e.target.value)}>
                <option value="">— เลือก —</option>{codes.map(c=>(<option key={c.id} value={c.id}>{c.code} · {c.name}</option>))}</select></div>
          </div>
          <div className="field"><label>จำนวนเงิน (บาท)</label><input type="number" value={form.amount} onChange={e=>up("amount",e.target.value)} placeholder="0"/></div>
          {Number(form.amount)>THRESHOLD&&<div className="muted" style={{color:"#B26A00"}}>⚠ ยอด &gt; 100,000 — ต้องขออนุมัติเพิ่มก่อนตัดยอด</div>}
        </div>)}
        <button className="btn" disabled={busy}>{busy?"กำลังส่ง…":"ส่งคำขอ"}</button>
      </form>
    </div>
  </Shell>);
}
