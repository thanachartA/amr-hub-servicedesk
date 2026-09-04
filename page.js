"use client";
import { useEffect, useState, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { StatusBadge, fmtDate, fmtMoney, notify, notifyMany, uploadAttachments, openAttachment, deleteAttachment, deleteRequestDeep, signedUrls, isImage, fmtSize, fileIcon, isLink, openLink, addLink } from "../../../components/util";
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
  const [r,setR]=useState(null); const [exp,setExp]=useState([]); const [expLines,setExpLines]=useState([]); const [log,setLog]=useState([]);
  const [team,setTeam]=useState([]); const [uid,setUid]=useState(null); const [staff,setStaff]=useState(false); const [canManage,setCanManage]=useState(false); const [canAssign,setCanAssign]=useState(false);
  const [types,setTypes]=useState([]); const [editType,setEditType]=useState(false); const [newType,setNewType]=useState(""); const [typeBusy,setTypeBusy]=useState(false);
  const [assignee,setAssignee]=useState(""); const [msg,setMsg]=useState(null);
  const [cs,setCs]=useState(0); const [cc,setCc]=useState("");
  const [atts,setAtts]=useState([]); const [upBusy,setUpBusy]=useState(false); const [thumbs,setThumbs]=useState({});
  const [linkUrl,setLinkUrl]=useState(""); const [linkLabel,setLinkLabel]=useState("");   // ลิงก์เอกสารภายนอก
  // อนุมัติค่าใช้จ่าย 2 ชั้น
  const [role,setRole]=useState(null); const [threshold,setThreshold]=useState(100000);
  const [apvBusy,setApvBusy]=useState(null); const [expErr,setExpErr]=useState(null);
  const [sigs,setSigs]=useState([]); const [sigBusy,setSigBusy]=useState(false);   // e-signature ผู้ตรวจ/อนุมัติ
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
  async function doDeleteRequest(){
    if(!confirm("⚠ ลบคำขอนี้ถาวร?\n\n"+(r?.ticket_no||"")+" · "+(r?.title||"")+
      "\n\nจะลบไฟล์แนบทั้งหมด ค่าใช้จ่าย การโยกงบ และประวัติ — กู้คืนไม่ได้")) return;
    if(!confirm("ยืนยันอีกครั้ง: ลบถาวรจริง ๆ ใช่ไหม?")) return;
    setMsg("กำลังลบ…");
    const err=await deleteRequestDeep(id);
    if(err){ setMsg(null); alert("ลบไม่สำเร็จ: "+err); return; }
    window.location.href="/requests";
  }
  async function addLinkNow(){
    if(!linkUrl.trim()) return;
    const { data:sess }=await supabase.auth.getSession();
    const err=await addLink(id, sess.session.user.id, linkUrl, linkLabel);
    if(err){ setMsg("เพิ่มลิงก์ไม่สำเร็จ: "+err); return; }
    setLinkUrl(""); setLinkLabel(""); load();
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
    const { data:xl }=await supabase.from("hub_expense_lines").select("*,hub_cost_codes(code,name)").eq("request_id",id).order("created_at",{ascending:true});
    setExpLines(xl||[]);
    const { data:l }=await supabase.from("hub_activity_log").select("*,actor:actor_id(full_name)").eq("request_id",id).order("created_at",{ascending:true});
    setLog(l||[]);
    const { data:at }=await supabase.from("hub_attachments").select("*,uploader:uploaded_by(full_name)").eq("request_id",id).order("created_at",{ascending:true});
    setAtts(at||[]);
    setThumbs(await signedUrls((at||[]).filter(a=>isImage(a.mime_type)).map(a=>a.file_path), 900));
    const { data:sg }=await supabase.from("hub_signatures").select("*").eq("request_id",id);
    setSigs(sg||[]);
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
    const { data:tp }=await supabase.from("hub_request_types").select("id,name,category,sort_order").eq("is_active",true).order("category").order("sort_order");
    setTypes(tp||[]);
    load();
  })(); },[id]);
  async function saveType(){
    if(!newType || newType===r.request_type_id){ setEditType(false); return; }
    setTypeBusy(true);
    const { error }=await supabase.from("hub_requests").update({request_type_id:newType}).eq("id",id);
    if(error){ setMsg("แก้ประเภทงานไม่สำเร็จ: "+error.message); setTypeBusy(false); return; }
    await supabase.from("hub_activity_log").insert({request_id:id,actor_id:uid,action:"เปลี่ยนประเภทงาน",note:(types.find(t=>t.id===newType)?.name)||""});
    setTypeBusy(false); setEditType(false); setMsg("เปลี่ยนประเภทงานแล้ว"); load();
  }
  if(!r) return <Shell title="คำขอ"><div className="muted">กำลังโหลด…</div></Shell>;
  // เช็คลิสต์เอกสารตามประเภทงาน
  const slots = Array.isArray(r.hub_request_types?.doc_slots) ? r.hub_request_types.doc_slots : [];
  const bySlot = {};
  atts.forEach(a=>{ if(a.slot_key){ (bySlot[a.slot_key]=bySlot[a.slot_key]||[]).push(a); } });
  const noSlot = atts.filter(a=>!a.slot_key);
  const slotLabel = { budget_memo:"MEMO โยกงบ (งบไม่พอ)", excom_approval:"มติอนุมัติ Excom (ซื้อนอกงบ)", result:"ผลงาน (ส่งตรวจ)",
    ...Object.fromEntries(slots.map(s=>[s.key,s.label])) };
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
  // ── e-signature (ผู้ตรวจสอบ / ผู้อนุมัติ) ──
  function pickImageDataUrl(){
    return new Promise(res=>{
      const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*";
      inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(!f){res(null);return;} const rd=new FileReader(); rd.onload=()=>res(rd.result); rd.onerror=()=>res(null); rd.readAsDataURL(f); };
      inp.click();
    });
  }
  async function sign(kind){
    const meName = names[uid] || (team.find(x=>x.profiles?.id===uid)?.profiles?.full_name) || "";
    const nm = prompt("พิมพ์ชื่อผู้ลงนาม ("+(kind==="review"?"ผู้ตรวจสอบ":"ผู้อนุมัติ")+"):", meName);
    if(nm===null || !nm.trim()) return;
    let image=null;
    if(confirm("แนบรูปลายเซ็นด้วยไหม?\n\nOK = เลือกไฟล์รูปลายเซ็น · Cancel = ใช้ชื่อพิมพ์อย่างเดียว")){
      image = await pickImageDataUrl();
    }
    setSigBusy(true);
    const { error }=await supabase.from("hub_signatures").insert({request_id:id,kind,user_id:uid,signer_name:nm.trim(),signer_role:role,image_data:image});
    setSigBusy(false);
    if(error){ setMsg("ลงนามไม่สำเร็จ: "+error.message); return; }
    setMsg("ลงนามเรียบร้อย"); load();
  }
  function printTravelPDF(){
    const fd=r.form_data||{}; const list=Array.isArray(fd.trips)?fd.trips:[];
    const sR=sigs.find(s=>s.kind==="review"), sA=sigs.find(s=>s.kind==="approve");
    const odo=atts.filter(a=>String(a.slot_key||"").startsWith("odo_"));
    const totKm=list.reduce((s,t)=>s+(Number(t.km)||0),0);
    const totAmt=list.reduce((s,t)=>s+(Number(t.amount)||0),0);
    const esc=(s)=>String(s==null?"":s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
    const rows=list.map(t=>`<tr><td style="text-align:center">${t.no}</td><td>${esc(t.date)}</td><td>${esc(t.dest)}</td><td style="text-align:right">${t.odo_out==null?"":t.odo_out}</td><td style="text-align:right">${t.odo_in==null?"":t.odo_in}</td><td style="text-align:right">${t.km==null?"":t.km}</td><td style="text-align:right">${t.maps_km==null?"":t.maps_km}</td><td style="text-align:center">${t.over?"⚠ ตรวจสอบ":"✓ ปกติ"}</td><td style="text-align:right">${fmtMoney(t.amount)}</td></tr>`+((t.over&&t.reason)?`<tr><td></td><td colspan="8" style="color:#b03a2e;font-size:11px">เหตุผล/จุดแวะ: ${esc(t.reason)}</td></tr>`:"")).join("");
    const sigBlock=(title,s,fbName,fbTime)=>`<div style="flex:1;text-align:center;padding:0 8px"><div style="height:54px;display:flex;align-items:flex-end;justify-content:center">${(s&&s.image_data)?`<img src="${s.image_data}" style="max-height:52px;max-width:150px"/>`:""}</div><div style="border-top:1px solid #333;margin-top:2px;padding-top:3px;font-size:12px">${esc(s?s.signer_name:(fbName||"................"))}</div><div style="font-size:11px;color:#555">${title}</div><div style="font-size:10px;color:#777">${s?("ลงนามอิเล็กทรอนิกส์ "+new Date(s.created_at).toLocaleString("th-TH")):(fbTime||"วันที่ ......../......../.......")}</div></div>`;
    const olab=(k)=>{ const m=/^odo_(\d+)_(out|in)$/.exec(k||""); return m?("เที่ยว "+m[1]+" "+(m[2]==="out"?"ขาไป":"ขากลับ")):"เลขไมล์"; };
    const photos=odo.map(a=>{ const u=thumbs[a.file_path]; return u?`<div style="display:inline-block;text-align:center;margin:3px;vertical-align:top"><img src="${u}" style="width:150px;height:110px;object-fit:cover;border:1px solid #ccc"/><div style="font-size:10px">${olab(a.slot_key)}</div></div>`:""; }).join("");
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>ค่าเดินทาง ${esc(r.ticket_no)}</title><style>*{font-family:'TH Sarabun New','Sarabun',Tahoma,sans-serif;box-sizing:border-box}body{margin:0;padding:24px;color:#111;font-size:13px}h1{font-size:18px;margin:0 0 2px}table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #999;padding:4px 6px;font-size:12px}th{background:#eef}.sec{font-weight:700;background:#f0f0f0;padding:4px 8px;margin:10px 0 4px;border-left:4px solid #2E5A88}.kv{display:flex;flex-wrap:wrap;gap:2px 24px}.kv div{min-width:220px;padding:2px 0}@media print{button{display:none}}</style></head><body><button onclick="window.print()" style="float:right;padding:6px 12px">🖨 พิมพ์ / บันทึก PDF</button><h1>แบบฟอร์มขอเบิกค่าเดินทาง — รถยนต์ส่วนตัว</h1><div style="font-size:11px;color:#555">บริษัท เอเอ็มอาร์ เอเชีย จำกัด (มหาชน) · Private Vehicle Travel Reimbursement · เลขที่ ${esc(r.ticket_no)}</div><div class="sec">ส่วนที่ 1 — ข้อมูลผู้เดินทาง</div><div class="kv"><div><b>ชื่อผู้เดินทาง:</b> ${esc(r.requester&&r.requester.full_name)}</div><div><b>รหัสพนักงาน:</b> ${esc(fd.emp_code)}</div><div><b>แผนก/โครงการ:</b> ${esc(r.project?(r.project.code+" · "+r.project.name):(r.department_code||""))}</div><div><b>ทะเบียนรถ:</b> ${esc(fd.plate)}</div><div><b>Cost Code:</b> ${esc(exp[0]&&exp[0].hub_cost_codes?(exp[0].hub_cost_codes.code+" · "+exp[0].hub_cost_codes.name):"")}</div><div><b>อัตรา:</b> ${fd.rate||7} บาท/กม.</div></div><div class="sec">ส่วนที่ 2 — รายละเอียดการเดินทาง</div><table><thead><tr><th>ครั้ง</th><th>วันที่</th><th>ปลายทาง/วัตถุประสงค์</th><th>ไมล์ไป</th><th>ไมล์กลับ</th><th>กม.</th><th>Maps</th><th>ตรวจ</th><th>เงิน</th></tr></thead><tbody>${rows}<tr style="font-weight:700"><td colspan="5" style="text-align:right">รวมทั้งสิ้น</td><td style="text-align:right">${totKm}</td><td></td><td></td><td style="text-align:right">${fmtMoney(totAmt)}</td></tr></tbody></table><div class="sec">ส่วนที่ 3 — คำรับรองของผู้เดินทาง</div><div style="font-size:11.5px">ข้าพเจ้าขอรับรองว่าได้เดินทางไปปฏิบัติงานตามรายการข้างต้นจริง · ภาพเลขไมล์ที่แนบเป็นภาพถ่ายจริง ไม่ใช้ภาพซ้ำ · ระยะทางที่เบิกเพื่อปฏิบัติงานเท่านั้น · ไม่มีการเบิกซ้ำซ้อนกับค่าน้ำมัน/Fleet Card ทริปเดียวกัน</div><div class="sec">ส่วนที่ 4 — สายการอนุมัติ</div><div style="display:flex;margin-top:16px">${sigBlock("พนักงาน (ผู้ขอเบิก)",null,r.requester&&r.requester.full_name,"ยื่นในระบบ "+new Date(r.created_at).toLocaleDateString("th-TH"))}${sigBlock("หัวหน้างาน / PM (ผู้ตรวจสอบ)",sR)}${sigBlock("ผู้อนุมัติ (CPO)",sA)}</div>${photos?`<div class="sec">ภาพถ่ายเลขไมล์</div><div>${photos}</div>`:""}</body></html>`;
    const w=window.open("","_blank"); if(!w){ setMsg("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่"); return; }
    w.document.write(html); w.document.close();
  }
  // ── ใบขอเบิกค่ารับรอง (AMR14/2569) — สร้างจากข้อมูลที่กรอกในระบบ ──
  function printEntPDF(){
    const fd=r.form_data||{};
    const esc=(s)=>String(s==null?"":s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]));
    const amount=Number(fd.amount)|| (exp[0]?Number(exp[0].amount):0) || 0;
    const dateTH=new Date(fd.invoice_date||r.created_at).toLocaleDateString("th-TH",{day:"2-digit",month:"long",year:"numeric"});
    const intoProject=!!r.project && !fd.ent_no_project;
    const ocrItems=(fd._ocr&&Array.isArray(fd._ocr.items))?fd._ocr.items:[];
    const items=ocrItems.length?ocrItems.map((it,i)=>({no:i+1,date:it.date||"",desc:it.name||it.description||"",amt:Number(it.amount)||0}))
      :[{no:1,date:fd.invoice_date||"",desc:fd.expense_desc||fd.ent_detail||r.title||"",amt:amount}];
    const total=items.reduce((s,it)=>s+(Number(it.amt)||0),0)||amount;
    const filler=Array.from({length:Math.max(0,5-items.length)}).map((_,i)=>`<tr><td style="text-align:center">${items.length+i+1}</td><td></td><td></td><td></td></tr>`).join("");
    const rows=items.map(it=>`<tr><td style="text-align:center">${it.no}</td><td style="text-align:center">${esc(it.date)}</td><td>${esc(it.desc)}</td><td style="text-align:right">${fmtMoney(it.amt)}</td></tr>`).join("")+filler;
    const need=total>20000?"ceo":(total>3000?"clevel":"dir");
    const box=(title,cap,on,name)=>`<td style="border:1px solid #999;padding:8px 6px;text-align:center;vertical-align:top;width:25%;${on?"background:#FFF3E0":""}"><div style="font-weight:700;font-size:11px">${title}</div><div style="font-size:10px;color:#666">${cap}</div><div style="height:44px"></div><div style="border-top:1px solid #333;margin:0 6px;padding-top:2px;font-size:11px">( ${esc(name||"")} )</div><div style="font-size:10px;color:#555">ตำแหน่ง ...............</div><div style="font-size:10px;color:#555">วันที่ ......./......./.......</div></td>`;
    const chk=(on)=>on?"☑":"☐";
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>ใบขอเบิกค่ารับรอง ${esc(r.ticket_no)}</title><style>*{font-family:'TH Sarabun New','Sarabun',Tahoma,sans-serif;box-sizing:border-box}body{margin:0;padding:26px;color:#111;font-size:13px}h1{font-size:19px;text-align:center;margin:0 0 12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:4px 6px;font-size:12px}.row{margin:3px 0}u{text-underline-offset:3px}@media print{button{display:none}}</style></head><body>
<button onclick="window.print()" style="float:right;padding:6px 12px">🖨 พิมพ์ / บันทึก PDF</button>
<div style="font-size:11px;color:#555">บริษัท เอเอ็มอาร์ เอเชีย จำกัด (มหาชน) · เลขที่คำขอ ${esc(r.ticket_no)} · ตามประกาศ AMR14/2569</div>
<h1>ใบขอเบิกค่ารับรอง</h1>
<div class="row" style="text-align:right">วันที่ <u>${dateTH}</u></div>
<div class="row"><b>ชื่อผู้ขอเบิก</b> <u>${esc(r.requester&&r.requester.full_name)}</u> &nbsp; <b>ตำแหน่ง</b> <u>${esc(fd.requester_title||"")}</u></div>
<div class="row"><b>รหัสแผนก</b> <u>${esc(r.department_code||"")}</u></div>
<div class="row"><b>เบิกค่ารับรองเข้า</b></div>
<div class="row" style="margin-left:14px">${chk(!intoProject)} แผนก &nbsp; รหัสแผนก <u>${esc(!intoProject?(r.department_code||""):"")}</u></div>
<div class="row" style="margin-left:14px">${chk(intoProject)} โครงการ &nbsp; รหัสโครงการ <u>${esc(intoProject?(r.project.code||""):"")}</u> &nbsp; ชื่อโครงการ <u>${esc(intoProject?(r.project.name||""):"")}</u></div>
<div class="row"><b>รับรองหน่วยงาน</b> <u>${esc(fd.ent_company||"")}</u></div>
<div class="row"><b>ชื่อผู้เข้าร่วมการรับรอง</b> <u>${esc(fd.ent_person||"")}</u></div>
<div class="row"><b>วัตถุประสงค์การเบิกค่ารับรอง</b> <u>${esc(fd.ent_purpose||"")}${fd.ent_detail?(" — "+esc(fd.ent_detail)):""}</u></div>
<div class="row" style="font-weight:700;margin-top:8px">รายละเอียดค่ารับรอง</div>
<table><thead><tr><th style="width:8%">ลำดับ</th><th style="width:20%">วัน เดือน ปี</th><th>รายละเอียด</th><th style="width:18%">จำนวนเงิน</th></tr></thead><tbody>${rows}<tr><td colspan="3" style="text-align:right;font-weight:700">รวม</td><td style="text-align:right;font-weight:700">${fmtMoney(total)}</td></tr></tbody></table>
<div style="font-size:11px;color:#b03a2e;margin:3px 0 10px">(กรุณาแนบหลักฐานใบกำกับภาษี ใบเสร็จรับเงิน หรือหลักฐานการจ่ายเงิน สำหรับทุกรายการ)</div>
<table><tbody><tr>${box("ผู้จัดทำ","",false,r.requester&&r.requester.full_name)}${box("ผู้อนุมัติ (ผอ.ฝ่าย)","กรณี ไม่เกิน 3,000 บาท",need==="dir","")}${box("ผู้อนุมัติ (C-Level)","กรณี ไม่เกิน 20,000 บาท",need==="clevel","")}${box("ผู้อนุมัติ (CEO)","กรณี เกิน 20,000 บาท",need==="ceo","")}</tr></tbody></table>
<div style="font-size:10.5px;color:#666;margin-top:6px">* ช่องที่ไฮไลต์ = ระดับผู้อนุมัติที่ต้องลงนามตามวงเงิน ${fmtMoney(total)} บาท/คน/ครั้ง (ประกาศ AMR14/2569)</div>
</body></html>`;
    const w=window.open("","_blank"); if(!w){ setMsg("เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่"); return; }
    w.document.write(html); w.document.close();
  }
  // ── Export ใบเบิก/เคลียร์เงินทดรองจ่าย เป็น Excel ตามแบบฟอร์มบริษัท ──
  async function exportAdvanceXlsx(){
    setMsg("กำลังสร้างไฟล์ Excel…");
    const { data:sess }=await supabase.auth.getSession();
    const token=sess?.session?.access_token;
    if(!token){ setMsg("เซสชันหมดอายุ — เข้าสู่ระบบใหม่"); return; }
    try{
      const res=await fetch("/api/admin/export-advance",{ method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+token },
        body:JSON.stringify({ request_id:id }) });
      if(!res.ok){ let m="สร้างไฟล์ไม่สำเร็จ"; try{ const j=await res.json(); m=j.error||m; }catch(e){} setMsg("⛔ "+m); return; }
      const blob=await res.blob(); const cd=res.headers.get("Content-Disposition")||"";
      let fname="advance.xlsx"; const mm=/filename\*=UTF-8''([^;]+)/.exec(cd); if(mm){ try{ fname=decodeURIComponent(mm[1]); }catch(e){} }
      const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=fname;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setMsg("ดาวน์โหลดไฟล์ Excel แล้ว ✓");
    }catch(e){ setMsg("⛔ "+(e?.message||e)); }
  }
  const now=new Date();
  const active=["assigned","in_progress","waiting","revising"].includes(r.status);
  const trips = Array.isArray(r.form_data?.trips) ? r.form_data.trips : null;
  const sigReview = sigs.find(s=>s.kind==="review");
  const sigApprove = sigs.find(s=>s.kind==="approve");
  const odoPhotos = atts.filter(a=>String(a.slot_key||"").startsWith("odo_"));
  const odoLabel=(k)=>{ const m=/^odo_(\d+)_(out|in)$/.exec(k||""); return m?("เที่ยว "+m[1]+" · "+(m[2]==="out"?"ขาไป":"ขากลับ")):"เลขไมล์"; };
  const canRate = r.status==="closed" && uid===r.requester_id;
  const isEntReq = /Client Entertainment/.test(r.form_data?.doc_type||"");
  const isAdvReq = /advance/i.test(r.hub_request_types?.name||"");
  const canExportAdv = staff; // ทีม GA (hub_team) ทุกคน export ได้
  return (<Shell title={"คำขอ "+(r.ticket_no||"")}>
    {msg&&<div className="ok">{msg}</div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:18}}>
      <div>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div><span className="mono">{r.ticket_no}</span> &nbsp; <StatusBadge s={r.status}/>
              {r.rework_count>0&&<span className="tag" style={{marginLeft:6,background:"#FBF1DE",color:"#9A5B00"}}>ตีกลับ {r.rework_count} ครั้ง</span>}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {!editType ? (<>
                <span className="tag">{r.hub_request_types?.name}</span>
                {((r.requester_id===uid && r.status==="new")||(canManage&&!["closed","cancelled"].includes(r.status)))&&
                  <button className="btn sm sec" style={{fontSize:11,padding:"2px 8px"}} title="เลือกหัวข้อผิด? แก้ประเภทงานได้ที่นี่"
                    onClick={()=>{setNewType(r.request_type_id);setEditType(true);}}>✏️ แก้ประเภท</button>}
              </>) : (<>
                <select value={newType} onChange={e=>setNewType(e.target.value)} style={{fontSize:12,maxWidth:250,padding:"4px 6px"}}>
                  {types.map(t=>(<option key={t.id} value={t.id}>{t.name}</option>))}
                </select>
                <button className="btn sm" style={{fontSize:11,padding:"2px 8px"}} disabled={typeBusy} onClick={saveType}>{typeBusy?"…":"บันทึก"}</button>
                <button className="btn sm sec" style={{fontSize:11,padding:"2px 8px"}} onClick={()=>setEditType(false)}>ยกเลิก</button>
              </>)}
            </div>
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

        {isAdvReq&&canExportAdv&&(<div className="card" style={{background:"#F1F8F4",border:"1px solid #BFE2CC"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <h2 style={{margin:0}}>📊 ใบเบิก/เคลียร์เงินทดรองจ่าย (Excel)</h2>
            <button className="btn sm" onClick={exportAdvanceXlsx}>⬇ Export Excel ตามแบบฟอร์ม</button>
          </div>
          <div className="muted" style={{fontSize:12,marginTop:6}}>สร้างไฟล์ Excel ตามแบบฟอร์มบริษัท (Advance Request / Clearing Form) เติมข้อมูลจากคำขอให้อัตโนมัติ — สำหรับทีม GA ทุกคน</div>
        </div>)}

        {isEntReq&&(<div className="card" style={{background:"#FFFBF4",border:"1px solid #EBD9AE"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <h2 style={{margin:0}}>🍽️ ใบขอเบิกค่ารับรอง</h2>
            <button className="btn sm" onClick={printEntPDF}>🖨 สร้างใบขอเบิกค่ารับรอง (PDF)</button>
          </div>
          <div className="muted" style={{fontSize:12,marginTop:6}}>สร้างใบขอเบิกค่ารับรองตามแบบฟอร์มบริษัท (ประกาศ AMR14/2569) จากข้อมูลที่กรอกอัตโนมัติ — เปิดแล้วกดพิมพ์/บันทึกเป็น PDF เพื่อเสนอผู้อนุมัติตามวงเงิน</div>
        </div>)}

        {trips&&(<div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <h2 style={{margin:0}}>🚗 รายละเอียดค่าเดินทาง</h2>
            <button className="btn sm sec" onClick={printTravelPDF}>🖨 Export PDF</button>
          </div>
          <div className="muted" style={{fontSize:12,marginBottom:8}}>
            รหัสพนักงาน: <b>{r.form_data?.emp_code||"—"}</b> · ทะเบียนรถ: <b>{r.form_data?.plate||"—"}</b> · อัตรา {r.form_data?.rate||7} บาท/กม.
          </div>
          <div style={{overflowX:"auto"}}>
          <table style={{fontSize:12}}><thead><tr>
            <th>#</th><th>วันที่</th><th>ปลายทาง</th><th className="right">ไมล์ไป</th><th className="right">ไมล์กลับ</th><th className="right">กม.</th><th className="right">Maps</th><th>ตรวจ</th><th className="right">เงิน</th>
          </tr></thead><tbody>
          {trips.map(t=>(<Fragment key={t.no}>
            <tr>
              <td style={{textAlign:"center"}}>{t.no}</td><td>{t.date}</td><td>{t.dest}</td>
              <td className="right">{t.odo_out}</td><td className="right">{t.odo_in}</td>
              <td className="right"><b>{t.km}</b></td><td className="right">{t.maps_km}</td>
              <td style={{color:t.over?"#B03A2E":"#2E7D5B",fontSize:11,fontWeight:700}}>{t.over?"⚠ ตรวจสอบ":"✓ ปกติ"}</td>
              <td className="right">{fmtMoney(t.amount)}</td>
            </tr>
            {t.over&&t.reason&&<tr><td></td><td colSpan="8" style={{fontSize:11,color:"#B03A2E"}}>เหตุผล/จุดแวะ: {t.reason}</td></tr>}
          </Fragment>))}
          <tr style={{fontWeight:700,borderTop:"2px solid #DDE6E0",background:"#FAFDFB"}}>
            <td colSpan="5" className="right">รวมทั้งสิ้น</td><td className="right">{r.form_data?.total_km}</td><td></td><td></td>
            <td className="right">{fmtMoney(trips.reduce((s,t)=>s+(Number(t.amount)||0),0))}</td>
          </tr>
          </tbody></table>
          </div>
          {odoPhotos.length>0&&<div style={{marginTop:8}}>
            <div className="muted" style={{fontSize:12,marginBottom:4}}>รูปเลขไมล์ ({odoPhotos.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {odoPhotos.map(a=>{ const th=thumbs[a.file_path]; return (<div key={a.id} style={{textAlign:"center"}}>
                {th
                  ? <img src={th} alt={a.file_name} onClick={()=>openAttachment(a.file_path)} style={{width:96,height:72,objectFit:"cover",borderRadius:6,border:"1px solid #DDE3E8",cursor:"pointer",display:"block"}}/>
                  : <div className="muted" style={{fontSize:11}}>{fileIcon(a.mime_type)} {a.file_name}</div>}
                <div style={{fontSize:10.5,fontWeight:700,color:String(a.slot_key||"").endsWith("_out")?"#2453A8":"#8A5A00",marginTop:2}}>{odoLabel(a.slot_key)}</div>
              </div>); })}
            </div>
          </div>}
        </div>)}

        {trips&&(<div className="card">
          <h2>✍️ ลายเซ็นอนุมัติ (สำหรับบัญชีทำจ่าย)</h2>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,fontSize:12.5}}>
            <div style={{textAlign:"center",border:"1px solid #E4E7EB",borderRadius:8,padding:10}}>
              <div style={{height:44}}></div>
              <div style={{fontWeight:700,borderTop:"1px solid #ccc",paddingTop:4}}>{r.requester?.full_name||"—"}</div>
              <div className="muted" style={{fontSize:11}}>พนักงาน (ผู้ขอเบิก)</div>
              <div className="muted" style={{fontSize:10}}>ยื่นในระบบ {fmtDate(r.created_at)}</div>
            </div>
            {[["review","หัวหน้างาน / PM (ผู้ตรวจสอบ)",sigReview,canAssign],["approve","ผู้อนุมัติ (CPO)",sigApprove,role==="owner"]].map(([kind,label,s,canSign])=>(
              <div key={kind} style={{textAlign:"center",border:"1px solid "+(s?"#B7DEC8":"#E4E7EB"),borderRadius:8,padding:10,background:s?"#F6FBF8":"#fff"}}>
                <div style={{height:44,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {s?.image_data?<img src={s.image_data} alt="ลายเซ็น" style={{maxHeight:42,maxWidth:120}}/>:(s?<span style={{color:"#2E7D5B",fontSize:20}}>✓</span>:null)}
                </div>
                <div style={{fontWeight:700,borderTop:"1px solid #ccc",paddingTop:4}}>{s?s.signer_name:"— ยังไม่ลงนาม —"}</div>
                <div className="muted" style={{fontSize:11}}>{label}</div>
                {s?<div className="muted" style={{fontSize:10}}>ลงนาม {fmtDate(s.created_at)}</div>
                  :canSign?<button className="btn sm" style={{marginTop:6,fontSize:11}} disabled={sigBusy} onClick={()=>sign(kind)}>✍️ ลงนาม</button>
                  :<div className="muted" style={{fontSize:10,marginTop:4}}>รอผู้มีสิทธิ์ลงนาม</div>}
              </div>
            ))}
          </div>
          <div className="muted" style={{fontSize:11,marginTop:8}}>💡 ลงนามครบแล้วกด <b>Export PDF</b> ด้านบน เพื่อออกเอกสารให้บัญชีทำจ่าย</div>
        </div>)}

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
          {canAttach&&<div style={{background:"#F3F8FF",border:"1px solid #C7D9F7",borderRadius:8,padding:"9px 11px",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:"#2453A8",marginBottom:6}}>🔗 แนบลิงก์เอกสารภายนอก (สำหรับไฟล์ใหญ่ — OneDrive / SharePoint / Drive)</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <input value={linkUrl} onChange={e=>setLinkUrl(e.target.value)} placeholder="วางลิงก์ share ที่นี่ (https://...)" style={{flex:"2 1 240px"}}/>
              <input value={linkLabel} onChange={e=>setLinkLabel(e.target.value)} placeholder="ชื่อ/คำอธิบาย (ถ้ามี)" style={{flex:"1 1 150px"}}/>
              <button className="btn sm" disabled={!linkUrl.trim()} onClick={addLinkNow}>+ เพิ่มลิงก์</button>
            </div>
            <div className="muted" style={{fontSize:11,marginTop:5}}>💡 ตั้งค่าลิงก์ให้ "ผู้ที่มีลิงก์เปิดดูได้" ก่อนวาง เพื่อให้แอดมินเปิดได้</div>
          </div>}
          {atts.length===0&&<div className="muted" style={{fontSize:13}}>ยังไม่มีไฟล์แนบ</div>}
          <div style={{display:"grid",gap:6}}>
            {atts.map(a=>{ const canDel = canManage || (a.uploaded_by===uid && (staff || r.status==="new")); const th=thumbs[a.file_path];
              return (<div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"#F6F7F9",border:"1px solid #E4E7EB",borderRadius:8,padding:"8px 12px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                {th
                  ? <img src={th} alt={a.file_name} onClick={()=>openAttachment(a.file_path)}
                      style={{width:52,height:52,objectFit:"cover",borderRadius:6,border:"1px solid #DDE3E8",cursor:"pointer",flexShrink:0,background:"#fff"}}/>
                  : <div style={{width:52,height:52,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,borderRadius:6,border:"1px solid #DDE3E8",background:"#fff",flexShrink:0}}>{isLink(a)?"🔗":fileIcon(a.mime_type)}</div>}
                <div style={{fontSize:13,minWidth:0}}>
                  {a.slot_key&&<div><span className="tag" style={{fontSize:10,background:"#EEF4FF",color:"#2D6CDF",borderColor:"#C7D9F7"}}>
                    {slotLabel[a.slot_key]||(String(a.slot_key).startsWith("odo_")?("รูปเลขไมล์ "+odoLabel(a.slot_key)):a.slot_key)}</span></div>}
                  <b style={{wordBreak:"break-all"}}>{a.file_name}</b>
                  <div className="muted" style={{fontSize:11,marginTop:2}}>{isLink(a)?"🔗 ลิงก์ภายนอก":fmtSize(a.size_bytes)} · {a.uploader?.full_name||"—"} · {fmtDate(a.created_at)}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button className="btn sm" onClick={async()=>{ if(isLink(a)){ openLink(a.file_url); return; } const ok=await openAttachment(a.file_path); if(!ok) setMsg("เปิดไฟล์ไม่สำเร็จ (ไม่มีสิทธิ์ หรือไฟล์หาย)"); }}>{isLink(a)?"เปิดลิงก์":"เปิด"}</button>
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
            const myLines=expLines.filter(L=>L.entry_id===x.id);
            return (<Fragment key={x.id}><tr>
              <td>{x.projects?<span>{x.projects.code} · {x.projects.name}</span>:<span className="muted">—</span>}</td>
              <td>{x.hub_cost_codes?x.hub_cost_codes.code:(myLines.length?<span className="muted">{myLines.length} cost</span>:"—")}</td>
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
            </tr>
            {myLines.length>0&&<tr><td colSpan="5" style={{background:"#F7FAF8",padding:"6px 10px 10px 20px"}}>
              <div style={{fontSize:11.5,fontWeight:700,color:"#2E7D5B",margin:"2px 0 5px"}}>💵 รายการย่อย (Clear Advance)</div>
              <table style={{fontSize:12,margin:0}}><tbody>
              {myLines.map(L=>(<tr key={L.id}>
                <td className="mono" style={{width:"28%"}}>{L.hub_cost_codes?L.hub_cost_codes.code+" · "+L.hub_cost_codes.name:"—"}</td>
                <td className="muted">{L.description||"—"}</td>
                <td className="right" style={{width:120}}><b>{fmtMoney(L.amount)}</b></td>
              </tr>))}
              <tr style={{borderTop:"1px solid #DDE6E0",fontWeight:700}}>
                <td colSpan="2" className="right">รวม</td>
                <td className="right">{fmtMoney(myLines.reduce((s,L)=>s+(Number(L.amount)||0),0))}</td>
              </tr>
              </tbody></table>
            </td></tr>}
            </Fragment>);
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

            {canManage&&<div style={{marginTop:14,paddingTop:12,borderTop:"1px dashed #E4E7EB"}}>
              <button className="btn sm sec" style={{width:"100%",color:"#B03A2E",borderColor:"#F0B7BC"}}
                onClick={doDeleteRequest}>🗑 ลบคำขอถาวร</button>
              <div className="muted" style={{fontSize:11,marginTop:4,lineHeight:1.6}}>
                ลบไฟล์แนบใน storage ก่อน แล้วจึงลบคำขอ · กู้คืนไม่ได้
              </div>
            </div>}
          </>}
        </div>
      </div>
    </div>
  </Shell>);
}
