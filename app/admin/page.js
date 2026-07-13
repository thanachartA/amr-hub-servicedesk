"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";

const MODE_TH={skill:"เจ้าประจำ (Skill)",load:"กระจายตามโหลด (Load)",round_robin:"วนคิว (Round-robin)"};

export default function Admin(){
  const [canManage,setCanManage]=useState(false); const [ready,setReady]=useState(false);
  const [rows,setRows]=useState([]); const [team,setTeam]=useState({}); const [q,setQ]=useState(""); const [msg,setMsg]=useState(null);
  const [types,setTypes]=useState([]); const [staff,setStaff]=useState([]);
  const [projects,setProjects]=useState([]); const [pq,setPq]=useState(""); const [onlyUnset,setOnlyUnset]=useState(false);
  async function load(){
    const { data:prof }=await supabase.from("profiles").select("id,full_name,email,department,position,employee_id,role").order("full_name").limit(2000);
    const { data:t }=await supabase.from("hub_team").select("user_id,hub_role,is_available,profiles:user_id(id,full_name)");
    const map={}; (t||[]).forEach(x=>map[x.user_id]=x.hub_role);
    setRows(prof||[]); setTeam(map);
    setStaff((t||[]).filter(x=>x.profiles).map(x=>({id:x.profiles.id,name:x.profiles.full_name,role:x.hub_role,avail:x.is_available})));
    const { data:rt }=await supabase.from("hub_request_types").select("id,name,category,routing_mode,primary_owner_id,backup_owner_id,default_sla_hours").eq("is_active",true).order("sort_order");
    setTypes(rt||[]);
    const { data:pj }=await supabase.from("projects").select("id,code,name,hub_owner_id,hub_backup_owner_id").order("code").limit(500);
    setProjects(pj||[]);
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
