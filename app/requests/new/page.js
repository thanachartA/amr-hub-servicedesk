"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { notifyMany, uploadAttachments, fmtSize, fileIcon, missingDocs } from "../../../components/util";
import DynForm, { missingFields } from "../../../components/DynForm";
import DocSlots from "../../../components/DocSlots";
import Combobox from "../../../components/Combobox";

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
  const [bud,setBud]=useState(null);            // งบเหลือของโครงการที่เลือก
  useEffect(()=>{ (async()=>{
    const [t,p,c]=await Promise.all([
      supabase.from("hub_request_types").select("*").eq("is_active",true).order("sort_order"),
      supabase.from("projects").select("id,code,name,budget_amount").order("code").limit(2000),
      supabase.from("hub_cost_codes").select("*").eq("is_active",true).order("code")]);
    setTypes(t.data||[]); setProjects(p.data||[]); setCodes(c.data||[]);
  })(); },[]);
  // โหลดงบคงเหลือเมื่อเลือกโครงการ
  useEffect(()=>{ (async()=>{
    if(!form.project){ setBud(null); return; }
    const { data }=await supabase.rpc("hub_project_budget_left",{ p_project:form.project });
    setBud(data||null);
  })(); },[form.project]);
  const amt=Number(String(form.amount).replace(/[,\s]/g,""))||0;
  const overBudget = bud?.has_budget && amt>0 && amt > Number(bud.left);
  const sel=types.find(t=>t.id===form.type); const needExpense=sel?.incurs_expense;
  function up(k,v){ setForm(s=>({...s,[k]:v})); if(k==="type"){ setDocs({}); setFiles([]); setFd({}); } }
  async function submit(e){ e.preventDefault(); setErr(null);
    // ⛔ บังคับกรอกให้ครบก่อนส่ง
    const miss=missingFields(sel?.form_schema, fd);
    if(miss.length){ setErr("กรอกข้อมูลไม่ครบ — ยังขาด: "+miss.join(" · ")); window.scrollTo({top:0,behavior:"smooth"}); return; }
    // ⛔ เอกสารบังคับต้องครบทุกช่อง (รวมเอกสารเงื่อนไข เช่น จ่ายนอกรอบ)
    const miss2=missingDocs(sel?.doc_slots, docs, fd);
    if(miss2.length){
      setErr("เอกสารยังไม่ครบ — ยังขาด: "+miss2.join(" · "));
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    const nDocs=Object.values(docs).reduce((s,a)=>s+a.length,0);
    if(sel?.require_attachment && nDocs===0 && files.length===0){
      setErr("งานประเภทนี้ต้องแนบเอกสารหลักฐานอย่างน้อย 1 ไฟล์");
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    // ⛔ งบโครงการไม่พอ → ส่งไม่ได้
    if(overBudget){
      setErr("งบโครงการไม่พอ — งบคงเหลือ "+fmtMoney(bud.left)+" แต่ขอเบิก "+fmtMoney(amt)+" (เกิน "+fmtMoney(amt-Number(bud.left))+")");
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
          <Combobox
            options={projects.map(p=>({value:p.id, label:(p.code||"")+" · "+(p.name||""), sub:p.name}))}
            value={form.project} onChange={v=>up("project",v)}
            required={!!needExpense}
            placeholder="🔎 พิมพ์รหัส/ชื่อโครงการเพื่อค้นหา"
            emptyLabel="— ไม่ระบุโครงการ —"/>
          <div className="muted" style={{fontSize:11,marginTop:4}}>พิมพ์รหัสหรือชื่อโครงการเพื่อค้นหา · ระบุโครงการ = ระบบส่งงานให้ <b>เจ้าประจำโครงการ</b> โดยตรง</div>
        </div>

        {needExpense&&(<div style={{background:"#E4F3EA",border:"1px solid #B7DEC8",borderRadius:10,padding:14,marginBottom:14}}>
          <div style={{fontWeight:700,color:"#2E7D5B",marginBottom:10}}>ค่าใช้จ่ายโครงการ</div>
          <div className="row2">
            <div className="field"><label>Cost Code</label>
              <select value={form.cost} onChange={e=>up("cost",e.target.value)}>
                <option value="">— เลือก —</option>{codes.map(c=>(<option key={c.id} value={c.id}>{c.code} · {c.name}</option>))}</select></div>
            <div className="field"><label>จำนวนเงิน (บาท)</label>
              <input type="number" value={form.amount} onChange={e=>up("amount",e.target.value)} placeholder="0"
                style={overBudget?{borderColor:"#B03A2E",boxShadow:"0 0 0 3px rgba(176,58,46,.12)"}:undefined}/>
              {overBudget&&<div style={{fontSize:11.5,color:"#B03A2E",fontWeight:700,marginTop:4}}>
                🚫 เกินงบคงเหลือ {fmtMoney(amt-Number(bud.left))}</div>}
            </div>
          </div>
          {/* งบคงเหลือของโครงการ */}
          {bud&&form.project&&(bud.has_budget
            ? <div style={{marginTop:6,padding:"8px 12px",borderRadius:8,fontSize:12.5,
                background:overBudget?"#FDECEE":"#EEF6FF",border:"1px solid "+(overBudget?"#F3C9CE":"#C7D9F7")}}>
                งบโครงการ <b>{fmtMoney(bud.budget)}</b> · ใช้ไปแล้ว <b>{fmtMoney(Math.max(Number(bud.used),Number(bud.erp)))}</b> ·
                คงเหลือ <b style={{color:Number(bud.left)<=0?"#B03A2E":"#2E7D5B"}}>{fmtMoney(bud.left)}</b>
                {overBudget&&<div style={{color:"#B03A2E",fontWeight:700,marginTop:3}}>⛔ งบไม่พอ — ส่งคำขอไม่ได้ ต้องลดยอดหรือเปลี่ยนโครงการ</div>}
              </div>
            : <div className="muted" style={{fontSize:11.5,marginTop:6}}>โครงการนี้ยังไม่ได้ตั้งงบประมาณ (ไม่เช็คงบ)</div>)}
          {Number(form.amount)>THRESHOLD&&<div className="muted" style={{color:"#B26A00",marginTop:6}}>⚠ ยอด &gt; {fmtMoney(THRESHOLD)} — ต้องผ่านการอนุมัติ Owner</div>}
        </div>)}
        {sel&&<DocSlots slots={sel.doc_slots} picked={docs} onChange={setDocs}
          extra={files} onExtra={setFiles} formData={fd}/>}
        <div className="muted" style={{fontSize:11,marginTop:-6,marginBottom:12}}>
          รูป / PDF / Word / Excel · สูงสุด 10MB ต่อไฟล์
        </div>
        <button className="btn" disabled={busy||overBudget}>{busy?"กำลังส่ง…":overBudget?"⛔ งบไม่พอ — ส่งไม่ได้":"ส่งคำขอ"}</button>
      </form>
    </div>
  </Shell>);
}
