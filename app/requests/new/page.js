"use client";
import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";
import { notifyMany, uploadAttachments, fmtSize, fileIcon, missingDocs, fmtMoney, addLink, fetchAll } from "../../../components/util";
import DynForm, { missingFields } from "../../../components/DynForm";
import DocSlots from "../../../components/DocSlots";
import Combobox from "../../../components/Combobox";

const THRESHOLD=100000;
const CAT={
  finance:{label:"💰 การเงิน & เบิกจ่าย",order:1},
  procurement:{label:"🛒 จัดซื้อ & Vendor",order:2},
  ga:{label:"🏢 ธุรการ & ยานพาหนะ",order:3},
  hr:{label:"👥 การเปลี่ยนข้อมูลในระบบ ByteHR / การเบิกสวัสดิการอื่นๆ",order:4},
  inventory:{label:"📦 สินค้า & ทรัพย์สิน",order:5},
  project:{label:"📊 งานโครงการ",order:6},
  quality:{label:"📋 เอกสาร & คุณภาพ",order:7},
};
const CAT_OTHER={label:"อื่น ๆ",order:9};
function groupTypes(types){
  const g={};
  types.forEach(t=>{ const k=CAT[t.category]?t.category:"_other"; (g[k]=g[k]||[]).push(t); });
  return Object.entries(g)
    .map(([k,items])=>({ key:k, meta:CAT[k]||CAT_OTHER, items:items.sort((a,b)=>(a.sort_order||100)-(b.sort_order||100)) }))
    .sort((a,b)=>a.meta.order-b.meta.order);
}
export default function NewRequest(){
  const router=useRouter();
  const [types,setTypes]=useState([]); const [projects,setProjects]=useState([]); const [codes,setCodes]=useState([]);
  const [depts,setDepts]=useState([]);          // แผนก (master) สำหรับจ่ายงานตามแผนก
  const [form,setForm]=useState({type:"",title:"",detail:"",priority:"normal",due:"",project:"",cost:"",amount:"",department:""});
  const [err,setErr]=useState(null); const [busy,setBusy]=useState(false);
  const [files,setFiles]=useState([]);          // เอกสารอื่น ๆ (ไม่เข้าช่อง)
  const [docs,setDocs]=useState({});            // { slot_key: [File,...] }
  const [fd,setFd]=useState({});
  const [links,setLinks]=useState([]);          // ลิงก์เอกสารภายนอก (ไฟล์ใหญ่)
  const [lU,setLU]=useState(""); const [lL,setLL]=useState("");
  const [bud,setBud]=useState(null);            // งบเหลือของโครงการที่เลือก
  // Opex/Capex + การจัดการงบไม่พอ (governance)
  const [etype,setEtype]=useState("");          // opex | capex
  const [tScope,setTScope]=useState("in_dept"); // in_dept | cross_dept
  const [tFrom,setTFrom]=useState("");          // โครงการต้นทางที่จะโยกงบมา
  const [tAmt,setTAmt]=useState("");            // จำนวนเงินที่โยก
  const [cfo,setCfo]=useState(false); const [ceo,setCeo]=useState(false);
  const [memoFile,setMemoFile]=useState(null);  // MEMO โยกงบ (Opex)
  const [excomFile,setExcomFile]=useState(null);// มติ Excom (Capex)
  const [excomAck,setExcomAck]=useState(false);
  const [advLines,setAdvLines]=useState([{cost:"",amount:"",note:""}]);  // Clear Advance: หลาย cost ใน 1 OF
  const [ccMap,setCcMap]=useState({});   // งบเหลือราย cost code ของโครงการ (ใช้เช็ค Advance รายบรรทัด)
  const [trips,setTrips]=useState([{date:"",vtype:"รถยนต์",dest:"",odoOut:"",odoIn:"",mapsKm:"",reason:"",photoOut:null,photoIn:null}]);  // ค่าเดินทางหลายเที่ยว
  const [ocr,setOcr]=useState(null); const [ocrBusy,setOcrBusy]=useState(false);   // ถอดข้อมูลจากบิล (AI)
  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession(); const uid=sess?.session?.user?.id;
    const [t,p,c,d,me]=await Promise.all([
      supabase.from("hub_request_types").select("*").eq("is_active",true).order("sort_order"),
      // ⚠️ PostgREST cap 1000 แถว → ต้อง paginate ให้เห็นโครงการครบทุกตัวใน dropdown
      fetchAll("projects","id,code,name,budget_amount",b=>b.order("code",{ascending:true})),
      supabase.from("hub_cost_codes").select("*").eq("is_active",true).order("code"),
      supabase.from("hub_departments").select("code,name").eq("is_active",true).order("code"),
      supabase.from("profiles").select("department").eq("id",uid).maybeSingle()]);
    setTypes(t.data||[]); setProjects(p||[]); setCodes(c.data||[]); setDepts(d.data||[]);
    // default แผนก = แผนกของผู้ขอ (จับคู่ชื่อ/รหัสกับ master) — เปลี่ยนได้
    const pd=me.data?.department;
    if(pd){ const hit=(d.data||[]).find(x=>String(x.name).toLowerCase()===pd.toLowerCase()||String(x.code).toLowerCase()===pd.toLowerCase());
      if(hit) setForm(f=>({...f,department:hit.code})); }
  })(); },[]);
  // โหลดงบคงเหลือ "ราย cost code" เมื่อเลือกโครงการ + cost code (ฐานต้นทุนจัดซื้อ ตรง ERP)
  useEffect(()=>{ (async()=>{
    if(!form.project || !form.cost){ setBud(null); return; }
    const { data }=await supabase.rpc("hub_costcode_budget_left",{ p_project:form.project, p_costcode:form.cost });
    setBud(data||null);
  })(); },[form.project,form.cost]);
  // โหลดงบเหลือ "ทุก cost code" ในโครงการ → map ไว้เช็ค Advance รายบรรทัด
  useEffect(()=>{ (async()=>{
    if(!form.project){ setCcMap({}); return; }
    const { data }=await supabase.rpc("hub_project_costcode_budgets",{ p_project:form.project });
    const m={}; (data||[]).forEach(r=>{ m[r.cost_code_id]={remaining:Number(r.remaining),budget:Number(r.budget),has_budget:r.has_budget}; });
    setCcMap(m);
  })(); },[form.project]);
  const sel=types.find(t=>t.id===form.type); const needExpense=sel?.incurs_expense;
  // Advance / Clear Advance = 1 OF มีได้หลาย cost → ยอดรวมทั้งใบใช้เช็คงบ/อนุมัติ
  const isAdvance = !!needExpense && /advance/i.test(sel?.name||"");
  // งานที่ "ตั้งเบิกตาม commit เดิม" (เช่น Billing วางบิลตาม WO ที่ตัดงบแล้ว) → ไม่เช็ค/ไม่ตัดงบซ้ำ
  const skipBudget = !!sel?.skip_budget_check;
  // ── ค่าเดินทางรถส่วนตัว: กม. = ไมล์กลับ−ไป · เงิน = กม.×7 · recheck vs Google Maps (ส่วนต่าง>10 = ⚠) ──
  const isTravel = !!sel?.is_travel; const RATE_KM=7; const MAPS_TOL=10;
  const tripKm=(t)=>{ const a=Number(t.odoOut),b=Number(t.odoIn); return (isFinite(a)&&isFinite(b)&&b>a)?(b-a):0; };
  const tripDiff=(t)=>{ const m=Number(t.mapsKm); return (isFinite(m)&&m>0&&tripKm(t)>0)?(tripKm(t)-m):null; };
  const tripOver=(t)=>{ const d=tripDiff(t); return d!==null && d>MAPS_TOL; };
  const travelKm = trips.reduce((s,t)=>s+tripKm(t),0);
  const travelTotal = travelKm*RATE_KM;
  const advTotal = advLines.reduce((s,l)=>s+(Number(String(l.amount).replace(/[,\s]/g,""))||0),0);
  const amt = isTravel ? travelTotal : (isAdvance ? advTotal : (Number(String(form.amount).replace(/[,\s]/g,""))||0));
  const overBudget = !skipBudget && bud?.has_budget && amt>0 && amt > Number(bud.left);
  // ── Advance: เช็คงบราย cost code รายบรรทัด (รวมยอดต่อ cost code แล้วเทียบงบเหลือ) ──
  const advByCost = {};
  if(isAdvance && !skipBudget) advLines.forEach(l=>{ if(l.cost){ const a=Number(String(l.amount).replace(/[,\s]/g,""))||0; advByCost[l.cost]=(advByCost[l.cost]||0)+a; } });
  const advOverList = (isAdvance && !skipBudget)
    ? Object.entries(advByCost).filter(([cid,sum])=>{ const cc=ccMap[cid]; return cc && cc.has_budget && sum > cc.remaining; })
    : [];
  const advOver = advOverList.length>0;
  const overCost = new Set(advOverList.map(([cid])=>cid));   // cost code ที่งบไม่พอ (ทำ input แดง)
  // ── ตรวจความพร้อมของ governance เมื่องบไม่พอ ──
  const shortfall = overBudget ? (amt - Number(bud.left)) : 0;
  const tAmtNum = Number(String(tAmt).replace(/[,\s]/g,""))||0;
  let govReady=true, govMsg="";
  if(overBudget){
    if(!etype){ govReady=false; govMsg="เลือกประเภทงบ (Opex/Capex) ก่อน"; }
    else if(etype==="opex"){
      if(!tFrom){ govReady=false; govMsg="เลือกโครงการต้นทางที่จะโยกงบมา"; }
      else if(tAmtNum < shortfall){ govReady=false; govMsg="จำนวนเงินที่โยกต้องไม่น้อยกว่าส่วนที่ขาด "+fmtMoney(shortfall)+" บาท"; }
      else if(!memoFile){ govReady=false; govMsg="แนบ MEMO การโยกงบ"; }
      else if(!cfo){ govReady=false; govMsg="ยืนยันว่า MEMO ลงนามโดย CFO แล้ว"; }
      else if(tScope==="cross_dept" && !ceo){ govReady=false; govMsg="โยกข้ามแผนก ต้องยืนยันว่าลงนามโดย CEO ด้วย"; }
    } else if(etype==="capex"){
      if(!excomFile){ govReady=false; govMsg="แนบเอกสารมติอนุมัติจาก Excom (ซื้อนอกงบ)"; }
      else if(!excomAck){ govReady=false; govMsg="ยืนยันว่าได้รับอนุมัติจากที่ประชุม Excom แล้ว"; }
    }
  }
  const blockSubmit = (needExpense && amt>0 && !etype) || (overBudget && !govReady) || advOver;
  function up(k,v){ setForm(s=>({...s,[k]:v}));
    if(k==="type"){ setDocs({}); setFiles([]); setFd({});
      setEtype(""); setTScope("in_dept"); setTFrom(""); setTAmt(""); setCfo(false); setCeo(false);
      setMemoFile(null); setExcomFile(null); setExcomAck(false);
      setAdvLines([{cost:"",amount:"",note:""}]);
      setTrips([{date:"",vtype:"รถยนต์",dest:"",odoOut:"",odoIn:"",mapsKm:"",reason:"",photoOut:null,photoIn:null}]);
      setOcr(null);
      setLinks([]); setLU(""); setLL(""); }
  }
  // ── หลาย cost line (Clear Advance) ──
  const setLine=(i,k,v)=>setAdvLines(a=>a.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const addLine=()=>setAdvLines(a=>[...a,{cost:"",amount:"",note:""}]);
  const rmLine=(i)=>setAdvLines(a=>a.length>1?a.filter((_,idx)=>idx!==i):a);
  // ── ค่าเดินทาง: จัดการเที่ยว ──
  const setTrip=(i,k,v)=>setTrips(a=>a.map((t,idx)=>idx===i?{...t,[k]:v}:t));
  const addTrip=()=>setTrips(a=>a.length<8?[...a,{date:"",vtype:"รถยนต์",dest:"",odoOut:"",odoIn:"",mapsKm:"",reason:"",photoOut:null,photoIn:null}]:a);
  const rmTrip=(i)=>setTrips(a=>a.length>1?a.filter((_,idx)=>idx!==i):a);
  // ── ถอดข้อมูลจากบิลด้วย AI (Gemini) แล้วให้ผู้ใช้/แอดมินตรวจสอบ ──
  const pickImg=()=>new Promise(r=>{ const i=document.createElement("input"); i.type="file"; i.accept="image/*,application/pdf,.pdf"; i.onchange=()=>r(i.files&&i.files[0]||null); i.click(); });
  const toDataUrl=(f)=>new Promise((res,rej)=>{ const rd=new FileReader(); rd.onload=()=>res(rd.result); rd.onerror=rej; rd.readAsDataURL(f); });
  // แม็พข้อมูลจากบิล → ช่องในฟอร์ม (ตาม label/ประเภทช่อง) เติมเฉพาะช่องที่ยังว่าง
  function ocrToFd(d, schema, prev){
    const out={...(prev||{})};
    (schema||[]).forEach(f=>{
      const lab=((f.label||"")+" "+(f.key||""));
      const cur=out[f.key]; const empty=(cur==null||cur==="");
      if(f.type==="checkbox"){
        if(d.vat!=null && Number(d.vat)>0 && /ใบกำกับภาษี|vat/i.test(lab) && !out[f.key]) out[f.key]=true;
        return;
      }
      if(!empty || f.type==="select") return;
      if(d.doc_no && (f.type==="text"||!f.type) && /เลขที่/.test(lab) && /บิล|ใบเสร็จ|invoice|กำกับ|เอกสาร/i.test(lab)) out[f.key]=String(d.doc_no);
      else if(d.vendor && f.type!=="number" && /ร้าน|ผู้รับเงิน|บริษัท|ผู้ขาย|ผู้จำหน่าย|vendor/i.test(lab) && !/ประเภท|ที่อยู่|address/i.test(lab)) out[f.key]=String(d.vendor);
      else if(d.description && (f.type==="textarea"||f.type==="text"||!f.type) && /รายละเอียด|รายการ|วัตถุประสงค์|detail|desc/i.test(lab)) out[f.key]=String(d.description);
      else if(d.total!=null && f.type==="number" && /จำนวนเงิน|ยอด|รวม|amount/i.test(lab)) out[f.key]=Number(d.total);
      else if(d.date && f.type==="date" && /วันที่/.test(lab) && !/รับเงิน|due|กำหนด|ครบ/i.test(lab)) out[f.key]=String(d.date);
    });
    return out;
  }
  // เตรียมไฟล์ก่อนส่ง: รูป → ย่อ + บีบเป็น JPEG (กันไฟล์ใหญ่เกิน limit + ลด token) · PDF → ส่งตามเดิม
  async function fileToPayload(f){
    if(f.type && f.type.startsWith("image/")){
      try{
        const dataUrl=await toDataUrl(f);
        const img=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=dataUrl; });
        const max=1600, scale=Math.min(1, max/Math.max(img.width,img.height));
        const cw=Math.max(1,Math.round(img.width*scale)), ch=Math.max(1,Math.round(img.height*scale));
        const cv=document.createElement("canvas"); cv.width=cw; cv.height=ch;
        cv.getContext("2d").drawImage(img,0,0,cw,ch);
        return { image:cv.toDataURL("image/jpeg",0.82), mime:"image/jpeg" };
      }catch(e){ /* ถ้าย่อไม่ได้ ส่งไฟล์เดิม */ }
    }
    const dataUrl=await toDataUrl(f);
    return { image:dataUrl, mime: f.type||(/\.pdf$/i.test(f.name)?"application/pdf":"image/jpeg") };
  }
  async function ocrOne(f){
    const { image, mime }=await fileToPayload(f);
    const res=await fetch("/api/extract-bill",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image,mime})});
    let j; try{ j=await res.json(); }catch(e){ throw new Error("HTTP "+res.status+" (ไฟล์อาจใหญ่เกิน หรือ endpoint ผิดพลาด)"); }
    if(!res.ok||j.error) throw new Error(j.error||("HTTP "+res.status));
    return { data:j.data||{}, model:j.model };
  }
  const pickImgs=()=>new Promise(r=>{ const i=document.createElement("input"); i.type="file"; i.accept="image/*,application/pdf,.pdf"; i.multiple=true; i.onchange=()=>r(i.files?[...i.files]:[]); i.click(); });
  // ยอดเดี่ยว (OF/Billing/จัดซื้อ)
  async function extractBill(){
    const f=await pickImg(); if(!f) return;
    setOcrBusy(true); setErr(null);
    try{
      const { data:d, model }=await ocrOne(f);
      setOcr({...d, model});
      if(Number(d.total)>0) up("amount", String(d.total));
      setFd(prev=>ocrToFd(d, sel?.form_schema, prev));   // เติมช่องในฟอร์มให้ด้วย (เฉพาะที่ว่าง)
      setFiles(v=>[...v, f]);   // แนบบิลเป็นหลักฐานอัตโนมัติ
    }catch(e){ setErr("ถอดข้อมูลจากบิลไม่สำเร็จ: "+(e?.message||e)); }
    setOcrBusy(false);
  }
  // Clear Advance: เลือกหลายบิล → เพิ่มบรรทัดอัตโนมัติ 1 บิล/บรรทัด (cost code เลือกเอง)
  async function extractBillsAdvance(){
    const fs=await pickImgs(); if(!fs.length) return;
    setOcrBusy(true); setErr(null);
    const newLines=[]; const addF=[]; let fail=0; let lastErr="";
    for(const f of fs){
      try{ const { data:d }=await ocrOne(f);
        newLines.push({ cost:"", amount:(d.total!=null?String(d.total):""), note:[d.vendor,d.description].filter(Boolean).join(" · ") });
        addF.push(f);
      }catch(e){ fail++; lastErr=(e&&e.message)||String(e); }
    }
    if(newLines.length) setAdvLines(a=>{ const base=(a.length===1 && !a[0].cost && !a[0].amount && !a[0].note)?[]:a; return [...base, ...newLines]; });
    if(addF.length) setFiles(v=>[...v, ...addF]);
    setOcrBusy(false);
    setErr(fail? ("ถอดสำเร็จ "+newLines.length+" บิล · ไม่สำเร็จ "+fail+" ไฟล์"+(lastErr?(" — "+lastErr):"")) : null);
  }
  // ถอดบิลใส่บรรทัด Advance ที่ระบุ
  async function extractBillLine(i, f){
    if(!f) return; setOcrBusy(true); setErr(null);
    try{ const { data:d }=await ocrOne(f);
      if(d.total!=null) setLine(i,"amount",String(d.total));
      setLine(i,"note",[d.vendor,d.description].filter(Boolean).join(" · "));
      setFiles(v=>[...v, f]);
    }catch(e){ setErr("ถอดข้อมูลจากบิลไม่สำเร็จ: "+(e?.message||e)); }
    setOcrBusy(false);
  }
  async function submit(e){ e.preventDefault(); setErr(null);
    // ⛔ บังคับกรอกให้ครบก่อนส่ง
    const miss=missingFields(sel?.form_schema, fd);
    if(miss.length){ setErr("กรอกข้อมูลไม่ครบ — ยังขาด: "+miss.join(" · ")); window.scrollTo({top:0,behavior:"smooth"}); return; }
    // ⛔ เอกสารบังคับต้องครบทุกช่อง (รวมเอกสารเงื่อนไข เช่น จ่ายนอกรอบ)
    const miss2=missingDocs(sel?.doc_slots, docs, fd);
    if(miss2.length){
      setErr("เอกสารยังไม่ครบ — ยังขาด: "+miss2.join(" · "));
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    const nDocs=Object.values(docs).reduce((s,a)=>s+a.length,0);
    if(sel?.require_attachment && nDocs===0 && files.length===0){
      setErr("งานประเภทนี้ต้องแนบเอกสารหลักฐานอย่างน้อย 1 ไฟล์");
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    // ⛔ งานที่มีค่าใช้จ่าย ต้องระบุ "โครงการ" หรือ "แผนก" อย่างน้อยหนึ่ง (เบิกเข้าโครงการ/เบิกเข้าแผนก)
    if(needExpense && !form.project && !form.department){
      setErr("งานที่มีค่าใช้จ่าย ต้องระบุ ‘โครงการ’ (เบิกเข้าโครงการ) หรือเลือก ‘แผนก’ (เบิกเข้าแผนก) อย่างน้อยหนึ่งอย่าง");
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    // ⛔ ต้องเลือก Opex/Capex ทุกครั้งที่มีค่าใช้จ่าย
    if(needExpense && amt>0 && !etype){
      setErr("กรุณาเลือกประเภทงบ — Opex (ดำเนินงาน) หรือ Capex (ลงทุน)");
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    // ⛔ Clear Advance: ทุกบรรทัดที่มีเงิน ต้องเลือก Cost Code + มีอย่างน้อย 1 บรรทัด
    if(isAdvance){
      const paid=advLines.filter(l=>(Number(String(l.amount).replace(/[,\s]/g,""))||0)>0);
      if(!paid.length){ setErr("Clear Advance ต้องมีอย่างน้อย 1 รายการที่มีจำนวนเงิน"); window.scrollTo({top:0,behavior:"smooth"}); return; }
      if(paid.some(l=>!l.cost)){ setErr("ทุกบรรทัดที่มีจำนวนเงิน ต้องเลือก Cost Code"); window.scrollTo({top:0,behavior:"smooth"}); return; }
      // ⛔ งบราย cost code ไม่พอ → ไม่ให้ส่ง ต้องเริ่มกระบวนการใหม่ทั้งหมด
      if(advOver){
        const detail=advOverList.map(([cid,sum])=>{ const c=codes.find(x=>x.id===cid); const cc=ccMap[cid];
          return (c?.code||"?")+" (เบิก "+fmtMoney(sum)+" · เหลือ "+fmtMoney(cc.remaining)+")"; }).join(" · ");
        setErr("งบไม่พอราย Cost Code — ต้องเริ่มกระบวนการใหม่ทั้งหมด: "+detail);
        window.scrollTo({top:0,behavior:"smooth"}); return;
      }
    }
    // ⛔ ค่าเดินทาง: ตรวจแต่ละเที่ยวให้ครบ + เกิน Maps ต้องมีเหตุผล + แนบรูปเลขไมล์ทุกเที่ยว
    if(isTravel){
      const active=trips.filter(t=>t.date||t.dest||t.odoOut||t.odoIn||t.mapsKm||t.photoOut||t.photoIn);
      if(!active.length){ setErr("ต้องมีรายการเดินทางอย่างน้อย 1 เที่ยว"); window.scrollTo({top:0,behavior:"smooth"}); return; }
      for(let i=0;i<trips.length;i++){ const t=trips[i]; const n=i+1;
        const filled=t.date||t.dest||t.odoOut||t.odoIn||t.mapsKm||t.photoOut||t.photoIn;
        if(!filled) continue;
        if(!t.date||!t.dest){ setErr("เที่ยวที่ "+n+": ต้องกรอกวันที่และปลายทาง/วัตถุประสงค์"); window.scrollTo({top:0,behavior:"smooth"}); return; }
        if(tripKm(t)<=0){ setErr("เที่ยวที่ "+n+": เลขไมล์กลับต้องมากกว่าเลขไมล์ไป"); window.scrollTo({top:0,behavior:"smooth"}); return; }
        if(!(Number(t.mapsKm)>0)){ setErr("เที่ยวที่ "+n+": กรอกระยะจาก Google Maps"); window.scrollTo({top:0,behavior:"smooth"}); return; }
        if(!t.photoOut||!t.photoIn){ setErr("เที่ยวที่ "+n+": ต้องแนบรูปเลขไมล์ทั้ง ‘ขาไป’ และ ‘ขากลับ’"); window.scrollTo({top:0,behavior:"smooth"}); return; }
        if(tripOver(t) && !String(t.reason||"").trim()){ setErr("เที่ยวที่ "+n+": ระยะสูงกว่า Google Maps เกิน "+MAPS_TOL+" กม. — ต้องระบุเหตุผล/จุดแวะ"); window.scrollTo({top:0,behavior:"smooth"}); return; }
      }
      if(travelKm<=0){ setErr("ต้องมีเที่ยวที่ระยะทาง > 0 อย่างน้อย 1 เที่ยว"); window.scrollTo({top:0,behavior:"smooth"}); return; }
    }
    // ⛔ งบไม่พอ → ต้องผ่าน governance (โยกงบ Opex / มติ Excom Capex) ก่อน
    if(overBudget && !govReady){
      setErr("งบโครงการไม่พอ (ขาด "+fmtMoney(shortfall)+" บาท) — "+govMsg);
      window.scrollTo({top:0,behavior:"smooth"}); return;
    }
    setBusy(true);
    const { data:sess }=await supabase.auth.getSession(); const uid=sess.session.user.id;
    const sla=new Date(Date.now()+(Number(sel?.default_sla_hours||24))*3600e3).toISOString();
    const { data:req, error }=await supabase.from("hub_requests").insert({
      requester_id:uid, request_type_id:form.type, title:form.title, detail:form.detail,
      priority:form.priority, requested_due:form.due||null, sla_due_at:sla, status:"new",
      project_id: form.project||null, department_code: form.department||null,
      form_data: isTravel ? {...fd, rate:RATE_KM, total_km:travelKm,
        trips: trips.filter(t=>tripKm(t)>0).map((t,i)=>({no:i+1,date:t.date,vtype:t.vtype,dest:t.dest,
          odo_out:Number(t.odoOut),odo_in:Number(t.odoIn),km:tripKm(t),maps_km:Number(t.mapsKm),
          diff:tripDiff(t),over:tripOver(t),reason:t.reason||"",amount:tripKm(t)*RATE_KM})) } : (ocr ? {...fd, _ocr:{...ocr, confirmed_total:amt, at:new Date().toISOString()}} : fd)
    }).select().single();
    if(error){ setErr(error.message); setBusy(false); return; }
    if(needExpense && amt>0){
      // 1 entry รวม (amount = ยอดรวมทั้งใบ) คุมอนุมัติ+งบ · สถานะอนุมัติกำหนดโดย trigger DB
      const { data:entry }=await supabase.from("hub_expense_entries").insert({
        request_id:req.id, project_id:form.project||null,
        cost_code_id: isAdvance ? null : (form.cost||null),
        amount: amt,
        expense_type: etype||null,
        out_of_budget: !!overBudget,
        ob_kind: overBudget ? (etype==="opex"?"transfer":"excom") : null
      }).select("id").single();
      // breakdown รายบรรทัด (Clear Advance)
      if(isAdvance && entry){
        const lines=advLines
          .filter(l=>(Number(String(l.amount).replace(/[,\s]/g,""))||0)>0)
          .map(l=>({ request_id:req.id, entry_id:entry.id, cost_code_id:l.cost||null,
                     amount:Number(String(l.amount).replace(/[,\s]/g,""))||0, description:l.note||null }));
        if(lines.length) await supabase.from("hub_expense_lines").insert(lines);
      }
    }
    // งบไม่พอ + Opex → บันทึกการโยกงบ (ปรับตัวเลขงบจริง)
    if(overBudget && etype==="opex"){
      const { error:terr }=await supabase.rpc("hub_record_budget_transfer",{
        p_request:req.id, p_to:form.project, p_from:tFrom, p_amount:tAmtNum,
        p_scope:tScope, p_cfo:cfo, p_ceo:ceo, p_note:null });
      if(terr){ setErr("บันทึกการโยกงบไม่สำเร็จ: "+terr.message); setBusy(false); return; }
    }
    // อัปโหลดเอกสารตามช่อง (ติด slot_key) + เอกสารอื่น ๆ + เอกสาร governance
    const items=[];
    Object.entries(docs).forEach(([k,arr])=>arr.forEach(f=>items.push({file:f, slot_key:k})));
    files.forEach(f=>items.push({file:f, slot_key:null}));
    if(isTravel) trips.forEach((t,i)=>{ if(tripKm(t)>0){
      if(t.photoOut) items.push({file:t.photoOut, slot_key:"odo_"+(i+1)+"_out"});
      if(t.photoIn)  items.push({file:t.photoIn,  slot_key:"odo_"+(i+1)+"_in"}); } });
    if(overBudget && etype==="opex" && memoFile) items.push({file:memoFile, slot_key:"budget_memo"});
    if(overBudget && etype==="capex" && excomFile) items.push({file:excomFile, slot_key:"excom_approval"});
    if(items.length){
      const errs=await uploadAttachments(req.id, uid, items);
      if(errs.length) setErr("บางไฟล์แนบไม่สำเร็จ: "+errs.join(" · "));
    }
    // ลิงก์เอกสารภายนอก (ไฟล์ใหญ่)
    for(const l of links){ await addLink(req.id, uid, l.url, l.label); }
    await supabase.from("hub_activity_log").insert({request_id:req.id,actor_id:uid,action:"created",to_status:"new"});
    const { data:leads }=await supabase.from("hub_team").select("user_id").in("hub_role",["owner","lead","supervisor"]);
    notifyMany((leads||[]).map(l=>l.user_id),"มีคำขอใหม่เข้ามา",(req.ticket_no||"")+" · "+form.title,"/requests/"+req.id,req.id);
    router.replace("/requests/"+req.id);
  }
  return (<Shell title="เปิดคำขอใหม่">
    <div className="card" style={{maxWidth:720}}>
      {err&&<div className="err">{err}</div>}
      <form onSubmit={submit}>
        <div className="field"><label>ประเภทงาน *</label>
          <select value={form.type} onChange={e=>up("type",e.target.value)} required>
            <option value="">— เลือกหมวด / ประเภทงาน —</option>
            {groupTypes(types).map(g=>(
              <optgroup key={g.key} label={g.meta.label}>
                {g.items.map(t=>(<option key={t.id} value={t.id}>{t.name}{t.incurs_expense?" (มีค่าใช้จ่าย)":""}</option>))}
              </optgroup>
            ))}
          </select></div>
        {sel?.prep_note&&<div style={{background:"#FFF8E6",border:"1px solid #EBD9AE",borderRadius:10,padding:"10px 12px",marginBottom:14,fontSize:12.5,color:"#8A5A00",lineHeight:1.7}}>
          <b>📋 เตรียมให้พร้อมก่อนกรอก</b><br/>{sel.prep_note}
        </div>}

        <div className="field"><label>หัวข้อ *</label><input value={form.title} onChange={e=>up("title",e.target.value)} required placeholder="สรุปสั้น ๆ ว่าต้องการอะไร"/></div>

        {sel&&<DynForm schema={sel.form_schema} data={fd} onChange={setFd}/>}

        <div className="field"><label>หมายเหตุเพิ่มเติม (ถ้ามี)</label><textarea value={form.detail} onChange={e=>up("detail",e.target.value)} placeholder="ข้อมูลอื่นที่อยากให้ทีมทราบ"/></div>
        <div className="row2">
          <div className="field"><label>ความเร่งด่วน</label>
            <select value={form.priority} onChange={e=>up("priority",e.target.value)}>
              <option value="low">ต่ำ</option><option value="normal">ปกติ</option><option value="high">สูง</option><option value="urgent">ด่วนมาก</option></select></div>
          <div className="field"><label>กำหนดส่งที่ต้องการ</label><input type="date" value={form.due} onChange={e=>up("due",e.target.value)}/></div>
        </div>
        {needExpense&&<div style={{fontSize:12.5,color:"#2E7D5B",background:"#EAF6EF",border:"1px solid #B7DEC8",borderRadius:8,padding:"7px 11px",marginBottom:10}}>
          💡 งานที่มีค่าใช้จ่าย: <b>เบิกเข้าโครงการ</b> → เลือกโครงการ · <b>เบิกเข้าแผนก</b> → เว้นโครงการว่าง แล้วเลือกแผนก (อย่างน้อยหนึ่งอย่าง)
        </div>}
        <div className="field">
          <label>โครงการ / รหัสโครงการ <span className="muted" style={{fontWeight:400,fontSize:11}}>(เว้นว่างได้ถ้าเบิกเข้าแผนก)</span></label>
          <Combobox
            options={projects.map(p=>({value:p.id, label:(p.code||"")+" · "+(p.name||""), sub:p.name}))}
            value={form.project} onChange={v=>up("project",v)}
            placeholder="🔎 พิมพ์รหัส/ชื่อโครงการเพื่อค้นหา"
            emptyLabel="— ไม่ระบุโครงการ (เบิกเข้าแผนก) —"/>
          <div className="muted" style={{fontSize:11,marginTop:4}}>ระบุโครงการ = เบิกเข้าโครงการ + ส่งงานให้ <b>เจ้าประจำโครงการ</b> · เว้นว่าง = เบิกเข้าแผนก</div>
        </div>
        <div className="field">
          <label>แผนก (สำหรับจ่ายงาน)</label>
          <select value={form.department} onChange={e=>up("department",e.target.value)}>
            <option value="">— ตามแผนกของฉัน (อัตโนมัติ) —</option>
            {depts.map(d=>(<option key={d.code} value={d.code}>{d.code} · {d.name}</option>))}
          </select>
          <div className="muted" style={{fontSize:11,marginTop:4}}>ถ้าไม่ระบุโครงการ ระบบจะส่งงานให้ <b>เจ้าประจำแผนก</b> · เว้นว่าง = ใช้แผนกของผู้ขอ</div>
        </div>

        {needExpense&&(<div style={{background:"#E4F3EA",border:"1px solid #B7DEC8",borderRadius:10,padding:14,marginBottom:14}}>
          <div style={{fontWeight:700,color:"#2E7D5B",marginBottom:10}}>ค่าใช้จ่ายโครงการ</div>
          {skipBudget&&<div style={{fontSize:12,color:"#2453A8",background:"#EEF4FF",border:"1px solid #C7D9F7",borderRadius:8,padding:"8px 11px",marginBottom:10}}>
            ℹ️ งานนี้เป็นการ<b>ตั้งเบิกตามที่ผูกงบไว้แล้ว</b> (เช่น วางบิลตาม WO) ระบบจะ<b>ไม่เช็ค/ไม่ตัดงบซ้ำ</b> เพราะงบถูกกันไว้ตั้งแต่ขั้นเปิด PR/PO/WO แล้ว
          </div>}
          <div className="field"><label>ประเภทงบ * <span className="muted" style={{fontWeight:400,fontSize:11}}>(เลือกก่อนกรอกจำนวนเงิน)</span></label>
            <div style={{display:"flex",gap:8}}>
              {[["opex","Opex — ดำเนินงาน"],["capex","Capex — ลงทุน"]].map(([v,l])=>(
                <label key={v} style={{flex:1,display:"flex",alignItems:"center",gap:6,cursor:"pointer",
                  border:"1px solid "+(etype===v?"#2E7D5B":"#CBD8D0"),background:etype===v?"#EAF6EF":"#fff",
                  borderRadius:8,padding:"8px 10px",fontSize:13,fontWeight:etype===v?700:400}}>
                  <input type="radio" name="etype" checked={etype===v} onChange={()=>setEtype(v)}/>{l}
                </label>))}
            </div>
          </div>
          {isTravel ? (
          <>
            <div className="field"><label>Cost Code (ERP)</label>
              <Combobox options={codes.map(c=>({value:c.id,label:c.code+" · "+c.name,sub:c.name}))}
                value={form.cost} onChange={v=>up("cost",v)}
                placeholder="🔎 พิมพ์รหัส/ชื่อ cost code" emptyLabel="— เลือก —" searchPlaceholder="🔎 พิมพ์รหัส/ชื่อ cost code"/></div>
            <div className="field">
              <label>รายละเอียดการเดินทาง (สูงสุด 8 เที่ยว) · อัตรา {RATE_KM} บาท/กม. *</label>
              <div style={{overflowX:"auto",border:"1px solid #CFE3D6",borderRadius:8}}>
              <table style={{margin:0,fontSize:11.5,minWidth:940}}><thead><tr style={{background:"#F0F7F2"}}>
                <th style={{width:26}}>#</th><th style={{width:120}}>วันที่</th><th>ปลายทาง/วัตถุประสงค์</th>
                <th style={{width:78}}>ไมล์ไป</th><th style={{width:78}}>ไมล์กลับ</th><th style={{width:52}}>กม.</th>
                <th style={{width:82}}>Maps(กม.)</th><th style={{width:96}}>สถานะ</th><th className="right" style={{width:80}}>เงิน</th><th style={{width:120}}>รูปไมล์ (ไป/กลับ)</th><th style={{width:26}}></th>
              </tr></thead><tbody>
              {trips.map((t,i)=>{ const km=tripKm(t); const d=tripDiff(t); const over=tripOver(t); return (<Fragment key={i}>
                <tr>
                  <td style={{textAlign:"center"}}>{i+1}</td>
                  <td><input type="date" value={t.date} onChange={e=>setTrip(i,"date",e.target.value)} style={{width:"100%"}}/></td>
                  <td><input value={t.dest} onChange={e=>setTrip(i,"dest",e.target.value)} placeholder="เช่น ไซต์งาน / ลูกค้า" style={{width:"100%"}}/></td>
                  <td><input type="number" value={t.odoOut} onChange={e=>setTrip(i,"odoOut",e.target.value)} placeholder="0" style={{width:"100%",textAlign:"right"}}/></td>
                  <td><input type="number" value={t.odoIn} onChange={e=>setTrip(i,"odoIn",e.target.value)} placeholder="0" style={{width:"100%",textAlign:"right"}}/></td>
                  <td style={{textAlign:"right",fontWeight:700}}>{km||"-"}</td>
                  <td><input type="number" value={t.mapsKm} onChange={e=>setTrip(i,"mapsKm",e.target.value)} placeholder="0" style={{width:"100%",textAlign:"right"}}/></td>
                  <td style={{textAlign:"center",fontSize:10.5,fontWeight:700,color:over?"#B03A2E":(d!==null?"#2E7D5B":"#98A4AE")}}>{d===null?"รอ Maps":over?("⚠ เกิน "+d):"✓ ปกติ"}</td>
                  <td style={{textAlign:"right"}}>{km?fmtMoney(km*RATE_KM):"-"}</td>
                  <td style={{textAlign:"center",whiteSpace:"nowrap"}}>
                    <label className="btn sm sec" style={{cursor:"pointer",fontSize:10,padding:"2px 5px",display:"inline-block",marginRight:3,borderColor:t.photoOut?"#B7DEC8":undefined,color:t.photoOut?"#2E7D5B":undefined}} title={t.photoOut?("ขาไป: "+t.photoOut.name):"รูปเลขไมล์ ขาไป (ก่อนออก)"}>
                      {t.photoOut?"✓ไป":"📎ไป"}<input type="file" accept="image/*" style={{display:"none"}} onChange={e=>setTrip(i,"photoOut",e.target.files?.[0]||null)}/></label>
                    <label className="btn sm sec" style={{cursor:"pointer",fontSize:10,padding:"2px 5px",display:"inline-block",borderColor:t.photoIn?"#B7DEC8":undefined,color:t.photoIn?"#2E7D5B":undefined}} title={t.photoIn?("ขากลับ: "+t.photoIn.name):"รูปเลขไมล์ ขากลับ (เมื่อถึง)"}>
                      {t.photoIn?"✓กลับ":"📎กลับ"}<input type="file" accept="image/*" style={{display:"none"}} onChange={e=>setTrip(i,"photoIn",e.target.files?.[0]||null)}/></label>
                  </td>
                  <td style={{textAlign:"center"}}>{trips.length>1&&<button type="button" onClick={()=>rmTrip(i)} style={{border:"none",background:"none",color:"#B03A2E",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>}</td>
                </tr>
                {over&&<tr><td></td><td colSpan="10" style={{paddingBottom:6}}>
                  <input value={t.reason} onChange={e=>setTrip(i,"reason",e.target.value)} placeholder="⚠ ระยะเกิน Maps — ระบุเหตุผล/จุดแวะ (บังคับ)"
                    style={{width:"100%",borderColor:"#B03A2E",fontSize:11}}/></td></tr>}
              </Fragment>); })}
              </tbody>
              <tfoot><tr style={{borderTop:"2px solid #DDE6E0",fontWeight:700,background:"#FAFDFB"}}>
                <td colSpan="5"><button type="button" onClick={addTrip} className="btn sm sec" style={{fontSize:12}} disabled={trips.length>=8}>+ เพิ่มเที่ยว</button></td>
                <td style={{textAlign:"right"}}>{travelKm||"-"}</td><td></td><td></td><td className="right" style={{color:"#2E7D5B"}}>{fmtMoney(travelTotal)}</td><td colSpan="2"></td>
              </tr></tfoot></table>
              </div>
              {trips.some(tripOver)&&<div style={{fontSize:11.5,color:"#B03A2E",fontWeight:700,marginTop:5}}>⚠ มีเที่ยวที่ระยะสูงกว่า Google Maps เกิน {MAPS_TOL} กม. — ต้องระบุเหตุผล/จุดแวะในแถวสีแดง</div>}
              <div className="muted" style={{fontSize:11,marginTop:4}}>ระยะ = ไมล์กลับ − ไมล์ไป · เงิน = ระยะ × {RATE_KM} บาท · <b>ต้องแนบรูปเลขไมล์ 2 รูปทุกเที่ยว: ขาไป (ก่อนออก) + ขากลับ (เมื่อถึง)</b></div>
            </div>
          </>
          ) : isAdvance ? (
          <div className="field">
            <label>รายการค่าใช้จ่าย (Clear Advance — ใส่ได้หลาย Cost) *</label>
            <div style={{marginBottom:6}}>
              <button type="button" className="btn sm sec" disabled={ocrBusy} onClick={extractBillsAdvance} style={{borderColor:"#2453A8",color:"#2453A8"}}>
                {ocrBusy?"⏳ กำลังอ่านบิล…":"📷 ถอดหลายบิล (เลือกหลายไฟล์ → เพิ่มบรรทัดอัตโนมัติ)"}
              </button>
              <div className="muted" style={{fontSize:10.5,marginTop:2}}>เลือกได้หลายไฟล์พร้อมกัน · 1 บิล = 1 บรรทัด (ยอด/รายละเอียดเติมให้ · เลือก Cost Code เอง)</div>
            </div>
            <div style={{border:"1px solid #CFE3D6",borderRadius:8,overflow:"hidden"}}>
              <table style={{margin:0,fontSize:12.5}}><thead><tr style={{background:"#F0F7F2"}}>
                <th style={{width:"34%"}}>Cost Code</th><th>รายละเอียด</th>
                <th className="right" style={{width:130}}>จำนวนเงิน</th><th style={{width:34}}></th>
              </tr></thead><tbody>
              {advLines.map((l,i)=>{ const cc=l.cost?ccMap[l.cost]:null; const isOver=overCost.has(l.cost); return (<tr key={i}>
                <td><Combobox options={codes.map(c=>({value:c.id,label:c.code+" · "+c.name,sub:c.name}))}
                  value={l.cost} onChange={v=>setLine(i,"cost",v)}
                  placeholder="🔎 cost code" emptyLabel="— เลือก —" searchPlaceholder="🔎 พิมพ์รหัส/ชื่อ cost code"/>
                  {cc&&cc.has_budget&&<div style={{fontSize:10.5,marginTop:3,fontWeight:isOver?700:400,color:isOver?"#B03A2E":"#6B7A72"}}>{isOver?"⛔ ":""}งบเหลือ {fmtMoney(cc.remaining)}</div>}</td>
                <td><input value={l.note} onChange={e=>setLine(i,"note",e.target.value)} placeholder="เช่น ค่าเดินทาง..." style={{width:"100%"}}/></td>
                <td><input type="number" value={l.amount} onChange={e=>setLine(i,"amount",e.target.value)} placeholder="0"
                  style={{width:"100%",textAlign:"right",...(isOver?{borderColor:"#B03A2E",boxShadow:"0 0 0 2px rgba(176,58,46,.12)"}:{})}}/></td>
                <td style={{textAlign:"center",whiteSpace:"nowrap"}}>
                  <label className="btn sm sec" style={{cursor:"pointer",fontSize:11,padding:"1px 4px",display:"inline-block",marginRight:3}} title="ถอดบิลใส่บรรทัดนี้">📷
                    <input type="file" accept="image/*,application/pdf,.pdf" style={{display:"none"}} onChange={e=>{ const f=e.target.files&&e.target.files[0]; e.target.value=""; extractBillLine(i,f); }}/></label>
                  {advLines.length>1&&<button type="button" onClick={()=>rmLine(i)} title="ลบบรรทัด" style={{border:"none",background:"none",color:"#B03A2E",cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>}
                </td>
              </tr>); })}
              </tbody>
              <tfoot><tr style={{borderTop:"2px solid #DDE6E0",fontWeight:700,background:"#FAFDFB"}}>
                <td colSpan="2"><button type="button" onClick={addLine} className="btn sm sec" style={{fontSize:12}}>+ เพิ่มบรรทัด</button></td>
                <td className="right" style={{color:advOver?"#B03A2E":"#2E7D5B"}}>รวม {fmtMoney(advTotal)}</td><td></td>
              </tr></tfoot></table>
            </div>
            {advOver&&<div style={{marginTop:6,background:"#FFF6F6",border:"1.5px solid #F0B7BC",borderRadius:8,padding:"9px 12px"}}>
              <div style={{fontSize:12,color:"#B03A2E",fontWeight:800}}>⛔ งบไม่พอราย Cost Code — แก้ไขให้อยู่ในงบ ไม่งั้นต้องเริ่มกระบวนการใหม่ทั้งหมด</div>
              <ul style={{margin:"5px 0 0",paddingLeft:18,fontSize:11.5,color:"#7A3B34",lineHeight:1.7}}>
                {advOverList.map(([cid,sum])=>{ const c=codes.find(x=>x.id===cid); const cc=ccMap[cid];
                  return <li key={cid}><b>{c?.code}</b> — เบิก {fmtMoney(sum)} · งบเหลือ {fmtMoney(cc.remaining)} <b style={{color:"#B03A2E"}}>(เกิน {fmtMoney(sum-cc.remaining)})</b></li>; })}
              </ul>
            </div>}
          </div>
          ) : (
          <div className="row2">
            <div className="field"><label>Cost Code (ERP)</label>
              <Combobox options={codes.map(c=>({value:c.id,label:c.code+" · "+c.name,sub:c.name}))}
                value={form.cost} onChange={v=>up("cost",v)}
                placeholder="🔎 พิมพ์รหัส/ชื่อ cost code" emptyLabel="— เลือก —"
                searchPlaceholder="🔎 พิมพ์รหัส/ชื่อ cost code"/></div>
            <div className="field"><label>จำนวนเงิน (บาท)</label>
              <input type="number" value={form.amount} onChange={e=>up("amount",e.target.value)} placeholder="0"
                style={overBudget?{borderColor:"#B03A2E",boxShadow:"0 0 0 3px rgba(176,58,46,.12)"}:undefined}/>
              {overBudget&&<div style={{fontSize:11.5,color:"#B03A2E",fontWeight:700,marginTop:4}}>
                🚫 เกินงบคงเหลือ {fmtMoney(amt-Number(bud.left))}</div>}
            </div>
          </div>
          )}
          {needExpense&&!isTravel&&!isAdvance&&(<div style={{marginTop:8}}>
            <button type="button" className="btn sm sec" disabled={ocrBusy} onClick={extractBill}
              style={{borderColor:"#2453A8",color:"#2453A8"}}>
              {ocrBusy?"⏳ กำลังอ่านบิล…":"📷 ถอดข้อมูลจากบิล (รูป/PDF)"}
            </button>
            {ocr&&<div style={{marginTop:6,background:"#FFFBEB",border:"1px solid #EBD9AE",borderRadius:8,padding:"8px 11px",fontSize:12}}>
              <div style={{fontWeight:700,color:"#8A5A00",marginBottom:3}}>🟡 ข้อมูลจากบิล — โปรดตรวจสอบก่อนส่ง{ocr.confidence!=null&&<span style={{fontWeight:400}}> (ความมั่นใจ {Math.round(Number(ocr.confidence)*100)}%)</span>}</div>
              <div style={{color:"#5A4A20",lineHeight:1.7}}>
                ร้าน: <b>{ocr.vendor||"—"}</b> · วันที่: <b>{ocr.date||"—"}</b> · เลขที่: <b>{ocr.doc_no||"—"}</b><br/>
                ยอดรวม: <b>{ocr.total!=null?fmtMoney(ocr.total):"—"}</b> · VAT: {ocr.vat!=null?fmtMoney(ocr.vat):"—"} · เลขภาษี: {ocr.tax_id||"—"}
                {ocr.description?<><br/>รายการ: {ocr.description}</>:null}
              </div>
              <div className="muted" style={{fontSize:10.5,marginTop:3}}>ระบบเติมช่อง "จำนวนเงิน" + แนบรูปบิลให้อัตโนมัติแล้ว · แก้ไขได้ถ้าอ่านไม่ตรง</div>
            </div>}
          </div>)}
          {/* งบคงเหลือราย Cost Code (ฐานต้นทุนจัดซื้อ ตรง ERP) */}
          {bud&&form.project&&form.cost&&(bud.has_budget
            ? <div style={{marginTop:6,padding:"8px 12px",borderRadius:8,fontSize:12.5,
                background:overBudget?"#FDECEE":"#EEF6FF",border:"1px solid "+(overBudget?"#F3C9CE":"#C7D9F7")}}>
                งบ Cost Code นี้ <b>{fmtMoney(bud.budget)}</b> · ใช้ไปแล้ว (จัดซื้อ) <b>{fmtMoney(Math.max(Number(bud.used),Number(bud.erp)))}</b> ·
                คงเหลือ <b style={{color:Number(bud.left)<=0?"#B03A2E":"#2E7D5B"}}>{fmtMoney(bud.left)}</b>
                {overBudget&&<div style={{color:"#B03A2E",fontWeight:700,marginTop:3}}>⛔ งบ cost code นี้ไม่พอ — ต้องลดยอด เปลี่ยน cost code หรือผ่าน governance</div>}
              </div>
            : <div className="muted" style={{fontSize:11.5,marginTop:6}}>Cost code นี้ยังไม่ได้ตั้งงบในโครงการนี้ (ไม่เช็คงบ)</div>)}
          {amt>THRESHOLD&&<div className="muted" style={{color:"#B26A00",marginTop:6}}>⚠ ยอด &gt; {fmtMoney(THRESHOLD)} — ต้องผ่านการอนุมัติ Owner</div>}

          {overBudget&&(<div style={{marginTop:12,background:"#FFF6F6",border:"1.5px solid #F0B7BC",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontWeight:800,color:"#B03A2E",marginBottom:6}}>⛔ งบไม่พอ — ขาด {fmtMoney(shortfall)} บาท</div>
            {!etype&&<div style={{fontSize:12.5,color:"#8A5A00"}}>เลือก <b>ประเภทงบ (Opex/Capex)</b> ด้านบนก่อน เพื่อดำเนินการต่อ</div>}

            {etype==="opex"&&(<div style={{fontSize:13,lineHeight:1.7}}>
              <div style={{marginBottom:8,color:"#7A3B34"}}>ต้อง <b>โยกงบ</b> มาก่อน แล้วแนบ MEMO ที่ลงนามแล้ว จึงจะส่งคำขอได้</div>
              <div className="field" style={{marginBottom:8}}><label style={{fontSize:12}}>ขอบเขตการโยกงบ</label>
                <div style={{display:"flex",gap:8}}>
                  {[["in_dept","ภายในแผนก (ลงนาม CFO)"],["cross_dept","ต่างแผนก (ลงนาม CFO + CEO)"]].map(([v,l])=>(
                    <label key={v} style={{flex:1,display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12.5,
                      border:"1px solid "+(tScope===v?"#B03A2E":"#E4C4C4"),background:tScope===v?"#FBE9EA":"#fff",borderRadius:8,padding:"7px 9px"}}>
                      <input type="radio" name="tscope" checked={tScope===v} onChange={()=>{setTScope(v); if(v==="in_dept") setCeo(false);}}/>{l}
                    </label>))}
                </div>
              </div>
              <div className="field" style={{marginBottom:8}}><label style={{fontSize:12}}>โครงการต้นทาง (โยกงบมาจาก) *</label>
                <Combobox options={projects.filter(p=>p.id!==form.project).map(p=>({value:p.id,label:(p.code||"")+" · "+(p.name||""),sub:p.name}))}
                  value={tFrom} onChange={setTFrom} placeholder="🔎 เลือกโครงการที่จะดึงงบมา" emptyLabel="— เลือก —"/>
              </div>
              <div className="field" style={{marginBottom:8}}><label style={{fontSize:12}}>จำนวนเงินที่โยก (บาท) * — อย่างน้อย {fmtMoney(shortfall)}</label>
                <input type="number" value={tAmt} onChange={e=>setTAmt(e.target.value)} placeholder={String(shortfall)}
                  style={tAmtNum&&tAmtNum<shortfall?{borderColor:"#B03A2E"}:undefined}/>
              </div>
              <label className="btn sm sec" style={{cursor:"pointer",margin:"0 0 8px",display:"inline-block"}}>
                {memoFile?"เปลี่ยน MEMO":"📎 แนบ MEMO โยกงบ"}
                <input type="file" style={{display:"none"}} onChange={e=>setMemoFile(e.target.files?.[0]||null)}/>
              </label>
              {memoFile&&<span style={{fontSize:12,marginLeft:8}}>{fileIcon(memoFile.type,memoFile.name)} {memoFile.name}</span>}
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,marginTop:4}}>
                <input type="checkbox" checked={cfo} onChange={e=>setCfo(e.target.checked)}/> ยืนยัน: MEMO ลงนามโดย <b>CFO</b> แล้ว
              </label>
              {tScope==="cross_dept"&&<label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,marginTop:4}}>
                <input type="checkbox" checked={ceo} onChange={e=>setCeo(e.target.checked)}/> ยืนยัน: MEMO ลงนามโดย <b>CEO</b> แล้ว (โยกข้ามแผนก)
              </label>}
            </div>)}

            {etype==="capex"&&(<div style={{fontSize:13,lineHeight:1.7}}>
              <div style={{marginBottom:8,color:"#7A3B34"}}>Capex เกินงบ ต้องนำเข้า <b>ที่ประชุม Excom</b> เมื่ออนุมัติแล้วแนบเอกสารมติจึงจะส่งคำขอได้</div>
              <label className="btn sm sec" style={{cursor:"pointer",margin:"0 0 8px",display:"inline-block"}}>
                {excomFile?"เปลี่ยนเอกสาร":"📎 แนบเอกสารมติ Excom"}
                <input type="file" style={{display:"none"}} onChange={e=>setExcomFile(e.target.files?.[0]||null)}/>
              </label>
              {excomFile&&<span style={{fontSize:12,marginLeft:8}}>{fileIcon(excomFile.type,excomFile.name)} {excomFile.name}</span>}
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5,marginTop:4}}>
                <input type="checkbox" checked={excomAck} onChange={e=>setExcomAck(e.target.checked)}/> ยืนยัน: ได้รับอนุมัติจากที่ประชุม <b>Excom</b> แล้ว
              </label>
            </div>)}

            {etype&&(govReady
              ? <div style={{marginTop:8,fontSize:12.5,color:"#2E7D5B",fontWeight:700}}>✅ ครบเงื่อนไขแล้ว — ส่งคำขอได้</div>
              : <div style={{marginTop:8,fontSize:12,color:"#B03A2E"}}>ยังขาด: {govMsg}</div>)}
          </div>)}
        </div>)}
        {sel&&<DocSlots slots={sel.doc_slots} picked={docs} onChange={setDocs}
          extra={files} onExtra={setFiles} formData={fd}/>}

        {sel&&<div className="field" style={{background:"#F3F8FF",border:"1px solid #C7D9F7",borderRadius:10,padding:"12px 14px"}}>
          <label style={{color:"#2453A8"}}>🔗 ลิงก์เอกสารภายนอก (สำหรับไฟล์ใหญ่เกิน 10MB — OneDrive / SharePoint / Drive)</label>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <input value={lU} onChange={e=>setLU(e.target.value)} placeholder="วางลิงก์ share (https://...)" style={{flex:"2 1 240px"}}/>
            <input value={lL} onChange={e=>setLL(e.target.value)} placeholder="ชื่อ/คำอธิบาย (ถ้ามี)" style={{flex:"1 1 140px"}}/>
            <button type="button" className="btn sm sec" disabled={!lU.trim()}
              onClick={()=>{ setLinks(v=>[...v,{url:lU.trim(),label:lL.trim()}]); setLU(""); setLL(""); }}>+ เพิ่ม</button>
          </div>
          {links.length>0&&<div style={{marginTop:8,display:"grid",gap:4}}>
            {links.map((l,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12.5}}>
              <span>🔗</span><span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.label||l.url}</span>
              <button type="button" onClick={()=>setLinks(v=>v.filter((_,j)=>j!==i))}
                style={{border:"none",background:"none",color:"#B03A2E",cursor:"pointer",fontSize:14}}>✕</button>
            </div>))}
          </div>}
          <div className="muted" style={{fontSize:11,marginTop:5}}>💡 ตั้งลิงก์ให้ "ผู้ที่มีลิงก์เปิดดูได้" ก่อนวาง เพื่อให้แอดมินเปิดได้</div>
        </div>}
        <div className="muted" style={{fontSize:11,marginTop:-6,marginBottom:12}}>
          รูป / PDF / Word / Excel · สูงสุด 10MB ต่อไฟล์
        </div>
        <button className="btn" disabled={busy||blockSubmit}>{busy?"กำลังส่ง…":
          blockSubmit?(advOver?"⛔ งบ cost code ไม่พอ — แก้ไขก่อน":overBudget?"⛔ ทำเงื่อนไขงบไม่พอให้ครบก่อน":"⛔ เลือกประเภทงบก่อน"):"ส่งคำขอ"}</button>
      </form>
    </div>
  </Shell>);
}
