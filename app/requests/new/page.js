"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { notifyMany, uploadAttachments, fmtSize, fileIcon, missingDocs } from "../../../components/util";
import DynForm, { missingFields } from "../../../components/DynForm";
import DocSlots from "../../../components/DocSlots";

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
  const [files,setFiles]=useState([]);          // เอกสารอื่น ๆ (ไม่เข้าช่อง)
  const [docs,setDocs]=useState({});            // { slot_key: [File,...] }
  const [fd,setFd]=useState({});
  useEffect(()=>{ (async()=>{
    const [t,p,c]=await Promise.all([
      supabase.from("hub_request_types").select("*").eq("is_active",true).order("sort_order"),
      supabase.from("projects").select("id,code,name,budget_amount").order("code").limit(500),
      supabase.from("hub_cost_codes").select("*").eq("is_active",true).order("code")]);
    setTypes(t.data||[]); setProjects(p.data||[]); setCodes(c.data||[]);
  })(); },[]);
  const sel=types.find(t=>t.id===form.type); const needExpense=sel?.incurs_expense;
  function up(k,v){ setForm(s=>({...s,[k]:v})); if(k==="type"){ setDocs({}); setFiles([]); setFd({}); } }
  async function submit(e){ e.preventDefault(); setErr(null);
    // ⛔ บังคับกรอกให้ครบก่อนส่ง
    const miss=missingFields(sel?.form_schema, fd);
    if(miss.length){ setErr("กรอกข้อมูลไม่ครบ — ยังขาด: "+miss.join(" · ")); window.scrollTo({top:0,behavior:"smooth"}); return; }
    // ⛔ เอกสารบังคับต้องครบทุกช่อง
    const miss2=missingDocs(sel?.doc_slots, docs);
    if(miss2.length){
      setErr("เอกสารยังไม่ครบ — ยังขาด: "+miss2.join(" · "));
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    const nDocs=Object.values(docs).reduce((s,a)=>s+a.length,0);
    if(sel?.require_attachment && nDocs===0 && files.length===0){
      setErr("งานประเภทนี้ต้องแนบเอกสารหลักฐานอย่างน้อย 1 ไฟล์");
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    setBusy(true);
    const { data:sess }=await supabase.auth.getSession(); const uid=sess.session.user.id;
    const sla=new Date(Date.now()+(Number(sel?.default_sla_hours||24))*3600e3).toISOString();
    const { data:req, error }=await supabase.from("hub_requests").insert({
      requester_id:uid, request_type_id:form.type, title:form.title, detail:form.detail,
      priority:form.priority, requested_due:form.due||null, sla_due_at:sla, status:"new",
      project_id: form.project||null, form_data: fd
    }).select().single();
    if(error){ setErr(error.message); setBusy(false); return; }
    if(needExpense && form.amount){
      // สถานะอนุมัติถูกกำหนดโดย trigger ฝั่ง DB (มีเงิน > 0 → รอ Supervisor เสมอ)
      await supabase.from("hub_expense_entries").insert({
        request_id:req.id, project_id:form.project||null, cost_code_id:form.cost||null,
        amount:Number(form.amount)
      });
    }
    // อัปโหลดเอกสารตามช่อง (ติด slot_key) + เอกสารอื่น ๆ
    const items=[];
    Object.entries(docs).forEach(([k,arr])=>arr.forEach(f=>items.push({file:f, slot_key:k})));
    files.forEach(f=>items.push({file:f, slot_key:null}));
    if(items.length){
      const errs=await uploadAttachments(req.id, uid, items);
      if(errs.length) setErr("บางไฟล์แนบไม่สำเร็จ: "+errs.join(" · "));
    }
    await supabase.from("hub_activity_log").insert({request_id:req.id,actor_id:uid,action:"created",to_status:"new"});
    const { data:leads }=await supabase.from("hub_team").select("user_id").in("hub_role",["owner","lead","supervisor"]);
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
        {sel?.prep_note&&<div style={{background:"#FFF8E6",border:"1px solid #EBD9AE",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12.5,color:"#8A5A00",lineHeight:1.7}}>
          <b>📋 เตรียมให้พร้อมก่อนกรอก</b><br/>{sel.prep_note}
        </div>}

        <div className="field"><label>หัวข้อ *</label><input value={form.title} onChange={e=>up("title",e.target.value)} required placeholder="สรุปสั้น ๆ ว่าต้องการอะไร"/></div>

        {sel&&<DynForm schema={sel.form_schema} data={fd} onChange={setFd}/>}

        <div className="field"><label>หมายเหตุเพิ่มเติม (ถ้ามี)</label><textarea value={form.detail} onChange={e=>up("detail",e.target.value)} placeholder="ข้อมูลอื่นที่อยากให้ทีมทราบ"/></div>
        <div className="row2">
          <div className="field"><label>ความเร่งด่วน</label>
            <select value={form.priority} onChange={e=>up("priority",e.target.value)}>
              <option value="low">ต่ำ</option><option value="normal">ปกติ</option><option value="high">สูง</option><option value="urgent">ด่วนมาก</option></select></div>
          <div className="field"><label>กำหนดส่งที่ต้องการ</label><input type="date" value={form.due} onChange={e=>up("due",e.target.value)}/></div>
        </div>
        <div className="field">
          <label>โครงการ / รหัสโครงการ {needExpense&&<span style={{color:"#B03A2E"}}>*</span>}</label>
          <select value={form.project} onChange={e=>up("project",e.target.value)} required={!!needExpense}>
            <option value="">— ไม่ระบุโครงการ —</option>
            {projects.map(p=>(<option key={p.id} value={p.id}>{p.code} · {p.name}</option>))}
          </select>
          <div className="muted" style={{fontSize:11,marginTop:4}}>ระบุโครงการ = ระบบจะส่งงานให้ <b>เจ้าประจำโครงการ</b> นั้นโดยตรง (แม่นกว่าเดาจากประเภทงาน)</div>
        </div>

        {needExpense&&(<div style={{background:"#E4F3EA",border:"1px solid #B7DEC8",borderRadius:10,padding:14,marginBottom:14}}>
          <div style={{fontWeight:700,color:"#2E7D5B",marginBottom:10}}>ค่าใช้จ่ายโครงการ</div>
          <div className="row2">
            <div className="field"><label>Cost Code</label>
              <select value={form.cost} onChange={e=>up("cost",e.target.value)}>
                <option value="">— เลือก —</option>{codes.map(c=>(<option key={c.id} value={c.id}>{c.code} · {c.name}</option>))}</select></div>
            <div className="field"><label>จำนวนเงิน (บาท)</label><input type="number" value={form.amount} onChange={e=>up("amount",e.target.value)} placeholder="0"/></div>
          </div>
          {Number(form.amount)>THRESHOLD&&<div className="muted" style={{color:"#B26A00"}}>⚠ ยอด &gt; 100,000 — ต้องขออนุมัติเพิ่มก่อนตัดยอด</div>}
        </div>)}
        {sel&&<DocSlots slots={sel.doc_slots} picked={docs} onChange={setDocs}
          extra={files} onExtra={setFiles}/>}
        <div className="muted" style={{fontSize:11,marginTop:-6,marginBottom:12}}>
          รูป / PDF / Word / Excel · สูงสุด 10MB ต่อไฟล์
        </div>
        <button className="btn" disabled={busy}>{busy?"กำลังส่ง…":"ส่งคำขอ"}</button>
      </form>
    </div>
  </Shell>);
}
