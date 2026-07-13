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
export const isImage = m => (m||"").startsWith("image/");

// ขอ signed URL หลายไฟล์พร้อมกัน (ใช้ทำ thumbnail รูป) — คืน map {path: url}
export async function signedUrls(paths, secs=600){
  const map={};
  const list=[...new Set((paths||[]).filter(Boolean))];
  if(!list.length) return map;
  try{
    const { data }=await supabase.storage.from(ATT_BUCKET).createSignedUrls(list, secs);
    (data||[]).forEach(d=>{ if(d && d.signedUrl && !d.error) map[d.path]=d.signedUrl; });
  }catch(e){ /* noop */ }
  return map;
}

// ลบไฟล์แนบ (ลบทั้งใน storage และแถวใน DB) — คืนข้อความ error ถ้ามี
export async function deleteAttachment(att){
  if(!att?.id) return "ไม่พบไฟล์";
  if(att.file_path) await supabase.storage.from(ATT_BUCKET).remove([att.file_path]);
  const { error }=await supabase.from("hub_attachments").delete().eq("id",att.id);
  return error ? error.message : null;
}

// เปิดไฟล์ด้วย signed URL (ไฟล์เป็น private)
export async function openAttachment(path){
  const { data, error }=await supabase.storage.from(ATT_BUCKET).createSignedUrl(path,120);
  if(error||!data?.signedUrl) return false;
  window.open(data.signedUrl,"_blank","noopener");
  return true;
}

// อ่านไฟล์ CSV -> array ของ array (รองรับ BOM, เครื่องหมายคำพูด, ขึ้นบรรทัดในเซลล์)
export function parseCSV(text){
  const t=String(text||"").replace(/^﻿/,"");
  const rows=[]; let row=[]; let cur=""; let q=false;
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(q){
      if(c==='"'){ if(t[i+1]==='"'){ cur+='"'; i++; } else { q=false; } }
      else cur+=c;
    } else {
      if(c==='"') q=true;
      else if(c===','){ row.push(cur); cur=""; }
      else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
      else if(c==='\r'){ /* ข้าม */ }
      else cur+=c;
    }
  }
  if(cur!=="" || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r=>r.some(x=>String(x).trim()!==""));
}

// export ตารางเป็น CSV (รองรับ Excel ภาษาไทยด้วย BOM)
// โหลดตัวอ่าน Excel (SheetJS) แบบ lazy — โหลดเฉพาะตอนที่มีคนอัปโหลด .xlsx จริง
let _xlsxPromise=null;
export function loadXLSX(){
  if(typeof window==="undefined") return Promise.reject(new Error("ใช้ได้เฉพาะบนเบราว์เซอร์"));
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(_xlsxPromise) return _xlsxPromise;
  _xlsxPromise=new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload=()=>res(window.XLSX);
    s.onerror=()=>{ _xlsxPromise=null; rej(new Error("โหลดตัวอ่าน Excel ไม่สำเร็จ — ลองบันทึกไฟล์เป็น .csv แล้วอัปโหลดใหม่")); };
    document.head.appendChild(s);
  });
  return _xlsxPromise;
}

// อ่าน .xlsx / .xls / .csv -> ตาราง 2 มิติ (แถวแรก = หัวคอลัมน์)
export async function readSheet(file){
  const name=String(file?.name||"").toLowerCase();
  if(name.endsWith(".csv")||name.endsWith(".txt")) return parseCSV(await file.text());
  const XLSX=await loadXLSX();
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const grid=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:""});
  return grid.filter(r=>Array.isArray(r)&&r.some(x=>String(x??"").trim()!==""));
}

// แปลงตัวเลขจาก Excel/CSV (รองรับ 1,234.50 / (1,234) = ติดลบ / ฿)
export function toNum(v){
  let s=String(v??"").trim().replace(/[฿,\s]/g,"");
  if(!s) return NaN;
  let neg=false;
  if(/^\(.*\)$/.test(s)){ neg=true; s=s.slice(1,-1); }
  const n=Number(s);
  if(isNaN(n)) return NaN;
  return neg?-n:n;
}

// แปลงวันที่จาก Excel/CSV -> YYYY-MM-DD (รองรับ d/m/yyyy และ พ.ศ.)
export function toDate(v){
  const s=String(v??"").trim();
  if(!s) return null;
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if(m){
    let [_,d,mo,y]=m; y=Number(y);
    if(y<100) y+=2000;
    if(y>2400) y-=543;             // พ.ศ. -> ค.ศ.
    return [y,String(mo).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
  }
  const dt=new Date(s);
  return isNaN(dt) ? null : dt.toISOString().slice(0,10);
}

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
