"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { StatusBadge, fmtDate, fmtMoney, notify, notifyMany, uploadAttachments, openAttachment, deleteAttachment, signedUrls, isImage, fmtSize, fileIcon } from "../../../components/util";
import DynForm, { DynView } from "../../../components/DynForm";

const APV_TH={
  not_required:"ไม่ต้องอนุมัติ", pending_supervisor:"⏳ รอ Supervisor", pending_owner:"⏳ รอ Owner",
  approved:"✅ อนุมัติแล้ว", rejected:"❌ ไม่อนุมัติ",
};
const APV_STYLE={
  pending_supervisor:{background:"#FFF8E6",color:"#8A5A00",borderColor:"#EBD9AE"},
  pending_owner:{background:"#FDECEE",color:"#B03A2E",borderColor:"#F3C9CE"},
  approved:{background:"#E4F3EA",color:"#2E7D5B",borderColor:"#B7DEC8"},
  rejected:{background:"#F2F4F6",color:"#5A6672"},
};

export default function RequestDetail(){
  const { id }=useParams();
  const [r,setR]=useState(null); const [exp,setExp]=useState([]); const [log,setLog]=useState([]);
  const [team,setTeam]=useState([]); const [uid,setUid]=useState(null); const [staff,setStaff]=useState(false); const [canManage,setCanManage]=useState(false); const [canAssign,setCanAssign]=useState(false);
  const [assignee,setAssignee]=useState(""); const [msg,setMsg]=useState(null);
  const [cs,setCs]=useState(0); const [cc,setCc]=useState("");
  const [atts,setAtts]=useState([]); const [upBusy,setUpBusy]=useState(false); const [thumbs,setThumbs]=useState({});
  // อนุมัติค่าใช้จ่าย 2 ชั้น
  const [role,setRole]=useState(null); const [threshold,setThreshold]=useState(100000);
  const [apvBusy,setApvBusy]=useState(null); const [expErr,setExpErr]=useState(null);
  // แก้ไขคำขอ (ผู้ขอ ตอน new)
  const [editing,setEditing]=useState(false); const [editDraft,setEditDraft]=useState({detail:"",form_data:{},priority:"normal"});
  const names=Object.fromEntries(team.filter(x=>x.profiles).map(x=>[x.profiles.id, x.profiles.full_name]));

  async function decide(x, action){
    setExpErr(null);
    let reason=null;
    if(action==="reject"){
      reason=prompt("เหตุผลที่ไม่อนุมัติ (จะแจ้งกลับผู้ขอ):","");
      if(reason===null) return;
    } else {
      const nxt = Number(x.amount)>threshold && x.approval_status==="pending_supervisor"
        ? "จะส่งต่อให้ Owner อนุมัติชั้นสุดท้าย" : "จะอนุมัติทันที (จบ loop)";
      if(!confirm("อนุมัติ "+fmtMoney(x.amount)+" บาท ?\n\n"+nxt)) return;
    }
    setApvBusy(x.id);
    const { data, error }=await supabase.rpc("hub_expense_decide",
      { p_entry:x.id, p_action:action, p_reason:reason });
    setApvBusy(null);
    if(error){ setExpErr(error.message); return; }
    setMsg(data==="pending_owner" ? "อนุมัติชั้น Supervisor แล้ว — ส่งต่อ Owner อนุมัติชั้นสุดท้าย"
        : data==="approved" ? "อนุมัติเรียบร้อย" : "บันทึกไม่อนุมัติแล้ว");
    load();
  }
  async function markPosted(x){
    setExpErr(null);
    const on=!x.posted_to_erp;
    if(!confirm(on
      ? "ยืนยันว่าคีย์รายการนี้เข้า ERP แล้ว?\n\nยอดนี้จะไปนับจากฝั่ง ERP แทน (กันนับซ้ำในงบโครงการ)"
      : "ยกเลิกสถานะ 'ลง ERP แล้ว' ?\n\nยอดนี้จะกลับมานับในงบฝั่ง Hub")) return;
    setApvBusy(x.id);
    const { error }=await supabase.from("hub_expense_entries").update({posted_to_erp:on}).eq("id",x.id);
    setApvBusy(null);
    if(error){ setExpErr(error.message); return; }
    load();
  }
  const load=useCallback(async()=>{
    const { data:req }=await supabase.from("hub_requests").select("*,hub_request_types(name,default_sla_hours,form_schema,doc_slots),requester:requester_id(full_name),assignee:assignee_id(full_name),suggested:suggested_assignee_id(full_name),project:project_id(code,name)").eq("id",id).single();
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
    setRole((t||[]).find(x=>x.profiles?.id===u)?.hub_role || null);
    const { data:s }=await supabase.from("hub_settings").select("value").eq("key","expense_approval_threshold").maybeSingle();
    if(s?.value!=null) setThreshold(Number(s.value)||100000);
    load();
  })(); },[id]);
  if(!r) return <Shell title="คำขอ"><div className="muted">กำลังโหลด…</div></Shell>;
  // เช็คลิสต์เอกสารตามประเภทงาน
  const slots = Array.isArray(r.hub_request_types?.doc_slots) ? r.hub_request_types.doc_slots : [];
  const bySlot = {};
  atts.forEach(a=>{ if(a.slot_key){ (bySlot[a.slot_key]=bySlot[a.slot_key]||[]).push(a); } });
  const noSlot = atts.filter(a=>!a.slot_key);
  const slotLabel = Object.fromEntries(slots.map(s=>[s.key,s.label]));
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
  // ยกเลิกมอบหมาย → กลับเป็น 'new' เพื่อให้ผู้ขอกลับมาแก้ไขได้
  async function doUnassign(){
    if(!confirm("ยกเลิกการมอบหมายงานนี้?\n\nงานจะกลับเป็น \"ใหม่\" และผู้ขอจะกลับมาแก้ไข/เพิ่มเอกสารได้อีกครั้ง")) return;
    const prevAssignee=r.assignee_id;
    await act("unassign",{assignee_id:null,status:"new",assigned_at:null,started_at:null},"ยกเลิกมอบหมาย — เปิดให้ผู้ขอแก้ไข");
    await supabase.from("hub_assignments").update({is_current:false}).eq("request_id",id);
    setAssignee("");
    if(prevAssignee) notify(prevAssignee,"งานถูกยกเลิกการมอบหมาย",tk+" · "+ttl,link,id);
    notify(r.requester_id,"เปิดให้แก้ไขคำขอได้แล้ว",tk+" · "+ttl+" — หัวหน้ายกเลิกการมอบหมายเพื่อให้คุณแก้ไข",link,id);
  }
  async function doStart(){ const ch={status:"in_progress"}; if(!r.started_at) ch.started_at=new Date().toISOString(); await act("start",ch); }
  async function doWaiting(){
    const note=prompt("รอข้อมูลอะไร? (แจ้งให้ผู้ขอทราบว่าต้องส่งอะไรเพิ่ม):","");
    if(note===null) return;
    if(!note.trim()){ setMsg("กรุณาระบุว่ารอข้อมูลอะไร"); return; }
    await act("waiting",{status:"waiting",waiting_note:note.trim()},"รอข้อมูล: "+note.trim());
    notify(r.requester_id,"งานของคุณรอข้อมูลเพิ่มเติม",tk+" · "+note.trim(),link,id);
  }
  async function doSubmit(){
    // ⛔ ต้องแนบไฟล์ผลงาน (PDF) ก่อนส่งตรวจ
    const resultFiles=atts.filter(a=>a.slot_key==="result" || (a.mime_type||"").includes("pdf"));
    if(resultFiles.length===0){
      setMsg("⛔ ต้องแนบไฟล์ผลงาน (PDF เช่น หน้า OF / Billing) ก่อนส่งตรวจ — กด \"+ แนบผลงาน (PDF)\" ด้านล่าง");
      window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
      return;
    }
    await act("submit_review",{status:"review",done_at:new Date().toISOString()},"ส่งตรวจ");
    notifyMany(leadIds,"มีงานรอตรวจ",tk+" · "+ttl,link,id);
  }
  async function addResult(e){
    const fs=[...(e.target.files||[])]; if(!fs.length) return;
    setUpBusy(true); setMsg(null);
    const errs=await uploadAttachments(id, uid, fs, "result");
    setUpBusy(false); e.target.value="";
    setMsg(errs.length ? ("แนบไม่สำเร็จ: "+errs.join(" · ")) : "แนบไฟล์ผลงานแล้ว");
    load();
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
  // ผู้ขอแก้เนื้อหาคำขอได้เฉพาะตอนยัง 'new' · staff แก้ได้ตลอด
  const canEditRequest = (staff) || (uid===r.requester_id && r.status==="new");
  const canAttach = staff || (uid===r.requester_id && r.status==="new");
  async function saveEdit(){
    setMsg(null);
    const { error }=await supabase.from("hub_requests")
      .update({ detail:editDraft.detail, form_data:editDraft.form_data, priority:editDraft.priority })
      .eq("id",id);
    if(error){ setMsg("บันทึกไม่สำเร็จ: "+error.message); return; }
    await supabase.from("hub_activity_log").insert({request_id:id,actor_id:uid,action:"edit",from_status:r.status,to_status:r.status,note:"แก้ไขข้อมูลคำขอ"});
    setEditing(false); setMsg("บันทึกการแก้ไขแล้ว"); load();
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
          {r.project&&<div style={{margin:"6px 0"}}><span className="tag" style={{background:"#EEF4FF",borderColor:"#C7D9F7",color:"#2D6CDF"}}>📁 {r.project.code} · {r.project.name}</span></div>}
          <p className="muted" style={{whiteSpace:"pre-wrap",margin:"8px 0"}}>{r.detail||"—"}</p>
          <div className="muted">ผู้ขอ: {r.requester?.full_name||"—"} · ความเร่งด่วน: {r.priority} · ครบ SLA: {fmtDate(r.sla_due_at)}
            {r.sla_due_at&&new Date(r.sla_due_at)<now&&!["review","closed","cancelled"].includes(r.status)&&<b style={{color:"#B03A2E"}}> · เกิน SLA</b>}</div>
          {r.review_note&&["in_progress","assigned","waiting"].includes(r.status)&&r.rework_count>0&&
            <div style={{marginTop:8,padding:"8px 10px",background:"#FBF1DE",borderRadius:6,fontSize:13,color:"#9A5B00"}}>ตีกลับให้แก้: {r.review_note}</div>}
          {r.status==="waiting"&&r.waiting_note&&
            <div style={{marginTop:8,padding:"8px 10px",background:"#FFF4E0",borderRadius:6,fontSize:13,color:"#8A5A00"}}>
              ⏳ <b>ทีมงานรอข้อมูลเพิ่มเติม:</b> {r.waiting_note}</div>}
        </div>

        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <h2 style={{margin:0}}>📋 ข้อมูลสำหรับดำเนินการ</h2>
            {uid===r.requester_id && !editing && (
              r.status==="new"
                ? <button className="btn sm sec" onClick={()=>{ setEditDraft({detail:r.detail||"",form_data:{...(r.form_data||{})},priority:r.priority||"normal"}); setEditing(true); }}>✏️ แก้ไขคำขอ</button>
                : <span className="muted" style={{fontSize:11.5}}>🔒 แก้ไขไม่ได้ (ถูกมอบหมายแล้ว)</span>
            )}
          </div>
          {!editing
            ? <DynView schema={r.hub_request_types?.form_schema} data={r.form_data||{}}/>
            : (<div>
                <div style={{background:"#FFF8E6",border:"1px solid #EBD9AE",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12.5,color:"#8A5A00"}}>
                  แก้ไขได้เฉพาะตอนที่งานยัง "ใหม่" (ยังไม่ถูกมอบหมาย) — เมื่อบันทึกแล้วกด "ส่งใหม่" ไม่ต้อง
                </div>
                <DynForm schema={r.hub_request_types?.form_schema} data={editDraft.form_data}
                  onChange={fd=>setEditDraft(d=>({...d,form_data:fd}))}/>
                <div className="field"><label>ความเร่งด่วน</label>
                  <select value={editDraft.priority} onChange={e=>setEditDraft(d=>({...d,priority:e.target.value}))}>
                    <option value="low">ต่ำ</option><option value="normal">ปกติ</option><option value="high">สูง</option><option value="urgent">ด่วนมาก</option>
                  </select></div>
                <div className="field"><label>หมายเหตุเพิ่มเติม</label>
                  <textarea value={editDraft.detail} onChange={e=>setEditDraft(d=>({...d,detail:e.target.value}))}/></div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn sm" onClick={saveEdit}>💾 บันทึกการแก้ไข</button>
                  <button className="btn sm sec" onClick={()=>setEditing(false)}>ยกเลิก</button>
                </div>
              </div>)}
        </div>

        {slots.length>0&&(<div className="card">
          <h2>📎 เช็คลิสต์เอกสาร ({slots.filter(s=>s.required&&bySlot[s.key]?.length).length}/{slots.filter(s=>s.required).length})</h2>
          <div style={{display:"grid",gap:6}}>
            {slots.map(s=>{
              const has=bySlot[s.key]||[];
              const ok=has.length>0;
              return (<div key={s.key} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:8,
                border:"1px solid "+(ok?"#B7DEC8":s.required?"#F3C9CE":"#E4E7EB"),
                background:ok?"#F6FBF8":s.required?"#FFFBFB":"#fff"}}>
                <span style={{fontSize:15}}>{ok?"✅":s.required?"❌":"⬜"}</span>
                <b style={{fontSize:13,flex:1}}>{s.label}
                  {s.required&&<span style={{color:"#B03A2E"}}> *</span>}</b>
                {ok
                  ? <span style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {has.map(a=>(<a key={a.id} href="#" onClick={e=>{e.preventDefault();openAttachment(a.file_path);}}
                        style={{fontSize:11.5,color:"#2D6CDF",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {fileIcon(a.mime_type,a.file_name)} {a.file_name}</a>))}
                    </span>
                  : <span className="muted" style={{fontSize:11.5,color:s.required?"#B03A2E":"#98A4AE"}}>
                      {s.required?"ยังไม่มี":"ไม่บังคับ"}</span>}
              </div>);
            })}
          </div>
          {noSlot.length>0&&<p className="muted" style={{fontSize:11.5,marginTop:8}}>
            + เอกสารอื่น ๆ ที่ไม่ได้อยู่ในเช็คลิสต์ {noSlot.length} ไฟล์ (ดูด้านล่าง)</p>}
        </div>)}

        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <h2 style={{margin:0}}>ไฟล์แนบทั้งหมด ({atts.length})</h2>
            {canAttach
              ? <label className="btn sm sec" style={{cursor:"pointer",margin:0}}>
                  {upBusy?"กำลังอัปโหลด…":"+ แนบไฟล์"}
                  <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" disabled={upBusy}
                    onChange={addFiles} style={{display:"none"}}/>
                </label>
              : (uid===r.requester_id && <span className="muted" style={{fontSize:11.5}}>🔒 แนบ/ลบไม่ได้ (ถูกมอบหมายแล้ว)</span>)}
          </div>
          {atts.length===0&&<div className="muted" style={{fontSize:13}}>ยังไม่มีไฟล์แนบ</div>}
          <div style={{display:"grid",gap:6}}>
            {atts.map(a=>{ const canDel = canManage || (a.uploaded_by===uid && (staff || r.status==="new")); const th=thumbs[a.file_path];
              return (<div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"#F6F7F9",border:"1px solid #E4E7EB",borderRadius:8,padding:"8px 12px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                {th
                  ? <img src={th} alt={a.file_name} onClick={()=>openAttachment(a.file_path)}
                      style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:"1px solid #DDE3E8",cursor:"pointer",flexShrink:0,background:"#fff"}}/>
                  : <div style={{width:52,height:52,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,borderRadius:6,border:"1px solid #DDE3E8",background:"#fff",flexShrink:0}}>{fileIcon(a.mime_type)}</div>}
                <div style={{fontSize:13,minWidth:0}}>
                  {a.slot_key&&<div><span className="tag" style={{fontSize:10,background:"#EEF4FF",color:"#2D6CDF",borderColor:"#C7D9F7"}}>
                    {slotLabel[a.slot_key]||a.slot_key}</span></div>}
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

        {exp.length>0&&(<div className="card"><h2>💰 ค่าใช้จ่าย & การอนุมัติ</h2>
          <p className="muted" style={{fontSize:12,marginTop:-4,lineHeight:1.8}}>
            ไม่เกิน <b>{fmtMoney(threshold)}</b> → Supervisor อนุมัติจบ ·
            เกิน <b>{fmtMoney(threshold)}</b> → Supervisor ตรวจก่อน แล้ว<b>ส่งต่อ Owner</b>
          </p>
          {expErr&&<div className="err">{expErr}</div>}
          <table><thead><tr>
            <th>โครงการ</th><th>Cost Code</th><th className="right">จำนวนเงิน</th>
            <th>สถานะอนุมัติ</th><th className="right">การดำเนินการ</th>
          </tr></thead>
          <tbody>{exp.map(x=>{
            const st=x.approval_status;
            const over=Number(x.amount)>threshold;
            const canAct = (st==="pending_supervisor" && (role==="owner"||role==="supervisor"))
                        || (st==="pending_owner" && role==="owner");
            return (<tr key={x.id}>
              <td>{x.projects?<span>{x.projects.code} · {x.projects.name}</span>:<span className="muted">—</span>}</td>
              <td>{x.hub_cost_codes?x.hub_cost_codes.code:"—"}</td>
              <td className="right"><b>{fmtMoney(x.amount)}</b>
                {over&&<div style={{fontSize:10.5,color:"#B26A00"}}>เกินวงเงิน</div>}</td>
              <td>
                <span className="tag" style={APV_STYLE[st]||{}}>{APV_TH[st]||st}</span>
                {x.supervisor_at&&<div className="muted" style={{fontSize:10.5,marginTop:3}}>
                  Sup: {names[x.supervisor_by]||"—"} · {fmtDate(x.supervisor_at)}</div>}
                {x.owner_at&&<div className="muted" style={{fontSize:10.5}}>
                  Owner: {names[x.owner_by]||"—"} · {fmtDate(x.owner_at)}</div>}
                {x.reject_reason&&<div style={{fontSize:10.5,color:"#B03A2E"}}>เหตุผล: {x.reject_reason}</div>}
                {st==="approved"&&x.posted_to_erp&&<div style={{fontSize:10.5,color:"#2E7D5B",marginTop:3}}>🧾 คีย์เข้า ERP แล้ว</div>}
              </td>
              <td className="right">
                {canAct ? (<div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  <button className="btn sm" disabled={apvBusy===x.id} onClick={()=>decide(x,"approve")}>
                    {apvBusy===x.id?"…":(st==="pending_owner"?"✅ อนุมัติ (Owner)":"✅ อนุมัติ")}
                  </button>
                  <button className="btn sm sec" style={{color:"#B03A2E"}} disabled={apvBusy===x.id}
                    onClick={()=>decide(x,"reject")}>ไม่อนุมัติ</button>
                </div>)
                : st==="pending_owner" ? <span className="muted" style={{fontSize:11.5}}>รอ Owner</span>
                : st==="pending_supervisor" ? <span className="muted" style={{fontSize:11.5}}>รอ Supervisor</span>
                : st==="approved" && canManage ? (
                    <button className="btn sm sec" disabled={apvBusy===x.id}
                      onClick={()=>markPosted(x)}
                      title="ทำเครื่องหมายว่าคีย์เข้า ERP แล้ว เพื่อกันนับซ้ำในงบ"
                      style={x.posted_to_erp?{color:"#2E7D5B",borderColor:"#B7DEC8"}:{}}>
                      {apvBusy===x.id?"…":(x.posted_to_erp?"🧾 ลง ERP แล้ว ✓":"ทำเครื่องหมายลง ERP")}
                    </button>)
                : <span className="muted">—</span>}
              </td>
            </tr>);
          })}</tbody></table></div>)}
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

            {active&&(canAssign||isAssignee)&&(()=>{
              const hasResult=atts.some(a=>a.slot_key==="result"||(a.mime_type||"").includes("pdf"));
              return (<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <button className="btn sm sec" onClick={doStart}>เริ่มทำ</button>
                <button className="btn sm sec" onClick={doWaiting}>รอข้อมูล</button>
                {/* แนบไฟล์ผลงาน (PDF) ก่อนส่งตรวจ */}
                <label className="btn sm sec" style={{gridColumn:"1 / span 2",cursor:"pointer",margin:0,
                  borderColor:hasResult?"#B7DEC8":"#EBD9AE",background:hasResult?"#F6FBF8":"#FFF8E6"}}>
                  {upBusy?"กำลังอัปโหลด…":hasResult?"✅ แนบผลงานแล้ว — แนบเพิ่ม":"📎 แนบผลงาน (PDF) ก่อนส่งตรวจ *"}
                  <input type="file" multiple accept=".pdf,image/*" disabled={upBusy} onChange={addResult} style={{display:"none"}}/>
                </label>
                <button className="btn sm" style={{gridColumn:"1 / span 2"}} disabled={!hasResult} onClick={doSubmit}
                  title={hasResult?"":"ต้องแนบผลงาน (PDF) ก่อน"}>
                  {hasResult?"ส่งตรวจ ✓":"🔒 ส่งตรวจ (แนบ PDF ก่อน)"}
                </button>
              </div>);
            })()}

            {/* ยกเลิกมอบหมาย → เปิดให้ผู้ขอกลับมาแก้ไข */}
            {canAssign&&r.assignee_id&&["assigned","in_progress","waiting"].includes(r.status)&&(
              <div style={{marginTop:10,paddingTop:10,borderTop:"1px dashed #E4E7EB"}}>
                <button className="btn sm sec" style={{width:"100%",color:"#B03A2E"}} onClick={doUnassign}>
                  ↩ ยกเลิกมอบหมาย (เปิดให้ผู้ขอแก้ไข)
                </button>
                <div className="muted" style={{fontSize:11,marginTop:4,lineHeight:1.6}}>
                  งานจะกลับเป็น "ใหม่" · ผู้ขอกลับมาแก้ไข/เพิ่มเอกสาร แล้วส่งอีกครั้ง
                </div>
              </div>)}

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
