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
