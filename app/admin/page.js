"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { downloadCSV, parseCSV } from "../../components/util";

const MODE_TH={skill:"เจ้าประจำ (Skill)",load:"กระจายตามโหลด (Load)",round_robin:"วนคิว (Round-robin)"};

export default function Admin(){
  const [canManage,setCanManage]=useState(false); const [ready,setReady]=useState(false);
  const [rows,setRows]=useState([]); const [team,setTeam]=useState({}); const [q,setQ]=useState(""); const [msg,setMsg]=useState(null);
  const [types,setTypes]=useState([]); const [staff,setStaff]=useState([]);
  const [projects,setProjects]=useState([]); const [pq,setPq]=useState(""); const [onlyUnset,setOnlyUnset]=useState(false);
  const [impBusy,setImpBusy]=useState(false); const [impResult,setImpResult]=useState(null);
  async function load(){
    const { data:prof }=await supabase.from("profiles").select("id,full_name,email,department,position,employee_id,role").order("full_name").limit(2000);
    const { data:t }=await supabase.from("hub_team").select("user_id,hub_role,is_available,profiles:user_id(id,full_name,email)");
    const map={}; (t||[]).forEach(x=>map[x.user_id]=x.hub_role);
    setRows(prof||[]); setTeam(map);
    setStaff((t||[]).filter(x=>x.profiles).map(x=>({id:x.profiles.id,name:x.profiles.full_name,email:x.profiles.email,role:x.hub_role,avail:x.is_available})));
    const { data:rt }=await supabase.from("hub_request_types").select("id,name,category,routing_mode,primary_owner_id,backup_owner_id,default_sla_hours").eq("is_active",true).order("sort_order");
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
    setCanManage(["owner","supervisor"].includes(t?.hub_role)); setReady(true); load();
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
      <h2>สิทธิ์ผู้ใช้</h2>
      <div className="field" style={{maxWidth:340}}><label>ค้นหา ชื่อ / อีเมล</label><input value={q} onChange={e=>setQ(e.target.value)} placeholder="พิมพ์เพื่อค้นหา…"/></div>
      <table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>ฝ่าย / ตำแหน่ง</th><th>สิทธิ์ใน Hub</th></tr></thead>
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
        </tr>); })}
        {!shown.length&&<tr><td colSpan="4" className="muted">ไม่พบผู้ใช้</td></tr>}</tbody></table>
      <p className="muted" style={{marginTop:10}}><b>Owner</b> = ทุก module · <b>Supervisor</b> = จัดการเต็ม (มอบหมาย+ตรวจ+อนุมัติค่าใช้จ่าย+จัดการผู้ใช้) · <b>Lead</b> = มอบหมาย+ตรวจงาน+เห็นทั้งหมด · <b>Agent</b> = เห็นเฉพาะงานที่ได้รับ · <b>ผู้ขอ</b> = เปิดคำขอ+ดูของตัวเอง</p>
    </div>
  </Shell>);
}
