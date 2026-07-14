"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { downloadCSV, parseCSV } from "../../components/util";
import FormBuilder from "../../components/FormBuilder";
import DynForm from "../../components/DynForm";

const MODE_TH={skill:"เจ้าประจำ (Skill)",load:"กระจายตามโหลด (Load)",round_robin:"วนคิว (Round-robin)"};

export default function Admin(){
  const [canManage,setCanManage]=useState(false); const [ready,setReady]=useState(false);
  const [rows,setRows]=useState([]); const [team,setTeam]=useState({}); const [q,setQ]=useState(""); const [msg,setMsg]=useState(null);
  const [types,setTypes]=useState([]); const [staff,setStaff]=useState([]);
  const [projects,setProjects]=useState([]); const [pq,setPq]=useState(""); const [onlyUnset,setOnlyUnset]=useState(false);
  const [impBusy,setImpBusy]=useState(false); const [impResult,setImpResult]=useState(null);
  // Form Builder
  const [editId,setEditId]=useState(null); const [draft,setDraft]=useState(null); const [prev,setPrev]=useState({}); const [saving,setSaving]=useState(false);
  // วงเงินอนุมัติ (Owner เท่านั้น)
  const [thr,setThr]=useState(""); const [thrSaved,setThrSaved]=useState(100000);
  const [isOwner,setIsOwner]=useState(false); const [thrBusy,setThrBusy]=useState(false);
  async function loadThreshold(){
    const { data }=await supabase.from("hub_settings").select("value").eq("key","expense_approval_threshold").maybeSingle();
    const v=Number(data?.value)||100000;
    setThrSaved(v); setThr(String(v));
  }
  async function saveThreshold(){
    const v=Number(String(thr).replace(/[,\s]/g,""));
    if(isNaN(v)||v<0){ setMsg("วงเงินต้องเป็นตัวเลข"); return; }
    setThrBusy(true);
    const { data:sess }=await supabase.auth.getSession();
    const { error }=await supabase.from("hub_settings")
      .upsert({ key:"expense_approval_threshold", value:v, updated_by:sess.session.user.id,
                updated_at:new Date().toISOString() },{onConflict:"key"});
    setThrBusy(false);
    if(error){ setMsg("บันทึกไม่สำเร็จ: "+error.message); return; }
    setThrSaved(v); setMsg("ตั้งวงเงินอนุมัติเป็น "+v.toLocaleString("th-TH")+" บาท แล้ว");
  }

  // นำเข้ารายชื่อพนักงาน (CSV)
  const [empBusy,setEmpBusy]=useState(false); const [empResult,setEmpResult]=useState(null);
  function empTemplate(){
    downloadCSV("employee_template.csv",
      [{key:"employee_id",label:"employee_id"},{key:"full_name",label:"full_name"},{key:"email",label:"email"},
       {key:"department",label:"department"},{key:"position",label:"position"}],
      [{employee_id:"T1234",full_name:"สมชาย ใจดี",email:"somchai@amrasia.com",department:"Accounting",position:"Officer"}]);
  }
  function empExport(){
    downloadCSV("employees_"+new Date().toISOString().slice(0,10)+".csv",
      [{key:"employee_id",label:"employee_id"},{key:"full_name",label:"full_name"},{key:"email",label:"email"},
       {key:"department",label:"department"},{key:"position",label:"position"}], rows);
  }
  async function empImport(e){
    const file=e.target.files?.[0]; e.target.value="";
    if(!file) return;
    setEmpBusy(true); setEmpResult(null); setMsg(null);
    try{
      const grid=parseCSV(await file.text());
      if(grid.length<2){ setEmpResult({errors:["ไฟล์ว่าง หรือมีแต่หัวตาราง"]}); setEmpBusy(false); return; }
      const head=grid[0].map(h=>String(h||"").trim().toLowerCase());
      const col=n=>head.indexOf(n);
      const iEmail=col("email"), iName=col("full_name")>=0?col("full_name"):col("name");
      if(iEmail<0||iName<0){ setEmpResult({errors:["ไม่พบคอลัมน์ email หรือ full_name — โหลดเทมเพลตไปใช้ก่อน"]}); setEmpBusy(false); return; }
      const iEmp=col("employee_id"), iDept=col("department"), iPos=col("position");

      const { data:exist }=await supabase.from("profiles").select("id,email").limit(5000);
      const byEmail={}; (exist||[]).forEach(p=>{ if(p.email) byEmail[p.email.trim().toLowerCase()]=p.id; });

      const errors=[]; const seen={}; const ins=[]; const upd=[];
      for(let r=1;r<grid.length;r++){
        const row=grid[r];
        const email=String(row[iEmail]||"").trim().toLowerCase();
        const name=String(row[iName]||"").trim();
        if(!email&&!name) continue;
        if(!email||!name){ errors.push("แถว "+(r+1)+": ต้องมีทั้ง full_name และ email"); continue; }
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ errors.push("แถว "+(r+1)+": อีเมลไม่ถูกต้อง ("+email+")"); continue; }
        if(seen[email]){ errors.push("แถว "+(r+1)+": อีเมลซ้ำในไฟล์ ("+email+")"); continue; }
        seen[email]=1;
        const rec={ email, full_name:name,
          employee_id: iEmp>=0 ? (String(row[iEmp]||"").trim()||null) : null,
          department:  iDept>=0 ? (String(row[iDept]||"").trim()||null) : null,
          position:    iPos>=0 ? (String(row[iPos]||"").trim()||null) : null };
        if(byEmail[email]) upd.push({ id:byEmail[email], ...rec });
        else ins.push({ id:crypto.randomUUID(), ...rec, role:"employee", is_active:true });
      }

      let added=0, updated=0;
      for(let i=0;i<ins.length;i+=200){
        const { error }=await supabase.from("profiles").insert(ins.slice(i,i+200));
        if(error) errors.push("เพิ่มไม่สำเร็จ: "+error.message); else added+=Math.min(200,ins.length-i);
      }
      for(let i=0;i<upd.length;i+=200){
        const { error }=await supabase.from("profiles").upsert(upd.slice(i,i+200),{onConflict:"id"});
        if(error) errors.push("อัปเดตไม่สำเร็จ: "+error.message); else updated+=Math.min(200,upd.length-i);
      }
      setEmpResult({ added, updated, errors });
      await load();
    }catch(ex){ setEmpResult({errors:["อ่านไฟล์ไม่สำเร็จ: "+ex.message]}); }
    setEmpBusy(false);
  }
  // Reset password (โดย Admin — ไม่ต้องยิงเมล)
  const [pwBusy,setPwBusy]=useState(null); const [pwResult,setPwResult]=useState(null); const [copied,setCopied]=useState(false);
  async function resetPassword(u){
    if(!confirm("ตั้งรหัสผ่านชั่วคราวใหม่ให้ \""+(u.full_name||u.email)+"\" ?\n\nรหัสเดิมจะใช้ไม่ได้ทันที และผู้ใช้จะถูกบังคับให้ตั้งรหัสใหม่ตอนเข้าระบบครั้งถัดไป")) return;
    setPwBusy(u.id); setPwResult(null); setMsg(null); setCopied(false);
    const { data:sess }=await supabase.auth.getSession();
    const res=await fetch("/api/admin/reset-password",{
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:"Bearer "+sess.session.access_token },
      body: JSON.stringify({ user_id:u.id })
    });
    const j=await res.json().catch(()=>({error:"เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง"}));
    setPwBusy(null);
    if(!res.ok){ setMsg("ตั้งรหัสผ่านไม่สำเร็จ: "+(j.error||res.status)); return; }
    setPwResult({ name:u.full_name||u.email, email:j.email, password:j.password });
  }
  async function load(){
    const { data:prof }=await supabase.from("profiles").select("id,full_name,email,department,position,employee_id,role").order("full_name").limit(2000);
    const { data:t }=await supabase.from("hub_team").select("user_id,hub_role,is_available,profiles:user_id(id,full_name,email)");
    const map={}; (t||[]).forEach(x=>map[x.user_id]=x.hub_role);
    setRows(prof||[]); setTeam(map);
    setStaff((t||[]).filter(x=>x.profiles).map(x=>({id:x.profiles.id,name:x.profiles.full_name,email:x.profiles.email,role:x.hub_role,avail:x.is_available})));
    const { data:rt }=await supabase.from("hub_request_types").select("id,name,category,routing_mode,primary_owner_id,backup_owner_id,default_sla_hours,form_schema,require_attachment,prep_note").eq("is_active",true).order("sort_order");
    setTypes(rt||[]);
    const { data:pj }=await supabase.from("projects").select("id,code,name,hub_owner_id,hub_backup_owner_id").order("code").limit(500);
    setProjects(pj||[]);
  }
  // ⬇ ดาวน์โหลดเทมเพลต: รหัส+ชื่อโครงการครบทุกแถว + เจ้าประจำปัจจุบัน (ถ้ามี)
  function exportTemplate(){
    const nameOf=id=>{ const s=staff.find(x=>x.id===id); return s?(s.email||s.name):""; };
    downloadCSV("เจ้าประจำโครงการ_template.csv",[
      {label:"รหัสโครงการ",key:"code"},
      {label:"ชื่อโครงการ",key:"name"},
      {label:"เจ้าประจำ (อีเมล หรือ ชื่อ-นามสกุล)",get:p=>nameOf(p.hub_owner_id)},
      {label:"ตัวสำรอง (อีเมล หรือ ชื่อ-นามสกุล)",get:p=>nameOf(p.hub_backup_owner_id)},
    ], projects);
  }

  // ⬆ อัปโหลดไฟล์: จับคู่โครงการด้วย "รหัส" และจับคู่คนด้วย "อีเมล" หรือ "ชื่อ"
  async function importTemplate(e){
    const file=e.target.files?.[0]; if(!file) return;
    setImpBusy(true); setMsg(null); setImpResult(null);
    try{
      const rows=parseCSV(await file.text());
      const byCode={}; projects.forEach(p=>{ byCode[String(p.code||"").trim().toLowerCase()]=p; });
      const byPerson={};
      staff.forEach(s=>{
        if(s.email) byPerson[String(s.email).trim().toLowerCase()]=s.id;
        if(s.name)  byPerson[String(s.name).trim().toLowerCase()]=s.id;
      });
      const resolve=v=>{ const k=String(v||"").trim().toLowerCase(); return k?byPerson[k]:undefined; };

      let updated=0; const badProj=[]; const badPerson=[]; const updates=[];
      rows.forEach((r,i)=>{
        const code=String(r[0]||"").trim();
        if(!code) return;
        if(i===0 && /รหัส|code/i.test(code)) return; // ข้ามหัวตาราง
        const p=byCode[code.toLowerCase()];
        if(!p){ badProj.push(code); return; }
        const oRaw=String(r[2]||"").trim(); const bRaw=String(r[3]||"").trim();
        const patch={};
        if(oRaw){ const id=resolve(oRaw); if(id) patch.hub_owner_id=id; else badPerson.push(oRaw); }
        if(bRaw){ const id=resolve(bRaw); if(id) patch.hub_backup_owner_id=id; else badPerson.push(bRaw); }
        if(Object.keys(patch).length) updates.push({id:p.id,patch});
      });

      for(const u of updates){
        const { error }=await supabase.from("projects").update(u.patch).eq("id",u.id);
        if(!error) updated++;
      }
      await load();
      setImpResult({
        updated,
        skipped: rows.length-1-updates.length-badProj.length,
        badProj:[...new Set(badProj)],
        badPerson:[...new Set(badPerson)],
      });
    }catch(err){
      setMsg("อ่านไฟล์ไม่สำเร็จ: "+err.message);
    }
    setImpBusy(false); e.target.value="";
  }

  // ===== Form Builder: เปิด / บันทึก =====
  function openBuilder(t){
    setEditId(t.id); setPrev({}); setMsg(null);
    setDraft({
      schema: Array.isArray(t.form_schema)? JSON.parse(JSON.stringify(t.form_schema)) : [],
      require_attachment: !!t.require_attachment,
      prep_note: t.prep_note || "",
    });
  }
  async function saveBuilder(){
    if(!draft) return;
    // ตรวจก่อนบันทึก
    const errs=[];
    const keys=new Set();
    draft.schema.forEach((f,i)=>{
      if(!String(f.label||"").trim()) errs.push("ช่องที่ "+(i+1)+": ยังไม่ได้ตั้งชื่อ");
      if(!String(f.key||"").trim()) errs.push("ช่องที่ "+(i+1)+": ไม่มีรหัสช่อง (key)");
      else if(keys.has(f.key)) errs.push("รหัสช่องซ้ำ: "+f.key); else keys.add(f.key);
      if(f.type==="select" && !(f.options||[]).length) errs.push('"'+f.label+'": เป็น dropdown แต่ยังไม่มีตัวเลือก');
      if(f.show_if?.field && !draft.schema.some(x=>x.key===f.show_if.field)) errs.push('"'+f.label+'": เงื่อนไขอ้างช่องที่ถูกลบไปแล้ว');
    });
    if(errs.length){ setMsg("บันทึกไม่ได้ — "+errs.join(" · ")); return; }

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
    if(error){ setMsg("ผิดพลาด: "+error.message); return; }
    setMsg("บันทึกฟอร์มแล้ว — มีผลกับคำขอใหม่ทันที");
    setEditId(null); setDraft(null);
    load();
  }

  async function setProjOwner(projId, field, value){
    setMsg(null);
    const { error }=await supabase.from("projects").update({[field]: value||null}).eq("id",projId);
    if(error){ setMsg("ผิดพลาด: "+error.message); return; }
    setProjects(ps=>ps.map(p=>p.id===projId?{...p,[field]:value||null}:p));
    setMsg("บันทึกเจ้าประจำโครงการแล้ว");
  }
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession();
    const { data:t }=await supabase.from("hub_team").select("hub_role").eq("user_id",sess.session.user.id).maybeSingle();
    setCanManage(["owner","supervisor"].includes(t?.hub_role));
    setIsOwner(t?.hub_role==="owner");
    setReady(true); load(); loadThreshold();
  })(); },[]);
  async function setRole(uid, role){
    setMsg(null);
    if(role==="none"){ const {error}=await supabase.from("hub_team").delete().eq("user_id",uid); if(error){setMsg("ผิดพลาด: "+error.message);return;} }
    else { const {error}=await supabase.from("hub_team").upsert({user_id:uid,hub_role:role},{onConflict:"user_id"}); if(error){setMsg("ผิดพลาด: "+error.message);return;} }
    setTeam(t=>({...t,[uid]:role==="none"?undefined:role})); setMsg("บันทึกสิทธิ์แล้ว");
  }
  async function setRouting(typeId, field, value){
    setMsg(null);
    const { error }=await supabase.from("hub_request_types").update({[field]: value||null}).eq("id",typeId);
    if(error){ setMsg("ผิดพลาด: "+error.message); return; }
    setTypes(ts=>ts.map(t=>t.id===typeId?{...t,[field]:value||null}:t));
    setMsg("บันทึกการตั้งค่า Routing แล้ว");
  }
  if(ready && !canManage) return <Shell title="จัดการผู้ใช้"><div className="card"><div className="muted">หน้านี้เฉพาะ Owner / Supervisor เท่านั้น</div></div></Shell>;
  const shown=rows.filter(r=>!q || (r.full_name||"").toLowerCase().includes(q.toLowerCase()) || (r.email||"").toLowerCase().includes(q.toLowerCase()));
  const nTeam=Object.values(team).filter(Boolean).length;
  const border=r=>({owner:"#E81828",lead:"#2D6CDF",supervisor:"#7A5AF8",agent:"#0E9AA6"})[r]||"#E2E7EB";
  const noPrimary=types.filter(t=>t.routing_mode==="skill" && !t.primary_owner_id).length;
  const noBackup=types.filter(t=>t.routing_mode==="skill" && !t.backup_owner_id).length;
  const nProjOwner=projects.filter(p=>p.hub_owner_id).length;
  const shownProjects=projects.filter(p=>{
    if(onlyUnset && p.hub_owner_id) return false;
    if(!pq) return true;
    const s=pq.toLowerCase();
    return (p.code||"").toLowerCase().includes(s) || (p.name||"").toLowerCase().includes(s);
  });
  return (<Shell title="จัดการผู้ใช้ & สิทธิ์">
    {msg&&<div className="ok">{msg}</div>}
    <div className="kpis" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
      <div className="kpi"><div className="n">{rows.length}</div><div className="l">ผู้ใช้ทั้งหมด</div></div>
      <div className="kpi green"><div className="n">{nTeam}</div><div className="l">อยู่ในทีม Hub</div></div>
      <div className="kpi red"><div className="n">{Object.values(team).filter(r=>r==="owner"||r==="supervisor").length}</div><div className="l">จัดการเต็ม (Owner/Sup)</div></div>
      <div className="kpi"><div className="n">{Object.values(team).filter(r=>r==="lead").length}</div><div className="l">Lead (ปฏิบัติการ)</div></div>
    </div>

    <div className="card">
      <h2>🤖 ตั้งค่าการมอบหมาย (Smart Suggest Routing)</h2>
      <p className="muted" style={{marginBottom:12,fontSize:12.5}}>
        ระบบจะ <b>แนะนำ</b> ผู้รับผิดชอบตอนมีคำขอเข้ามา (ไม่มอบหมายเอง — หัวหน้ากดยืนยันอีกที)<br/>
        <b>เจ้าประจำ (Skill)</b> = ส่งให้ Primary → ถ้าลา ส่งให้ Backup → ถ้าไม่มี ปล่อยให้หัวหน้าจัด ·
        <b> ตามโหลด (Load)</b> = แนะนำคนที่ถืองานค้างน้อยสุด
      </p>
      {(noPrimary>0||noBackup>0)&&<div style={{background:"#FBF1DE",border:"1px solid #EBD9AE",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12.5,color:"#9A5B00"}}>
        ⚠ ยังตั้งไม่ครบ: ขาด <b>เจ้าประจำ {noPrimary}</b> ประเภท · ขาด <b>ตัวสำรอง {noBackup}</b> ประเภท — ประเภทที่ขาดจะไม่มีคำแนะนำ
      </div>}
      <table><thead><tr><th>ประเภทงาน</th><th>วิธีมอบหมาย</th><th>เจ้าประจำ (Primary)</th><th>ตัวสำรอง (Backup)</th></tr></thead>
      <tbody>{types.map(t=>(<tr key={t.id}>
        <td><b>{t.name}</b><div className="muted" style={{fontSize:11}}>SLA {t.default_sla_hours} ชม.</div></td>
        <td><select value={t.routing_mode||"skill"} onChange={e=>setRouting(t.id,"routing_mode",e.target.value)} style={{minWidth:170}}>
          <option value="skill">{MODE_TH.skill}</option>
          <option value="load">{MODE_TH.load}</option>
        </select></td>
        <td><select value={t.primary_owner_id||""} onChange={e=>setRouting(t.id,"primary_owner_id",e.target.value)}
              disabled={t.routing_mode!=="skill"}
              style={{minWidth:180,borderColor:(t.routing_mode==="skill"&&!t.primary_owner_id)?"#E8A33D":undefined}}>
          <option value="">— ยังไม่ตั้ง —</option>
          {staff.map(s=>(<option key={s.id} value={s.id}>{s.name}{!s.avail?" (ลา)":""}</option>))}
        </select></td>
        <td><select value={t.backup_owner_id||""} onChange={e=>setRouting(t.id,"backup_owner_id",e.target.value)}
              disabled={t.routing_mode!=="skill"} style={{minWidth:180}}>
          <option value="">— ยังไม่ตั้ง —</option>
          {staff.map(s=>(<option key={s.id} value={s.id}>{s.name}{!s.avail?" (ลา)":""}</option>))}
        </select></td>
      </tr>))}
        {!types.length&&<tr><td colSpan="4" className="muted">ไม่มีประเภทงาน</td></tr>}</tbody></table>
    </div>

    <div className="card">
      <h2>📝 ช่องกรอกของแต่ละประเภทงาน (Form Builder)</h2>
      <p className="muted" style={{marginBottom:12,fontSize:12.5}}>
        กำหนดว่า <b>user ต้องกรอกอะไรบ้าง</b> ตอนเปิดคำขอ — ช่องที่ตั้งเป็น "บังคับกรอก" จะทำให้ user <b>กดส่งไม่ได้</b> ถ้าไม่ครบ<br/>
        แก้แล้วมีผลกับ <b>คำขอใหม่ทันที</b> (ไม่ต้อง deploy) · คำขอเก่ายังเก็บข้อมูลเดิมไว้ครบ
      </p>

      <table><thead><tr><th>ประเภทงาน</th><th className="right">จำนวนช่อง</th><th>บังคับแนบไฟล์</th><th></th></tr></thead>
      <tbody>{types.map(t=>(<tr key={t.id}>
        <td><b>{t.name}</b></td>
        <td className="right">{(t.form_schema||[]).length} ช่อง
          <span className="muted" style={{fontSize:11}}> ({(t.form_schema||[]).filter(f=>f.required).length} บังคับ)</span></td>
        <td>{t.require_attachment
          ? <span className="badge b-closed">ต้องแนบ</span>
          : <span className="muted" style={{fontSize:12}}>ไม่บังคับ</span>}</td>
        <td className="right">
          <button className="btn sm" onClick={()=>openBuilder(t)} disabled={editId===t.id}>
            {editId===t.id?"กำลังแก้ไข…":"แก้ไขฟอร์ม"}
          </button></td>
      </tr>))}</tbody></table>

      {editId&&draft&&(()=>{ const t=types.find(x=>x.id===editId); return (
        <div style={{marginTop:16,border:"2px solid #2D6CDF",borderRadius:12,overflow:"hidden"}}>
          <div style={{background:"#EEF4FF",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <b style={{color:"#2D6CDF"}}>แก้ไขฟอร์ม: {t?.name}</b>
            <div style={{display:"flex",gap:8}}>
              <button className="btn sm sec" onClick={()=>{setEditId(null);setDraft(null);setMsg(null);}}>ยกเลิก</button>
              <button className="btn sm" onClick={saveBuilder} disabled={saving}>{saving?"กำลังบันทึก…":"💾 บันทึกฟอร์ม"}</button>
            </div>
          </div>

          <div style={{padding:14,display:"grid",gridTemplateColumns:"1.15fr 0.85fr",gap:16}}>
            <div>
              <div className="field">
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:400,color:"#20232A"}}>
                  <input type="checkbox" checked={draft.require_attachment}
                    onChange={e=>setDraft({...draft,require_attachment:e.target.checked})} style={{width:"auto",margin:0}}/>
                  <b>บังคับแนบไฟล์</b> — ไม่แนบเอกสาร กดส่งไม่ได้ (ใช้กับงานที่ต้องมีบิล/ใบเสร็จ/ใบเสนอราคา)
                </label>
              </div>
              <div className="field">
                <label>ข้อความ “เตรียมให้พร้อมก่อนกรอก” (โผล่บนสุดของฟอร์ม)</label>
                <textarea value={draft.prep_note} onChange={e=>setDraft({...draft,prep_note:e.target.value})}
                  placeholder="เช่น เตรียม: บิล/ใบเสร็จตัวจริง · ใบกำกับภาษี (ถ้ามี) · เลขผู้เสียภาษีของผู้ขาย"/>
              </div>
              <div style={{fontWeight:700,fontSize:13,margin:"14px 0 8px"}}>ช่องกรอก ({draft.schema.length})</div>
              <FormBuilder schema={draft.schema} onChange={s=>setDraft({...draft,schema:s})}/>
            </div>

            <div>
              <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>👁 พรีวิว — สิ่งที่ user จะเห็น</div>
              {draft.prep_note&&<div style={{background:"#FFF8E6",border:"1px solid #EBD9AE",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#8A5A00",lineHeight:1.7}}>
                <b>📋 เตรียมให้พร้อมก่อนกรอก</b><br/>{draft.prep_note}
              </div>}
              <DynForm schema={draft.schema} data={prev} onChange={setPrev}/>
              {draft.require_attachment&&<div className="muted" style={{fontSize:11.5,color:"#B03A2E"}}>📎 แนบไฟล์ * บังคับ</div>}
              <div className="muted" style={{fontSize:11,marginTop:10,lineHeight:1.7}}>
                ลองกรอก/ติ๊กในพรีวิวได้เลย — ช่องที่มีเงื่อนไขจะโผล่/หายให้เห็นจริง
              </div>
            </div>
          </div>
        </div>); })()}
    </div>

    <div className="card">
      <h2>📁 เจ้าประจำโครงการ (ชนะกติกาประเภทงาน)</h2>
      <p className="muted" style={{marginBottom:10,fontSize:12.5}}>
        ถ้าคำขอระบุโครงการที่มีเจ้าประจำ → ระบบแนะนำ <b>คนของโครงการนั้น</b> ทันที (ไม่ต้องเดาจากประเภทงาน)<br/>
        ตั้งครบแล้ว <b>{nProjOwner}</b> / {projects.length} โครงการ
      </p>
      <div style={{background:"#F6F7F9",border:"1px solid #E4E7EB",borderRadius:10,padding:12,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>อัปเดตทีเดียวด้วยไฟล์ (แนะนำสำหรับ 77 โครงการ)</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <button className="btn sm sec" onClick={exportTemplate}>⬇ 1. ดาวน์โหลดเทมเพลต</button>
          <span className="muted" style={{fontSize:12}}>→ เปิดใน Excel เติมชื่อ/อีเมล →</span>
          <label className="btn sm" style={{cursor:"pointer",margin:0}}>
            {impBusy?"กำลังอัปเดต…":"⬆ 2. อัปโหลดไฟล์ที่กรอกแล้ว"}
            <input type="file" accept=".csv,text/csv" disabled={impBusy} onChange={importTemplate} style={{display:"none"}}/>
          </label>
        </div>
        <div className="muted" style={{fontSize:11,marginTop:6,lineHeight:1.7}}>
          ไฟล์มี 4 คอลัมน์: <b>รหัสโครงการ, ชื่อโครงการ, เจ้าประจำ, ตัวสำรอง</b> · ช่องคนกรอกได้ทั้ง <b>อีเมล</b> หรือ <b>ชื่อ-นามสกุล</b><br/>
          ช่องที่<b>เว้นว่าง = ไม่เปลี่ยนแปลง</b> (ของเดิมยังอยู่) · อัปโหลดซ้ำกี่รอบก็ได้
        </div>
        {impResult&&<div style={{marginTop:10,padding:"8px 12px",borderRadius:8,fontSize:12.5,
            background:(impResult.badProj.length||impResult.badPerson.length)?"#FBF1DE":"#E4F3EA",
            border:"1px solid "+((impResult.badProj.length||impResult.badPerson.length)?"#EBD9AE":"#B7DEC8"),
            color:(impResult.badProj.length||impResult.badPerson.length)?"#9A5B00":"#2E7D5B"}}>
          ✓ อัปเดตสำเร็จ <b>{impResult.updated}</b> โครงการ
          {impResult.badProj.length>0&&<div style={{marginTop:4}}>⚠ ไม่พบรหัสโครงการ ({impResult.badProj.length}): {impResult.badProj.slice(0,8).join(", ")}{impResult.badProj.length>8?" …":""}</div>}
          {impResult.badPerson.length>0&&<div style={{marginTop:4}}>⚠ ไม่พบชื่อ/อีเมลคนนี้ในทีม Hub ({impResult.badPerson.length}): {impResult.badPerson.slice(0,8).join(", ")}{impResult.badPerson.length>8?" …":""}</div>}
        </div>}
      </div>

      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <input value={pq} onChange={e=>setPq(e.target.value)} placeholder="ค้นหา รหัส / ชื่อโครงการ…"
          style={{maxWidth:300,padding:"9px 11px",border:"1px solid #E4E7EB",borderRadius:8,fontSize:13.5,fontFamily:"inherit"}}/>
        <label style={{fontSize:12.5,display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
          <input type="checkbox" checked={onlyUnset} onChange={e=>setOnlyUnset(e.target.checked)} style={{width:"auto"}}/>
          แสดงเฉพาะที่ยังไม่ตั้ง
        </label>
        <span className="muted" style={{fontSize:12,marginLeft:"auto"}}>แสดง {shownProjects.length} รายการ</span>
      </div>
      <div style={{maxHeight:420,overflowY:"auto"}}>
        <table><thead><tr><th>รหัส</th><th>ชื่อโครงการ</th><th>เจ้าประจำ</th><th>ตัวสำรอง</th></tr></thead>
        <tbody>{shownProjects.map(p=>(<tr key={p.id}>
          <td className="mono"><b>{p.code}</b></td>
          <td style={{maxWidth:280,fontSize:12.5}}>{p.name}</td>
          <td><select value={p.hub_owner_id||""} onChange={e=>setProjOwner(p.id,"hub_owner_id",e.target.value)}
                style={{minWidth:170,borderColor:!p.hub_owner_id?"#E8A33D":undefined}}>
            <option value="">— ยังไม่ตั้ง —</option>
            {staff.map(s=>(<option key={s.id} value={s.id}>{s.name}{!s.avail?" (ลา)":""}</option>))}
          </select></td>
          <td><select value={p.hub_backup_owner_id||""} onChange={e=>setProjOwner(p.id,"hub_backup_owner_id",e.target.value)} style={{minWidth:170}}>
            <option value="">— ยังไม่ตั้ง —</option>
            {staff.map(s=>(<option key={s.id} value={s.id}>{s.name}{!s.avail?" (ลา)":""}</option>))}
          </select></td>
        </tr>))}
          {!shownProjects.length&&<tr><td colSpan="4" className="muted">ไม่พบโครงการ</td></tr>}</tbody></table>
      </div>
    </div>

    <div className="card">
      <h2>💰 วงเงินอนุมัติค่าใช้จ่าย (2 ชั้น)</h2>
      <p className="muted" style={{fontSize:12.5,lineHeight:1.9,marginTop:-4}}>
        คำขอที่มีค่าใช้จ่าย <b>ทุกใบ</b> ต้องผ่าน Supervisor ก่อนเสมอ<br/>
        <b>ไม่เกินวงเงิน</b> → Supervisor อนุมัติจบ ·
        <b> เกินวงเงิน</b> → Supervisor ตรวจแล้ว <b>ส่งต่อ Owner</b> อนุมัติชั้นสุดท้าย (มีแจ้งเตือนถึง Owner)
      </p>
      <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap",marginTop:10}}>
        <div className="field" style={{marginBottom:0,maxWidth:220}}>
          <label>วงเงิน (บาท)</label>
          <input value={thr} onChange={e=>setThr(e.target.value)} disabled={!isOwner}
            className="mono" style={{fontSize:16,fontWeight:700}}/>
        </div>
        {isOwner
          ? <button className="btn sm" onClick={saveThreshold} disabled={thrBusy||String(Number(String(thr).replace(/[,\s]/g,"")))===String(thrSaved)}>
              {thrBusy?"กำลังบันทึก…":"💾 บันทึกวงเงิน"}
            </button>
          : <span className="muted" style={{fontSize:12,paddingBottom:8}}>🔒 เฉพาะ Owner แก้ได้</span>}
      </div>
      <p className="muted" style={{fontSize:11.5,marginTop:8}}>
        ปัจจุบัน: เกิน <b>{thrSaved.toLocaleString("th-TH")} บาท</b> ต้องให้ Owner อนุมัติ
      </p>
    </div>

    <div className="card">
      <h2>👥 นำเข้ารายชื่อพนักงาน (CSV)</h2>
      <p className="muted" style={{fontSize:12.5,lineHeight:1.8,marginTop:-4}}>
        อัปโหลดรายชื่อ + อีเมลพนักงาน เพื่อให้พวกเขา <b>ตั้งรหัสผ่านครั้งแรก</b> แล้วเข้ามาเปิดคำขอได้<br/>
        คอลัมน์ที่รองรับ: <span className="mono">employee_id, full_name, email, department, position</span>
        &nbsp;(บังคับเฉพาะ <b>full_name</b> กับ <b>email</b>)<br/>
        อีเมลที่<b>มีอยู่แล้วจะถูกอัปเดตทับ</b> · ไม่กระทบสิทธิ์ใน Hub ของใครทั้งสิ้น
      </p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:12}}>
        <button type="button" className="btn sm sec" onClick={empTemplate}>⬇ โหลดเทมเพลต CSV</button>
        <button type="button" className="btn sm sec" onClick={empExport}>⬇ Export รายชื่อปัจจุบัน ({rows.length})</button>
        <label className="btn sm" style={{cursor:"pointer",margin:0}}>
          {empBusy?"กำลังนำเข้า…":"⬆ อัปโหลดรายชื่อพนักงาน"}
          <input type="file" accept=".csv,text/csv" onChange={empImport} disabled={empBusy} style={{display:"none"}}/>
        </label>
      </div>
      {empResult&&(<div style={{marginTop:12,background:"#F8FAFC",border:"1px solid #E4E7EB",borderRadius:8,padding:"10px 12px",fontSize:12.5,lineHeight:1.8}}>
        {(empResult.added>0||empResult.updated>0)&&<div>
          ✅ เพิ่มใหม่ <b>{empResult.added||0}</b> คน · อัปเดต <b>{empResult.updated||0}</b> คน
        </div>}
        {empResult.errors?.length>0&&<div style={{color:"#B03A2E",marginTop:4}}>
          ⚠️ ข้าม/ผิดพลาด {empResult.errors.length} รายการ:
          <ul style={{margin:"4px 0 0 18px"}}>{empResult.errors.slice(0,10).map((e,i)=>(<li key={i}>{e}</li>))}</ul>
          {empResult.errors.length>10&&<div className="muted">…และอีก {empResult.errors.length-10} รายการ</div>}
        </div>}
      </div>)}
    </div>

    <div className="card">
      <h2>สิทธิ์ผู้ใช้</h2>
      <div className="field" style={{maxWidth:340}}><label>ค้นหา ชื่อ / อีเมล</label><input value={q} onChange={e=>setQ(e.target.value)} placeholder="พิมพ์เพื่อค้นหา…"/></div>
      <table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>ฝ่าย / ตำแหน่ง</th><th>สิทธิ์ใน Hub</th><th>รหัสผ่าน</th></tr></thead>
      <tbody>{shown.map(r=>{ const role=team[r.id]||"none";
        return (<tr key={r.id}>
          <td><b>{r.full_name}</b>{r.employee_id&&<span className="muted" style={{marginLeft:6}}>{r.employee_id}</span>}</td>
          <td className="muted">{r.email||"—"}</td>
          <td>{r.department||"—"}{r.position?<div className="muted" style={{fontSize:11}}>{r.position}</div>:null}</td>
          <td><select value={role} onChange={e=>setRole(r.id,e.target.value)} style={{minWidth:230,borderColor:border(role)}}>
            <option value="none">— ไม่ใช่ทีม Hub (ผู้ขอ) —</option>
            <option value="agent">Agent — เห็นเฉพาะงานตัวเอง</option>
            <option value="lead">Lead — มอบหมาย + ตรวจงาน</option>
            <option value="supervisor">Supervisor — จัดการเต็ม (มอบหมาย+อนุมัติ+จัดการ user)</option>
            <option value="owner">Owner — สิทธิ์สูงสุด</option>
          </select></td>
          <td><button type="button" className="btn sm sec" disabled={pwBusy===r.id} onClick={()=>resetPassword(r)} title="ตั้งรหัสผ่านชั่วคราวให้ทันที ไม่ต้องส่งอีเมล">
            {pwBusy===r.id?"กำลังตั้ง…":"🔑 ตั้งรหัสใหม่"}
          </button></td>
        </tr>); })}
        {!shown.length&&<tr><td colSpan="5" className="muted">ไม่พบผู้ใช้</td></tr>}</tbody></table>
      <p className="muted" style={{marginTop:10}}><b>Owner</b> = ทุก module · <b>Supervisor</b> = จัดการเต็ม (มอบหมาย+ตรวจ+อนุมัติค่าใช้จ่าย+จัดการผู้ใช้) · <b>Lead</b> = มอบหมาย+ตรวจงาน+เห็นทั้งหมด · <b>Agent</b> = เห็นเฉพาะงานที่ได้รับ · <b>ผู้ขอ</b> = เปิดคำขอ+ดูของตัวเอง</p>
      <p className="muted" style={{marginTop:6}}>🔑 <b>ตั้งรหัสใหม่</b> = ระบบสุ่มรหัสชั่วคราวให้ทันที (ไม่ต้องส่งอีเมล) — แจ้งรหัสให้เจ้าตัวโดยตรง แล้วเขาจะถูกบังคับให้ตั้งรหัสของตัวเองตอนเข้าระบบครั้งถัดไป</p>
    </div>

    {pwResult&&(<div style={{position:"fixed",inset:0,background:"rgba(32,32,40,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:20}}
      onClick={()=>setPwResult(null)}>
      <div className="card" style={{maxWidth:460,width:"100%",margin:0}} onClick={e=>e.stopPropagation()}>
        <h2 style={{marginTop:0}}>🔑 ตั้งรหัสผ่านชั่วคราวแล้ว</h2>
        <p className="muted" style={{fontSize:13,lineHeight:1.7}}>
          ส่งรหัสนี้ให้ <b>{pwResult.name}</b> ทางช่องทางที่ปลอดภัย (บอกด้วยตัวเอง / Teams DM)<br/>
          <b style={{color:"#B03A2E"}}>รหัสนี้จะแสดงครั้งเดียว</b> — ปิดหน้าต่างแล้วดูซ้ำไม่ได้
        </p>
        <div className="field"><label>อีเมล</label>
          <input readOnly value={pwResult.email||""} onFocus={e=>e.target.select()}/></div>
        <div className="field"><label>รหัสผ่านชั่วคราว</label>
          <input readOnly value={pwResult.password} className="mono"
            style={{fontSize:18,letterSpacing:1,fontWeight:700,background:"#FFF8E6",borderColor:"#EBD9AE"}}
            onFocus={e=>e.target.select()}/></div>
        <div style={{display:"flex",gap:8}}>
          <button type="button" className="btn" style={{flex:1}} onClick={()=>{
            navigator.clipboard.writeText(pwResult.password).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
          }}>{copied?"✓ คัดลอกแล้ว":"คัดลอกรหัส"}</button>
          <button type="button" className="btn sec" onClick={()=>setPwResult(null)}>ปิด</button>
        </div>
      </div>
    </div>)}
  </Shell>);
}
