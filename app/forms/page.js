"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import FormBuilder from "../../components/FormBuilder";
import DynForm from "../../components/DynForm";

const CAT={ finance:"💰 การเงิน & เบิกจ่าย", procurement:"🛒 จัดซื้อ & Vendor", ga:"🏢 ธุรการ & ยานพาหนะ" };

export default function Forms(){
  const [ok,setOk]=useState(false); const [ready,setReady]=useState(false); const [role,setRole]=useState(null);
  const [types,setTypes]=useState([]); const [msg,setMsg]=useState(null); const [err,setErr]=useState(null);
  const [editId,setEditId]=useState(null); const [draft,setDraft]=useState(null);
  const [prev,setPrev]=useState({}); const [saving,setSaving]=useState(false);

  async function load(){
    const { data:rt }=await supabase.from("hub_request_types")
      .select("id,name,category,form_schema,require_attachment,prep_note")
      .eq("is_active",true).order("sort_order");
    setTypes(rt||[]);
  }
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession();
    const { data:t }=await supabase.from("hub_team").select("hub_role").eq("user_id",sess.session.user.id).maybeSingle();
    setRole(t?.hub_role||null);
    setOk(["owner","supervisor","lead"].includes(t?.hub_role));
    setReady(true); load();
  })(); },[]);

  function openBuilder(t){
    setEditId(t.id); setPrev({}); setMsg(null); setErr(null);
    setDraft({
      schema: Array.isArray(t.form_schema) ? JSON.parse(JSON.stringify(t.form_schema)) : [],
      require_attachment: !!t.require_attachment,
      prep_note: t.prep_note || "",
    });
  }
  // ⭐ สลับบังคับ/ไม่บังคับ ได้จากตารางเลย ไม่ต้องเปิดตัวแก้ไข
  async function toggleRequired(t, key, value){
    setMsg(null); setErr(null);
    const schema=(t.form_schema||[]).map(f=>{
      if(f.key!==key) return f;
      const o={...f};
      if(value) o.required=true; else delete o.required;
      return o;
    });
    const { error }=await supabase.from("hub_request_types").update({ form_schema:schema }).eq("id",t.id);
    if(error){ setErr("แก้ไม่สำเร็จ: "+error.message); return; }
    setTypes(ts=>ts.map(x=>x.id===t.id?{...x,form_schema:schema}:x));
    setMsg('อัปเดต "'+(schema.find(f=>f.key===key)?.label||key)+'" เป็น '+(value?"บังคับกรอก":"ไม่บังคับ")+" แล้ว");
  }
  async function toggleAttach(t, value){
    setMsg(null); setErr(null);
    const { error }=await supabase.from("hub_request_types").update({ require_attachment:value }).eq("id",t.id);
    if(error){ setErr("แก้ไม่สำเร็จ: "+error.message); return; }
    setTypes(ts=>ts.map(x=>x.id===t.id?{...x,require_attachment:value}:x));
    setMsg("อัปเดตการบังคับแนบไฟล์แล้ว");
  }

  async function saveBuilder(){
    if(!draft) return;
    const errs=[]; const keys=new Set();
    draft.schema.forEach((f,i)=>{
      if(!String(f.label||"").trim()) errs.push("ช่องที่ "+(i+1)+": ยังไม่ได้ตั้งชื่อ");
      if(!String(f.key||"").trim()) errs.push("ช่องที่ "+(i+1)+": ไม่มีรหัสช่อง (key)");
      else if(keys.has(f.key)) errs.push("รหัสช่องซ้ำ: "+f.key); else keys.add(f.key);
      if(f.type==="select" && !(f.options||[]).length) errs.push('"'+f.label+'": เป็น dropdown แต่ยังไม่มีตัวเลือก');
      if(f.show_if?.field && !draft.schema.some(x=>x.key===f.show_if.field)) errs.push('"'+f.label+'": เงื่อนไขอ้างช่องที่ถูกลบไปแล้ว');
    });
    if(errs.length){ setErr("บันทึกไม่ได้ — "+errs.join(" · ")); return; }

    setSaving(true);
    const clean=draft.schema.map(f=>{
      const o={ key:f.key, label:f.label, type:f.type||"text" };
      if(f.required) o.required=true;
      if(f.type==="select") o.options=f.options||[];
      if(f.placeholder) o.placeholder=f.placeholder;
      if(f.help) o.help=f.help;
      if(f.show_if?.field) o.show_if={ field:f.show_if.field, equals:f.show_if.equals };
      return o;
    });
    const { error }=await supabase.from("hub_request_types").update({
      form_schema: clean,
      require_attachment: draft.require_attachment,
      prep_note: draft.prep_note.trim() || null,
    }).eq("id",editId);
    setSaving(false);
    if(error){ setErr("ผิดพลาด: "+error.message); return; }
    setMsg("บันทึกฟอร์มแล้ว — มีผลกับคำขอใหม่ทันที");
    setEditId(null); setDraft(null);
    load();
  }

  if(ready && !ok) return (<Shell title="ช่องกรอกของแต่ละประเภทงาน">
    <div className="card"><div className="muted">หน้านี้เฉพาะ Owner / Supervisor / Lead เท่านั้น</div></div></Shell>);

  const grouped={};
  types.forEach(t=>{ const k=CAT[t.category]||"อื่น ๆ"; (grouped[k]=grouped[k]||[]).push(t); });

  return (<Shell title="ช่องกรอกของแต่ละประเภทงาน (Form Builder)">
    {msg&&<div className="ok">{msg}</div>}
    {err&&<div className="err">{err}</div>}

    <div className="card">
      <p className="muted" style={{fontSize:12.5,lineHeight:1.9,marginTop:0}}>
        กำหนดว่าผู้ขอต้องกรอกอะไรบ้างในแต่ละประเภทงาน — <b>ติ๊ก "บังคับ" ได้จากตารางเลย</b> ไม่ต้องเปิดตัวแก้ไข<br/>
        ช่องที่บังคับ = <b>ผู้ขอกดส่งไม่ได้ถ้าไม่กรอก</b> · การแก้มีผลกับ<b>คำขอใหม่ทันที</b> (ไม่กระทบคำขอเก่า)<br/>
        <span style={{color:"#5A6672"}}>สิทธิ์ของคุณ: <b>{role==="lead"?"Lead — แก้ฟอร์มได้":role==="supervisor"?"Supervisor":"Owner"}</b></span>
      </p>
    </div>

    {Object.entries(grouped).map(([cat,list])=>(
      <div className="card" key={cat}>
        <h2>{cat}</h2>
        {list.map(t=>{
          const schema=Array.isArray(t.form_schema)?t.form_schema:[];
          const nReq=schema.filter(f=>f.required).length;
          return (<div key={t.id} style={{border:"1px solid #E4E7EB",borderRadius:10,marginBottom:12,overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#F8FAFC",flexWrap:"wrap"}}>
              <b style={{flex:1,fontSize:13.5}}>{t.name}
                <span className="muted" style={{fontWeight:400,marginLeft:8,fontSize:11.5}}>
                  {schema.length} ช่อง · บังคับ {nReq}
                </span>
              </b>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>
                <input type="checkbox" checked={!!t.require_attachment}
                  onChange={e=>toggleAttach(t,e.target.checked)} style={{width:"auto",margin:0}}/>
                บังคับแนบไฟล์
              </label>
              <button className="btn sm sec" onClick={()=>openBuilder(t)} disabled={editId===t.id}>
                {editId===t.id?"กำลังแก้ไข…":"⚙️ แก้ไข / เพิ่มช่อง"}
              </button>
            </div>

            {schema.length===0
              ? <div className="muted" style={{padding:"10px 14px",fontSize:12.5}}>ยังไม่มีช่องกรอก — กด "แก้ไข / เพิ่มช่อง"</div>
              : <table style={{margin:0}}>
                  <thead><tr>
                    <th style={{width:"46%"}}>ช่องกรอก</th><th style={{width:"22%"}}>ชนิด</th>
                    <th style={{width:"18%"}}>เงื่อนไข</th><th style={{width:"14%"}} className="right">บังคับกรอก</th>
                  </tr></thead>
                  <tbody>{schema.map((f,i)=>(
                    <tr key={f.key||i}>
                      <td>{f.label}
                        {f.help&&<div className="muted" style={{fontSize:11}}>{f.help}</div>}</td>
                      <td className="muted" style={{fontSize:12}}>
                        {({text:"ข้อความสั้น",textarea:"ข้อความยาว",number:"ตัวเลข",date:"วันที่",
                           datetime:"วัน-เวลา",select:"ตัวเลือก",checkbox:"ติ๊กถูก"})[f.type]||f.type}
                        {f.type==="select"&&f.options?.length?" ("+f.options.length+")":""}
                      </td>
                      <td className="muted" style={{fontSize:11.5}}>{f.show_if?.field?"มีเงื่อนไข":"—"}</td>
                      <td className="right">
                        <label style={{display:"inline-flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                          <input type="checkbox" checked={!!f.required}
                            onChange={e=>toggleRequired(t,f.key,e.target.checked)} style={{width:"auto",margin:0}}/>
                          <span style={{fontSize:12,color:f.required?"#B03A2E":"#98A4AE",fontWeight:f.required?700:400}}>
                            {f.required?"บังคับ":"ไม่บังคับ"}
                          </span>
                        </label>
                      </td>
                    </tr>))}
                  </tbody>
                </table>}
          </div>);
        })}
      </div>
    ))}

    {editId&&draft&&(()=>{ const t=types.find(x=>x.id===editId); return (
      <div className="card" style={{borderTop:"3px solid #E81828"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <h2 style={{margin:0}}>⚙️ แก้ไขฟอร์ม: {t?.name}</h2>
          <div style={{display:"flex",gap:8}}>
            <button className="btn sm sec" onClick={()=>{setEditId(null);setDraft(null);}}>ยกเลิก</button>
            <button className="btn sm" onClick={saveBuilder} disabled={saving}>{saving?"กำลังบันทึก…":"💾 บันทึกฟอร์ม"}</button>
          </div>
        </div>

        <div className="field" style={{marginTop:14}}>
          <label>📋 ข้อความ "เตรียมให้พร้อมก่อนกรอก" (โชว์ก่อนผู้ขอเริ่มกรอก)</label>
          <textarea value={draft.prep_note} onChange={e=>setDraft({...draft,prep_note:e.target.value})}
            placeholder="เช่น เตรียมใบเสร็จตัวจริง + สำเนาบัตรประชาชนผู้เบิก"/>
        </div>
        <div className="field">
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:400,color:"#20232A"}}>
            <input type="checkbox" checked={draft.require_attachment}
              onChange={e=>setDraft({...draft,require_attachment:e.target.checked})} style={{width:"auto",margin:0}}/>
            <b>บังคับแนบไฟล์</b> — ต้องแนบอย่างน้อย 1 ไฟล์ ถึงจะกดส่งได้
          </label>
        </div>

        <div className="row2" style={{alignItems:"start"}}>
          <div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>ช่องกรอก</div>
            <FormBuilder schema={draft.schema} onChange={s=>setDraft({...draft,schema:s})}/>
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>👁 พรีวิว (สิ่งที่ผู้ขอเห็น)</div>
            <div style={{border:"1px dashed #DDE3E8",borderRadius:10,padding:14,background:"#FCFDFE"}}>
              {draft.prep_note&&<div style={{background:"#FFF8E6",border:"1px solid #EBD9AE",borderRadius:10,
                padding:"10px 12px",marginBottom:14,fontSize:12.5,color:"#8A5A00",lineHeight:1.7}}>
                <b>📋 เตรียมให้พร้อมก่อนกรอก</b><br/>{draft.prep_note}</div>}
              {draft.schema.length
                ? <DynForm schema={draft.schema} data={prev} onChange={setPrev}/>
                : <div className="muted" style={{fontSize:13}}>ยังไม่มีช่องกรอก</div>}
              {draft.require_attachment&&<div className="muted" style={{fontSize:12,marginTop:8}}>
                📎 ต้องแนบไฟล์อย่างน้อย 1 ไฟล์</div>}
            </div>
          </div>
        </div>
      </div>
    ); })()}
  </Shell>);
}
