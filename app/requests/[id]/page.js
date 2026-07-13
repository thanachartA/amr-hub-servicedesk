"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { StatusBadge, fmtDate, fmtMoney, notify, notifyMany, uploadAttachments, openAttachment, deleteAttachment, signedUrls, isImage, fmtSize, fileIcon } from "../../../components/util";

export default function RequestDetail(){
  const { id }=useParams();
  const [r,setR]=useState(null); const [exp,setExp]=useState([]); const [log,setLog]=useState([]);
  const [team,setTeam]=useState([]); const [uid,setUid]=useState(null); const [staff,setStaff]=useState(false); const [canManage,setCanManage]=useState(false); const [canAssign,setCanAssign]=useState(false);
  const [assignee,setAssignee]=useState(""); const [msg,setMsg]=useState(null);
  const [cs,setCs]=useState(0); const [cc,setCc]=useState("");
  const [atts,setAtts]=useState([]); const [upBusy,setUpBusy]=useState(false); const [thumbs,setThumbs]=useState({});
  const load=useCallback(async()=>{
    const { data:req }=await supabase.from("hub_requests").select("*,hub_request_types(name,default_sla_hours),requester:requester_id(full_name),assignee:assignee_id(full_name),suggested:suggested_assignee_id(full_name)").eq("id",id).single();
    setR(req); setAssignee(req?.assignee_id||"");
    const { data:e }=await supabase.from("hub_expense_entries").select("*,projects(code,name,budget_amount),hub_cost_codes(code,name)").eq("request_id",id);
    setExp(e||[]);
    const { data:l }=await supabase.from("hub_activity_log").select("*,actor:actor_id(full_name)").eq("request_id",id).order("created_at",{ascending:true});
    setLog(l||[]);
    const { data:at }=await supabase.from("hub_attachments").select("*,uploader:uploaded_by(full_name)").eq("request_id",id).order("created_at",{ascending:true});
    setAtts(at||[]);
    setThumbs(await signedUrls((at||[]).filter(a=>isImage(a.mime_type)).map(a=>a.file_path), 900));
  },[id]);
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const u=sess.session.user.id; setUid(u);
    const { data:t }=await supabase.from("hub_team").select("hub_role,profiles:user_id(id,full_name)"); setTeam(t||[]);
    setStaff((t||[]).some(x=>x.profiles?.id===u));
    setCanManage((t||[]).some(x=>x.profiles?.id===u && ["owner","supervisor"].includes(x.hub_role)));
    setCanAssign((t||[]).some(x=>x.profiles?.id===u && ["owner","lead","supervisor"].includes(x.hub_role)));
    load();
  })(); },[id]);
  if(!r) return <Shell title="คำขอ"><div className="muted">กำลังโหลด…</div></Shell>;
  const leadIds=team.filter(x=>["owner","lead","supervisor"].includes(x.hub_role)).map(x=>x.profiles?.id).filter(Boolean);
  const link="/requests/"+id;
  const tk=r.ticket_no||""; const ttl=r.title||"";
  const isAssignee = uid===r.assignee_id;
  async function act(action,changes,note){
    const from=r.status;
    await supabase.from("hub_requests").update(changes).eq("id",id);
    await supabase.from("hub_activity_log").insert({request_id:id,actor_id:uid,action,from_status:from,to_status:changes.status||from,note:note||null});
    setMsg("อัปเดตแล้ว"); load();
  }
  async function assignTo(target,note){
    if(!target) return;
    await act("assign",{assignee_id:target,status:"assigned",assigned_at:new Date().toISOString()},note||"มอบหมายงาน");
    supabase.from("hub_assignments").insert({request_id:id,assignee_id:target,assigned_by:uid,is_current:true});
    notify(target,"ได้รับมอบหมายงานใหม่",tk+" · "+ttl,link,id);
  }
  async function doAssign(){ await assignTo(assignee); }
  async function doAssignSuggested(){ await assignTo(r.suggested_assignee_id,"มอบหมายตามคำแนะนำระบบ"); }
  async function doStart(){ const ch={status:"in_progress"}; if(!r.started_at) ch.started_at=new Date().toISOString(); await act("start",ch); }
  async function doWaiting(){ await act("waiting",{status:"waiting"},"รอข้อมูล"); }
  async function doSubmit(){
    await act("submit_review",{status:"review",done_at:new Date().toISOString()},"ส่งตรวจ");
    notifyMany(leadIds,"มีงานรอตรวจ",tk+" · "+ttl,link,id);
  }
  async function doApprove(){
    await act("approve",{status:"closed",reviewed_by:uid,reviewed_at:new Date().toISOString(),closed_at:new Date().toISOString()},"อนุมัติและปิดงาน");
    notify(r.requester_id,"งานของคุณเสร็จแล้ว",tk+" · "+ttl,link,id);
  }
  async function doReject(){
    const note=prompt("เหตุผลที่ตีกลับ (ให้ผู้รับผิดชอบแก้ไข):");
    if(note===null) return;
    await act("reject",{status:"in_progress",rework_count:(r.rework_count||0)+1,review_note:note},"ตีกลับแก้ไข: "+note);
    notify(r.assignee_id,"งานถูกตีกลับให้แก้ไข",tk+" · "+(note||""),link,id);
  }
  async function addFiles(e){
    const fs=[...(e.target.files||[])]; if(!fs.length) return;
    setUpBusy(true); setMsg(null);
    const errs=await uploadAttachments(id, uid, fs);
    setUpBusy(false); e.target.value="";
    setMsg(errs.length ? ("แนบไม่สำเร็จบางไฟล์: "+errs.join(" · ")) : "แนบไฟล์แล้ว");
    load();
  }
  async function removeFile(a){
    if(!confirm('ลบไฟล์ "'+a.file_name+'" ?')) return;
    const err=await deleteAttachment(a);
    setMsg(err ? ("ลบไม่สำเร็จ: "+err) : "ลบไฟล์แล้ว");
    load();
  }
  async function submitCsat(){
    if(!cs) return;
    await supabase.from("hub_requests").update({csat_rating:cs,csat_comment:cc||null,csat_at:new Date().toISOString()}).eq("id",id);
    setMsg("ขอบคุณสำหรับการประเมิน"); load();
  }
  const now=new Date();
  const active=["assigned","in_progress","waiting"].includes(r.status);
  const canRate = r.status==="closed" && uid===r.requester_id;
  return (<Shell title={"คำขอ "+(r.ticket_no||"")}>
    {msg&&<div className="ok">{msg}</div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:18}}>
      <div>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><span className="mono">{r.ticket_no}</span> &nbsp; <StatusBadge s={r.status}/>
              {r.rework_count>0&&<span className="tag" style={{marginLeft:6,background:"#FBF1DE",color:"#9A5B00"}}>ตีกลับ {r.rework_count} ครั้ง</span>}</div>
            <span className="tag">{r.hub_request_types?.name}</span>
          </div>
          <h2 style={{fontSize:18}}>{r.title}</h2>
          <p className="muted" style={{whiteSpace:"pre-wrap",margin:"8px 0"}}>{r.detail||"—"}</p>
          <div className="muted">ผู้ขอ: {r.requester?.full_name||"—"} · ความเร่งด่วน: {r.priority} · ครบ SLA: {fmtDate(r.sla_due_at)}
            {r.sla_due_at&&new Date(r.sla_due_at)<now&&!["review","closed","cancelled"].includes(r.status)&&<b style={{color:"#B03A2E"}}> · เกิน SLA</b>}</div>
          {r.review_note&&["in_progress","assigned","waiting"].includes(r.status)&&r.rework_count>0&&
            <div style={{marginTop:8,padding:"8px 10px",background:"#FBF1DE",borderRadius:6,fontSize:13,color:"#9A5B00"}}>ตีกลับให้แก้: {r.review_note}</div>}
        </div>

        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h2 style={{margin:0}}>ไฟล์แนบ ({atts.length})</h2>
            {(staff||uid===r.requester_id)&&<label className="btn sm sec" style={{cursor:"pointer",margin:0}}>
              {upBusy?"กำลังอัปโหลด…":"+ แนบไฟล์"}
              <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" disabled={upBusy}
                onChange={addFiles} style={{display:"none"}}/>
            </label>}
          </div>
          {atts.length===0&&<div className="muted" style={{fontSize:13}}>ยังไม่มีไฟล์แนบ</div>}
          <div style={{display:"grid",gap:6}}>
            {atts.map(a=>{ const canDel = canManage || a.uploaded_by===uid; const th=thumbs[a.file_path];
              return (<div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"#F6F7F9",border:"1px solid #E4E7EB",borderRadius:8,padding:"8px 12px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                {th
                  ? <img src={th} alt={a.file_name} onClick={()=>openAttachment(a.file_path)}
                      style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:"1px solid #DDE3E8",cursor:"pointer",flexShrink:0,background:"#fff"}}/>
                  : <div style={{width:52,height:52,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,borderRadius:6,border:"1px solid #DDE3E8",background:"#fff",flexShrink:0}}>{fileIcon(a.mime_type)}</div>}
                <div style={{fontSize:13,minWidth:0}}>
                  <b style={{wordBreak:"break-all"}}>{a.file_name}</b>
                  <div className="muted" style={{fontSize:11,marginTop:2}}>{fmtSize(a.size_bytes)} · {a.uploader?.full_name||"—"} · {fmtDate(a.created_at)}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="btn sm" onClick={async()=>{ const ok=await openAttachment(a.file_path); if(!ok) setMsg("เปิดไฟล์ไม่สำเร็จ (ไม่มีสิทธิ์ หรือไฟล์หาย)"); }}>เปิด</button>
                {canDel&&<button className="btn sm sec" style={{color:"#B03A2E"}} onClick={()=>removeFile(a)}>ลบ</button>}
              </div>
            </div>); })}
          </div>
        </div>

        {canRate&&(<div className="card">
          <h2>ประเมินความพึงพอใจ (CSAT)</h2>
          {r.csat_rating?(
            <div className="muted">ให้คะแนนแล้ว: <span style={{color:"#F5A623",fontSize:18}}>{"★".repeat(r.csat_rating)}{"☆".repeat(5-r.csat_rating)}</span>{r.csat_comment?(" · "+r.csat_comment):""}</div>
          ):(<>
            <div style={{fontSize:30,letterSpacing:6,userSelect:"none"}}>
              {[1,2,3,4,5].map(n=>(<span key={n} onClick={()=>setCs(n)} style={{cursor:"pointer",color:n<=cs?"#F5A623":"#D0D6DC"}}>★</span>))}
            </div>
            <textarea placeholder="ความคิดเห็นเพิ่มเติม (ถ้ามี)" value={cc} onChange={e=>setCc(e.target.value)} style={{marginTop:8}}/>
            <button className="btn sm" disabled={!cs} onClick={submitCsat} style={{marginTop:6}}>ส่งคะแนน</button>
          </>)}
        </div>)}

        {exp.length>0&&(<div className="card"><h2>ค่าใช้จ่ายโครงการ</h2>
          <table><thead><tr><th>โครงการ</th><th>Cost Code</th><th className="right">จำนวนเงิน</th><th>อนุมัติ</th><th></th></tr></thead>
          <tbody>{exp.map(x=>(<tr key={x.id}>
            <td>{x.projects?<span>{x.projects.code} · {x.projects.name}</span>:<span className="muted">—</span>}</td>
            <td>{x.hub_cost_codes?x.hub_cost_codes.code:"—"}</td>
            <td className="right">{fmtMoney(x.amount)}</td>
            <td><span className="tag">{x.approval_status}</span></td>
            <td className="right">{canManage&&x.approval_status==="pending"&&<button className="btn sm" onClick={async()=>{await supabase.from("hub_expense_entries").update({approval_status:"approved",approved_by:uid}).eq("id",x.id);load();}}>อนุมัติ</button>}</td>
          </tr>))}</tbody></table></div>)}
        <div className="card"><h2>Timeline</h2>
          {log.map(l=>(<div key={l.id} style={{padding:"7px 0",borderBottom:"1px solid #EEF1F3",fontSize:13}}>
            <b>{l.action}</b> {l.from_status&&l.to_status&&<span className="muted">{l.from_status} → {l.to_status}</span>} {l.note&&<span> · {l.note}</span>}
            <div className="muted" style={{fontSize:11}}>{l.actor?.full_name||"ระบบ"} · {fmtDate(l.created_at)}</div></div>))}
          {!log.length&&<div className="muted">—</div>}
        </div>
      </div>
      <div>
        <div className="card"><h2>การดำเนินการ</h2>
          {!staff&&<div className="muted">เฉพาะทีม Hub เท่านั้นที่จัดการได้</div>}
          {staff&&<>
            {canAssign&&!r.assignee_id&&(r.suggested_assignee_id
              ? <div style={{background:"#EEF4FF",border:"1px solid #C7D9F7",borderRadius:10,padding:"10px 12px",marginBottom:12}}>
                  <div style={{fontSize:12,color:"#2D6CDF",fontWeight:700,marginBottom:2}}>🤖 ระบบแนะนำ</div>
                  <div style={{fontSize:14,fontWeight:700,color:"#202028"}}>{r.suggested?.full_name}</div>
                  <div className="muted" style={{fontSize:11,marginTop:2}}>{r.suggested_reason}</div>
                  <button className="btn sm" style={{width:"100%",marginTop:8}} onClick={doAssignSuggested}>✓ มอบหมายตามคำแนะนำ</button>
                </div>
              : <div style={{background:"#FBF1DE",border:"1px solid #EBD9AE",borderRadius:10,padding:"10px 12px",marginBottom:12,fontSize:12.5,color:"#9A5B00"}}>
                  ⚠ ระบบไม่มีคำแนะนำสำหรับงานนี้ (ยังไม่ตั้งเจ้าประจำ หรือเจ้าประจำ/ตัวสำรองลา) — กรุณาเลือกผู้รับผิดชอบเอง
                </div>)}

            {canAssign&&<>
              <div className="field"><label>มอบหมายให้</label>
                <select value={assignee} onChange={e=>setAssignee(e.target.value)}>
                  <option value="">— เลือกสมาชิก —</option>
                  {team.map(m=>(<option key={m.profiles?.id} value={m.profiles?.id}>{m.profiles?.full_name}{["owner","lead"].includes(m.hub_role)?" (Lead)":m.hub_role==="supervisor"?" (Sup.)":""}</option>))}</select></div>
              <button className="btn sm" style={{marginBottom:10,width:"100%"}} disabled={!assignee} onClick={doAssign}>มอบหมาย</button>
            </>}

            {active&&(canAssign||isAssignee)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <button className="btn sm sec" onClick={doStart}>เริ่มทำ</button>
              <button className="btn sm sec" onClick={doWaiting}>รอข้อมูล</button>
              <button className="btn sm" style={{gridColumn:"1 / span 2"}} onClick={doSubmit}>ส่งตรวจ ✓</button>
            </div>}

            {r.status==="review"&&<div style={{marginTop:4}}>
              {canAssign?<>
                <div className="muted" style={{fontSize:12,marginBottom:8}}>ตรวจความถูกต้องก่อนปิดงาน</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                  <button className="btn sm" onClick={doApprove}>อนุมัติ/ปิดงาน</button>
                  <button className="btn sm sec" onClick={doReject}>ตีกลับ</button>
                </div>
              </>:<div className="muted" style={{fontSize:13}}>⏳ ส่งตรวจแล้ว — รอหัวหน้าทีมอนุมัติ</div>}
            </div>}

            {r.status==="closed"&&<div className="muted" style={{fontSize:13}}>✓ ปิดงานแล้ว</div>}
            {!canAssign&&!isAssignee&&active&&<div className="muted" style={{fontSize:13}}>ยังไม่ได้รับมอบหมายงานนี้</div>}
          </>}
        </div>
      </div>
    </div>
  </Shell>);
}
