import { supabase } from "../lib/supabaseClient";

export function StatusBadge({ s }){
  const th={new:"ใหม่",assigned:"มอบหมายแล้ว",in_progress:"กำลังทำ",waiting:"รอข้อมูล",review:"รอตรวจ",done:"เสร็จ",closed:"ปิด",cancelled:"ยกเลิก"};
  return <span className={"badge b-"+s}>{th[s]||s}</span>;
}
export function fmtDate(d){ if(!d) return "—"; const x=new Date(d); return x.toLocaleDateString("th-TH",{day:"2-digit",month:"short"})+" "+x.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}); }
export function fmtMoney(n){ return (Number(n)||0).toLocaleString("th-TH",{minimumFractionDigits:0}); }

// สร้างการแจ้งเตือนในระบบให้ผู้รับ (เงียบถ้า error)
export async function notify(userId, title, body, link, requestId){
  if(!userId) return;
  try{ await supabase.from("hub_notifications").insert({user_id:userId,title,body:body||null,link:link||null,request_id:requestId||null}); }
  catch(e){ /* noop */ }
}
export async function notifyMany(userIds, title, body, link, requestId){
  const ids=[...new Set((userIds||[]).filter(Boolean))];
  if(!ids.length) return;
  try{ await supabase.from("hub_notifications").insert(ids.map(id=>({user_id:id,title,body:body||null,link:link||null,request_id:requestId||null}))); }
  catch(e){ /* noop */ }
}

// ===== ไฟล์แนบ (Supabase Storage: bucket private "hub-attachments") =====
export const ATT_BUCKET="hub-attachments";
export const ATT_MAX=10*1024*1024; // 10MB ต่อไฟล์
export function fmtSize(b){ const n=Number(b)||0; if(n<1024) return n+" B"; if(n<1048576) return (n/1024).toFixed(0)+" KB"; return (n/1048576).toFixed(1)+" MB"; }
export function fileIcon(m){ const t=m||""; if(t.startsWith("image/")) return "🖼"; if(t.includes("pdf")) return "📕"; if(t.includes("sheet")||t.includes("excel")) return "📊"; if(t.includes("word")||t.includes("document")) return "📄"; return "📎"; }

// อัปโหลดไฟล์เข้า storage + บันทึกลง hub_attachments — คืน array ของ error ที่เกิด
export async function uploadAttachments(requestId, uid, files){
  const errs=[];
  for(const f of (files||[])){
    if(f.size>ATT_MAX){ errs.push(f.name+" ใหญ่เกิน 10MB"); continue; }
    const ext=(f.name.split(".").pop()||"bin").toLowerCase().replace(/[^a-z0-9]/g,"");
    const path=requestId+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+(ext||"bin");
    const { error }=await supabase.storage.from(ATT_BUCKET).upload(path,f,{contentType:f.type||undefined});
    if(error){ errs.push(f.name+": "+error.message); continue; }
    const { error:dbErr }=await supabase.from("hub_attachments").insert({
      request_id:requestId, uploaded_by:uid||null, file_name:f.name,
      file_path:path, mime_type:f.type||null, size_bytes:f.size
    });
    if(dbErr) errs.push(f.name+": "+dbErr.message);
  }
  return errs;
}
// เปิดไฟล์ด้วย signed URL (ไฟล์เป็น private)
export async function openAttachment(path){
  const { data, error }=await supabase.storage.from(ATT_BUCKET).createSignedUrl(path,120);
  if(error||!data?.signedUrl) return false;
  window.open(data.signedUrl,"_blank","noopener");
  return true;
}

// export ตารางเป็น CSV (รองรับ Excel ภาษาไทยด้วย BOM)
export function downloadCSV(filename, columns, rows){
  const esc=v=>{ const s=(v==null?"":String(v)); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  const head=columns.map(c=>esc(c.label)).join(",");
  const body=rows.map(r=>columns.map(c=>esc(typeof c.get==="function"?c.get(r):r[c.key])).join(",")).join("\n");
  const csv="﻿"+head+"\n"+body;
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
