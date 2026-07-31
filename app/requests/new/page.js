"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { notifyMany, uploadAttachments, fmtSize, fileIcon, missingDocs, fmtMoney, addLink, fetchAll } from "../../../components/util";
import DynForm, { missingFields } from "../../../components/DynForm";
import DocSlots from "../../../components/DocSlots";
import Combobox from "../../../components/Combobox";

const THRESHOLD=100000;
const CAT={
  finance:{label:"💰 การเงิน & เบิกจ่าย",order:1},
  procurement:{label:"🛒 จัดซื้อ & Vendor",order:2},
  ga:{label:"🏢 ธุรการ & ยานพาหนะ",order:3},
  hr:{label:"👥 บุคคล & กะพนักงาน",order:4},
  inventory:{label:"📦 สินค้า & ทรัพย์สิน",order:5},
  project:{label:"📊 งานโครงการ",order:6},
  quality:{label:"📋 เอกสาร & คุณภาพ",order:7},
};
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
  const [depts,setDepts]=useState([]);          // แผนก (master) สำหรับจ่ายงานตามแผนก
  const [form,setForm]=useState({type:"",title:"",detail:"",priority:"normal",due:"",project:"",cost:"",amount:"",department:""});
  const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  const [files,setFiles]=useState([]);          // เอกสารอื่น ๆ (ไม่เข้าช่อง)
  const [docs,setDocs]=useState({});            // { slot_key: [File,...] }
  const [fd,setFd]=useState({});
  const [links,setLinks]=useState([]);          // ลิงก์เอกสารภายนอก (ไฟล์ใหญ่)
  const [lU,setLU]=useState(""); const [lL,setLL]=useState("");
  const [bud,setBud]=useState(null);            // งบเหลือของโครงการที่เลือก
  // Opex/Capex + การจัดการงบไม่พอ (governance)
  const [etype,setEtype]=useState("");          // opex | capex
  const [tScope,setTScope]=useState("in_dept"); // in_dept | cross_dept
  const [tFrom,setTFrom]=useState("");          // โครงการต้นทางที่จะโยกงบมา
  const [tAmt,setTAmt]=useState("");            // จำนวนเงินที่โยก
  const [cfo,setCfo]=useState(false); const [ceo,setCeo]=useState(false);
  const [memoFile,setMemoFile]=useState(null);  // MEMO โยกงบ (Opex)
  const [excomFile,setExcomFile]=useState(null);// มติ Excom (Capex)
  const [excomAck,setExcomAck]=useState(false);
  const [advLines,setAdvLines]=useState([{cost:"",amount:"",note:""}]);  // Clear Advance: หลาย cost ใน 1 OF
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const uid=sess?.session?.user?.id;
    const [t,p,c,d,me]=await Promise.all([
      supabase.from("hub_request_types").select("*").eq("is_active",true).order("sort_order"),
      // ⚠️ PostgREST cap 1000 แถว → ต้อง paginate ให้เห็นโครงการครบทุกตัวใน dropdown
      fetchAll("projects","id,code,name,budget_amount",b=>b.order("code",{ascending:true})),
      supabase.from("hub_cost_codes").select("*").eq("is_active",true).order("code"),
      supabase.from("hub_departments").select("code,name").eq("is_active",true).order("code"),
      supabase.from("profiles").select("department").eq("id",uid).maybeSingle()]);
    setTypes(t.data||[]); setProjects(p||[]); setCodes(c.data||[]); setDepts(d.data||[]);
    // default แผนก = แผนกของผู้ขอ (จับคู่ชื่อ/รหัสกับ master) — เปลี่ยนได้
    const pd=me.data?.department;
    if(pd){ const hit=(d.data||[]).find(x=>String(x.name).toLowerCase()===pd.toLowerCase()||String(x.code).toLowerCase()===pd.toLowerCase());
      if(hit) setForm(f=>({...f,department:hit.code})); }
  })(); },[]);
  // โหลดงบคงเหลือเมื่อเลือกโครงการ
  useEffect(()=>{ (async()=>{
    if(!form.project){ setBud(null); return; }
    const { data }=await supabase.rpc("hub_project_budget_left",{ p_project:form.project });
    setBud(data||null);
  })(); },[form.project]);
  const sel=types.find(t=>t.id===form.type); const needExpense=sel?.incurs_expense;
  // Advance / Clear Advance = 1 OF มีได้หลาย cost → ยอดรวมทั้งใบใช้เช็คงบ/อนุมัติ
  const isAdvance = !!needExpense && /advance/i.test(sel?.name||"");
  const advTotal = advLines.reduce((s,l)=>s+(Number(String(l.amount).replace(/[,\s]/g,""))||0),0);
  const amt = isAdvance ? advTotal : (Number(String(form.amount).replace(/[,\s]/g,""))||0);
  const overBudget = bud?.has_budget && amt>0 && amt > Number(bud.left);
  // ── ตรวจความพร้อมของ governance เมื่องบไม่พอ ──
  const shortfall = overBudget ? (amt - Number(bud.left)) : 0;
  const tAmtNum = Number(String(tAmt).replace(/[,\s]/g,""))||0;
  let govReady=true, govMsg="";
  if(overBudget){
    if(!etype){ govReady=false; govMsg="เลือกประเภทงบ (Opex/Capex) ก่อน"; }
    else if(etype==="opex"){
      if(!tFrom){ govReady=false; govMsg="เลือกโครงการต้นทางที่จะโยกงบมา"; }
      else if(tAmtNum < shortfall){ govReady=false; govMsg="จำนวนเงินที่โยกต้องไม่น้อยกว่าส่วนที่ขาด "+fmtMoney(shortfall)+" บาท"; }
      else if(!memoFile){ govReady=false; govMsg="แนบ MEMO การโยกงบ"; }
      else if(!cfo){ govReady=false; govMsg="ยืนยันว่า MEMO ลงนามโดย CFO แล้ว"; }
      else if(tScope==="cross_dept" && !ceo){ govReady=false; govMsg="โยกข้ามแผนก ต้องยืนยันว่าลงนามโดย CEO ด้วย"; }
    } else if(etype==="capex"){
      if(!excomFile){ govReady=false; govMsg="แนบเอกสารมติอนุมัติจาก Excom (ซื้อนอกงบ)"; }
      else if(!excomAck){ govReady=false; govMsg="ยืนยันว่าได้รับอนุมัติจากที่ประชุม Excom แล้ว"; }
    }
  }
  const blockSubmit = (needExpense && amt>0 && !etype) || (overBudget && !govReady);
  function up(k,v){ setForm(s=>({...s,[k]:v}));
    if(k==="type"){ setDocs({}); setFiles([]); setFd({});
      setEtype(""); setTScope("in_dept"); setTFrom(""); setTAmt(""); setCfo(false); setCeo(false);
      setMemoFile(null); setExcomFile(null); setExcomAck(false);
      setAdvLines([{cost:"",amount:"",note:""}]);
      setLinks([]); setLU(""); setLL(""); }
  }
  // ── หลาย cost line (Clear Advance) ──
  const setLine=(i,k,v)=>setAdvLines(a=>a.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const addLine=()=>setAdvLines(a=>[...a,{cost:"",amount:"",note:""}]);
  const rmLine=(i)=>setAdvLines(a=>a.length>1?a.filter((_,idx)=>idx!==i):a);
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
    // ⛔ ต้องเลือก Opex/Capex ทุกครั้งที่มีค่าใช้จ่าย
    if(needExpense && amt>0 && !etype){
      setErr("กรุณาเลือกประเภทงบ — Opex (ดำเนินงาน) หรือ Capex (ลงทุน)");
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    // ⛔ Clear Advance: ทุกบรรทัดที่มีเงิน ต้องเลือก Cost Code + มีอย่างน้อย 1 บรรทัด
    if(isAdvance){
      const paid=advLines.filter(l=>(Number(String(l.amount).replace(/[,\s]/g,""))||0)>0);
      if(!paid.length){ setErr("Clear Advance ต้องมีอย่างน้อย 1 รายการที่มีจำนวนเงิน"); window.scrollTo({top:0,behavior:"smooth"}); return; }
      if(paid.some(l=>!l.cost)){ setErr("ทุกบรรทัดที่มีจำนวนเงิน ต้องเลือก Cost Code"); window.scrollTo({top:0,behavior:"smooth"}); return; }
    }
    // ⛔ งบไม่พอ → ต้องผ่าน governance (โยกงบ Opex / มติ Excom Capex) ก่อน
    if(overBudget && !govReady){
      setErr("งบโครงการไม่พอ (ขาด "+fmtMoney(shortfall)+" บาท) — "+govMsg);
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    setBusy(true);
    const { data:sess }=await supabase.auth.getSession(); const uid=sess.session.user.id;
    const sla=new Date(Date.now()+(Number(sel?.default_sla_hours||24))*3600e3).toISOString();
    const { data:req, error }=await supabase.from("hub_requests").insert({
      requester_id:uid, request_type_id:form.type, title:form.title, detail:form.detail,
      priority:form.priority, requested_due:form.due||null, sla_due_at:sla, status:"new",
      project_id: form.project||null, department_code: form.department||null, form_data: fd
    }).select().single();
    if(error){ setErr(error.message); setBusy(false); return; }
    if(needExpense && amt>0){
      // 1 entry รวม (amount = ยอดรวมทั้งใบ) คุมอนุมัติ+งบ · สถานะอนุมัติกำหนดโดย trigger DB
      const { data:entry }=await supabase.from("hub_expense_entries").insert({
        request_id:req.id, project_id:form.project||null,
        cost_code_id: isAdvance ? null : (form.cost||null),
        amount: amt,
        expense_type: etype||null,
        out_of_budget: !!overBudget,
        ob_kind: overBudget ? (etype==="opex"?"transfer":"excom") : null
      }).select("id").single();
      // breakdown รายบรรทัด (Clear Advance)
      if(isAdvance && entry){
        const lines=advLines
          .filter(l=>(Number(String(l.amount).replace(/[,\s]/g,""))||0)>0)
          .map(l=>({ request_id:req.id, entry_id:entry.id, cost_code_id:l.cost||null,
                     amount:Number(String(l.amount).replace(/[,\s]/g,""))||0, description:l.note||null }));
        if(lines.length) await supabase.from("hub_expense_lines").insert(lines);
      }
    }
    // งบไม่พอ + Opex → บันทึกการโยกงบ (ปรับตัวเลขงบจริง)
    if(overBudget && etype==="opex"){
      const { error:terr }=await supabase.rpc("hub_record_budget_transfer",{
        p_request:req.id, p_to:form.project, p_from:tFrom, p_amount:tAmtNum,
        p_scope:tScope, p_cfo:cfo, p_ceo:ceo, p_note:null });
      if(terr){ setErr("บันทึกการโยกงบไม่สำเร็จ: "+terr.message); setBusy(false); return; }
    }
    // อัปโหลดเอกสารตามช่อง (ติด slot_key) + เอกสารอื่น ๆ + เอกสาร governance
    const items=[];
    Object.entries(docs).forEach(([k,arr])=>arr.forEach(f=>items.push({file:f, slot_key:k})));
    files.forEach(f=>items.push({file:f, slot_key:null}));
    if(overBudget && etype==="opex" && memoFile) items.push({file:memoFile, slot_key:"budget_memo"});
    if(overBudget && etype==="capex" && excomFile) items.push({file:excomFile, slot_key:"excom_approval"});
    if(items.length){
      const errs=await uploadAttachments(req.id, uid, items);
      if(errs.length) setErr("บางไฟล์แนบไม่สำเร็จ: "+errs.join(" · "));
    }
    // ลิงก์เอกสารภายนอก (ไฟล์ใหญ่)
    for(const l of links){ await addLink(req.id, uid, l.url, l.label); }
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
        <div className="field">
          <label>แผนก (สำหรับจ่ายงาน)</label>
          <select value={form.department} onChange={e=>up("department",e.target.value)}>
            <option value="">— ตามแผนกของฉัน (อัตโนมัติ) —</option>
            {depts.map(d=>(<option key={d.code} value={d.code}>{d.code} · {d.name}</option>))}
          </select>
          <div className="muted" style={{fontSize:11,marginTop:4}}>ถ้าไม่ระบุโครงการ ระบบจะส่งงานให้ <b>เจ้าประจำแผนก</b> · เว้นว่าง = ใช้แผนกของผู้ขอ</div>
        </div>

        {needExpense&&(<div style={{background:"#E4F3EA",border:"1px solid #B7DEC8",borderRadius:10,padding:14,marginBottom:14}}>
          <div style={{fontWeight:700,color:"#2E7D5B",marginBottom:10}}>ค่าใช้จ่ายโครงการ</div>
          <div className="field"><label>ประเภทงบ * <span className="muted" style={{fontWeight:400,fontSize:11}}>(เลือกก่อนกรอกจำนวนเงิน)</span></label>
            <div style={{display:"flex",gap:8}}>
              {[["opex","Opex — ดำเนินงาน"],["capex","Capex — ลงทุน"]].map(([v,l])=>(
                <label key={v} style={{flex:1,display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                  border:"1px solid "+(etype===v?"#2E7D5B":"#CBD8D0"),background:etype===v?"#EAF6EF":"#fff",
                  borderRadius:8,padding:"8px 10px",fontSize:13,fontWeight:etype===v?700:400}}>
                  <input type="radio" name="etype" checked={etype===v} onChange={()=>setEtype(v)}/>{l}
                </label>))}
            </div>
          </div>
          {isAdvance ? (
          <div className="field">
            <label>รายการค่าใช้จ่าย (Clear Advance — ใส่ได้หลาย Cost) *</label>
            <div style={{border:"1px solid #CFE3D6",borderRadius:8,overflow:"hidden"}}>
              <table style={{margin:0,fontSize:12.5}}><thead><tr style={{background:"#F0F7F2"}}>
                <th style={{width:"34%"}}>Cost Code</th><th>รายละเอียด</th>
                <th className="right" style={{width:130}}>จำนวนเงิน</th><th style={{width:34}}></th>
              </tr></thead><tbody>
              {advLines.map((l,i)=>(<tr key={i}>
                <td><select value={l.cost} onChange={e=>setLine(i,"cost",e.target.value)} style={{width:"100%"}}>
                  <option value="">— เลือก —</option>{codes.map(c=>(<option key={c.id} value={c.id}>{c.code} · {c.name}</option>))}
                </select></td>
                <td><input value={l.note} onChange={e=>setLine(i,"note",e.target.value)} placeholder="เช่น ค่าเดินทาง..." style={{width:"100%"}}/></td>
                <td><input type="number" value={l.amount} onChange={e=>setLine(i,"amount",e.target.value)} placeholder="0" style={{width:"100%",textAlign:"right"}}/></td>
                <td style={{textAlign:"center"}}>{advLines.length>1&&
                  <button type="button" onClick={()=>rmLine(i)} title="ลบบรรทัด"
                    style={{border:"none",background:"none",color:"#B03A2E",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>}</td>
              </tr>))}
              </tbody>
              <tfoot><tr style={{borderTop:"2px solid #DDE6E0",fontWeight:700,background:"#FAFDFB"}}>
                <td colSpan="2"><button type="button" onClick={addLine} className="btn sm sec" style={{fontSize:12}}>+ เพิ่มบรรทัด</button></td>
                <td className="right" style={{color:overBudget?"#B03A2E":"#2E7D5B"}}>รวม {fmtMoney(advTotal)}</td><td></td>
              </tr></tfoot></table>
            </div>
            {overBudget&&<div style={{fontSize:11.5,color:"#B03A2E",fontWeight:700,marginTop:4}}>🚫 ยอดรวมเกินงบคงเหลือ {fmtMoney(amt-Number(bud.left))}</div>}
          </div>
          ) : (
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
          )}
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

          {overBudget&&(<div style={{marginTop:12,background:"#FFF6F6",border:"1.5px solid #F0B7BC",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontWeight:800,color:"#B03A2E",marginBottom:6}}>⛔ งบไม่พอ — ขาด {fmtMoney(shortfall)} บาท</div>
            {!etype&&<div style={{fontSize:12.5,color:"#8A5A00"}}>เลือก <b>ประเภทงบ (Opex/Capex)</b> ด้านบนก่อน เพื่อดำเนินการต่อ</div>}

            {etype==="opex"&&(<div style={{fontSize:13,lineHeight:1.7}}>
              <div style={{marginBottom:8,color:"#7A3B34"}}>ต้อง <b>โยกงบ</b> มาก่อน แล้วแนบ MEMO ที่ลงนามแล้ว จึงจะส่งคำขอได้</div>
              <div className="field" style={{marginBottom:8}}><label style={{fontSize:12}}>ขอบเขตการโยกงบ</label>
                <div style={{display:"flex",gap:8}}>
                  {[["in_dept","ภายในแผนก (ลงนาม CFO)"],["cross_dept","ต่างแผนก (ลงนาม CFO + CEO)"]].map(([v,l])=>(
                    <label key={v} style={{flex:1,display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12.5,
                      border:"1px solid "+(tScope===v?"#B03A2E":"#E4C4C4"),background:tScope===v?"#FBE9EA":"#fff",borderRadius:8,padding:"7px 9px"}}>
                      <input type="radio" name="tscope" checked={tScope===v} onChange={()=>{setTScope(v); if(v==="in_dept") setCeo(false);}}/>{l}
                    </label>))}
                </div>
              </div>
              <div className="field" style={{marginBottom:8}}><label style={{fontSize:12}}>โครงการต้นทาง (โยกงบมาจาก) *</label>
                <Combobox options={projects.filter(p=>p.id!==form.project).map(p=>({value:p.id,label:(p.code||"")+" · "+(p.name||""),sub:p.name}))}
                  value={tFrom} onChange={setTFrom} placeholder="🔎 เลือกโครงการที่จะดึงงบมา" emptyLabel="— เลือก —"/>
              </div>
              <div className="field" style={{marginBottom:8}}><label style={{fontSize:12}}>จำนวนเงินที่โยก (บาท) * — อย่างน้อย {fmtMoney(shortfall)}</label>
                <input type="number" value={tAmt} onChange={e=>setTAmt(e.target.value)} placeholder={String(shortfall)}
                  style={tAmtNum&&tAmtNum<shortfall?{borderColor:"#B03A2E"}:undefined}/>
              </div>
              <label className="btn sm sec" style={{cursor:"pointer",margin:"0 0 8px",display:"inline-block"}}>
                {memoFile?"เปลี่ยน MEMO":"📎 แนบ MEMO โยกงบ"}
                <input type="file" style={{display:"none"}} onChange={e=>setMemoFile(e.target.files?.[0]||null)}/>
              </label>
              {memoFile&&<span style={{fontSize:12,marginLeft:8}}>{fileIcon(memoFile.type,memoFile.name)} {memoFile.name}</span>}
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,marginTop:4}}>
                <input type="checkbox" checked={cfo} onChange={e=>setCfo(e.target.checked)}/> ยืนยัน: MEMO ลงนามโดย <b>CFO</b> แล้ว
              </label>
              {tScope==="cross_dept"&&<label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,marginTop:4}}>
                <input type="checkbox" checked={ceo} onChange={e=>setCeo(e.target.checked)}/> ยืนยัน: MEMO ลงนามโดย <b>CEO</b> แล้ว (โยกข้ามแผนก)
              </label>}
            </div>)}

            {etype==="capex"&&(<div style={{fontSize:13,lineHeight:1.7}}>
              <div style={{marginBottom:8,color:"#7A3B34"}}>Capex เกินงบ ต้องนำเข้า <b>ที่ประชุม Excom</b> เมื่ออนุมัติแล้วแนบเอกสารมติจึงจะส่งคำขอได้</div>
              <label className="btn sm sec" style={{cursor:"pointer",margin:"0 0 8px",display:"inline-block"}}>
                {excomFile?"เปลี่ยนเอกสาร":"📎 แนบเอกสารมติ Excom"}
                <input type="file" style={{display:"none"}} onChange={e=>setExcomFile(e.target.files?.[0]||null)}/>
              </label>
              {excomFile&&<span style={{fontSize:12,marginLeft:8}}>{fileIcon(excomFile.type,excomFile.name)} {excomFile.name}</span>}
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,marginTop:4}}>
                <input type="checkbox" checked={excomAck} onChange={e=>setExcomAck(e.target.checked)}/> ยืนยัน: ได้รับอนุมัติจากที่ประชุม <b>Excom</b> แล้ว
              </label>
            </div>)}

            {etype&&(govReady
              ? <div style={{marginTop:8,fontSize:12.5,color:"#2E7D5B",fontWeight:700}}>✅ ครบเงื่อนไขแล้ว — ส่งคำขอได้</div>
              : <div style={{marginTop:8,fontSize:12,color:"#B03A2E"}}>ยังขาด: {govMsg}</div>)}
          </div>)}
        </div>)}
        {sel&&<DocSlots slots={sel.doc_slots} picked={docs} onChange={setDocs}
          extra={files} onExtra={setFiles} formData={fd}/>}

        {sel&&<div className="field" style={{background:"#F3F8FF",border:"1px solid #C7D9F7",borderRadius:10,padding:"12px 14px"}}>
          <label style={{color:"#2453A8"}}>🔗 ลิงก์เอกสารภายนอก (สำหรับไฟล์ใหญ่เกิน 10MB — OneDrive / SharePoint / Drive)</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <input value={lU} onChange={e=>setLU(e.target.value)} placeholder="วางลิงก์ share (https://...)" style={{flex:"2 1 240px"}}/>
            <input value={lL} onChange={e=>setLL(e.target.value)} placeholder="ชื่อ/คำอธิบาย (ถ้ามี)" style={{flex:"1 1 140px"}}/>
            <button type="button" className="btn sm sec" disabled={!lU.trim()}
              onClick={()=>{ setLinks(v=>[...v,{url:lU.trim(),label:lL.trim()}]); setLU(""); setLL(""); }}>+ เพิ่ม</button>
          </div>
          {links.length>0&&<div style={{marginTop:8,display:"grid",gap:4}}>
            {links.map((l,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5}}>
              <span>🔗</span><span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.label||l.url}</span>
              <button type="button" onClick={()=>setLinks(v=>v.filter((_,j)=>j!==i))}
                style={{border:"none",background:"none",color:"#B03A2E",cursor:"pointer",fontSize:14}}>✕</button>
            </div>))}
          </div>}
          <div className="muted" style={{fontSize:11,marginTop:5}}>💡 ตั้งลิงก์ให้ "ผู้ที่มีลิงก์เปิดดูได้" ก่อนวาง เพื่อให้แอดมินเปิดได้</div>
        </div>}
        <div className="muted" style={{fontSize:11,marginTop:-6,marginBottom:12}}>
          รูป / PDF / Word / Excel · สูงสุด 10MB ต่อไฟล์
        </div>
        <button className="btn" disabled={busy||blockSubmit}>{busy?"กำลังส่ง…":
          blockSubmit?(overBudget?"⛔ ทำเงื่อนไขงบไม่พอให้ครบก่อน":"⛔ เลือกประเภทงบก่อน"):"ส่งคำขอ"}</button>
      </form>
    </div>
  </Shell>);
}
