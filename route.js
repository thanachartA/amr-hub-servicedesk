// API: Export คำขอ Advance / Clear Advance เป็น Excel ตามแบบฟอร์มบริษัท
// "ใบเบิก/เคลียร์เงินทดรองจ่าย (Advance Request, Clearing Form)" — เติมข้อมูลจาก request อัตโนมัติ
// auth: Bearer token → hub_team owner/supervisor (เหมือน import-budget)
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { ADVANCE_TEMPLATE_B64 } from "../../../../lib/advanceTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kkbffgbotigddtfmultm.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const nAmt = (x)=>{ const n=Number(String(x==null?"":x).replace(/[,\s]/g,"")); return isFinite(n)?n:0; };
// เขียนค่า cell โดยคงสไตล์เดิมของ template (ไม่แตะสูตร H19/H50/ตารางเทียบ)
function put(ws, addr, v){
  const cur = ws[addr] || {};
  if(v==null || v===""){ ws[addr] = { ...cur, t:"s", v:"" }; delete ws[addr].f; return; }
  const t = typeof v==="number" ? "n" : "s";
  ws[addr] = { ...cur, t, v }; delete ws[addr].f;
}
const dTH = (d)=> d ? new Date(d).toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"numeric"}) : "";

export async function POST(req){
  if(!SERVICE) return Response.json({ error:"เซิร์ฟเวอร์ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY (ใส่แล้ว Redeploy)" }, { status:500 });
  const hdr = req.headers.get("authorization")||"";
  const token = hdr.startsWith("Bearer ")?hdr.slice(7):null;
  if(!token) return Response.json({ error:"ไม่ได้เข้าสู่ระบบ" }, { status:401 });

  const admin = createClient(SB_URL, SERVICE, { auth:{ persistSession:false, autoRefreshToken:false } });
  const { data:who, error:authErr } = await admin.auth.getUser(token);
  const caller = who && who.user;
  if(authErr || !caller) return Response.json({ error:"เซสชันหมดอายุ — เข้าสู่ระบบใหม่" }, { status:401 });
  const { data:me } = await admin.from("hub_team").select("hub_role").eq("user_id", caller.id).maybeSingle();
  if(!me || !["owner","supervisor"].includes(me.hub_role)) return Response.json({ error:"เฉพาะ Owner / Supervisor เท่านั้น" }, { status:403 });

  const body = await req.json().catch(()=>({}));
  const reqId = body.request_id;
  if(!reqId) return Response.json({ error:"ไม่พบ request_id" }, { status:400 });

  // ── โหลดคำขอหลัก ──
  const { data:r, error:re } = await admin.from("hub_requests")
    .select("id,ticket_no,title,created_at,requester_id,project_id,department_code,form_data,request_type_id,hub_request_types(name)")
    .eq("id", reqId).maybeSingle();
  if(re || !r) return Response.json({ error:"ไม่พบคำขอ" }, { status:404 });
  const typeName = r.hub_request_types?.name || "";
  if(!/advance/i.test(typeName)) return Response.json({ error:"คำขอนี้ไม่ใช่ประเภท Advance / Clear Advance" }, { status:400 });

  const fd = r.form_data || {};
  const isClearing = /clear/i.test(String(fd.doc_type||"")) || nAmt(fd.actual_spent)>0 || !!fd.advance_ref;

  // ── ข้อมูลประกอบ ──
  const { data:prof } = await admin.from("profiles").select("full_name").eq("id", r.requester_id).maybeSingle();
  let projCode="", projName="";
  if(r.project_id){ const { data:p } = await admin.from("projects").select("code,name").eq("id", r.project_id).maybeSingle(); if(p){ projCode=p.code||""; projName=p.name||""; } }
  let deptName="";
  if(r.department_code){ const { data:d } = await admin.from("hub_departments").select("name").eq("code", r.department_code).maybeSingle(); if(d) deptName=d.name||""; }
  const { data:codes } = await admin.from("hub_cost_codes").select("id,code,name");
  const ccMap = {}; (codes||[]).forEach(c=>{ ccMap[c.id]=c; });
  const catOf = (cid)=>{ const c=ccMap[cid]; return c?(c.name||c.code||""):""; };

  // lines ของคำขอนี้ (ไม่รวมรายการเงินคืน)
  const { data:myLines } = await admin.from("hub_expense_lines").select("cost_code_id,amount,description,is_refund").eq("request_id", r.id);
  const thisLines = (myLines||[]).filter(l=>!l.is_refund);

  // สำหรับใบเคลียร์: ดึงใบ Advance ต้นทางจาก advance_ref (ticket_no) มาเติมส่วนที่ 1 ให้ reconcile
  let advLines = null, advTicket = "";
  if(isClearing && fd.advance_ref){
    const { data:av } = await admin.from("hub_requests").select("id,ticket_no").ilike("ticket_no", String(fd.advance_ref).trim()).maybeSingle();
    if(av){ advTicket=av.ticket_no; const { data:al } = await admin.from("hub_expense_lines").select("cost_code_id,amount,description,is_refund").eq("request_id", av.id); advLines=(al||[]).filter(l=>!l.is_refund); }
  }

  // รวมยอดตาม cost code (สูงสุด 4 หมวดต่อส่วนที่ 1 ตามช่องในฟอร์ม)
  const aggByCat = (lines)=>{ const m={}; (lines||[]).forEach(l=>{ const k=catOf(l.cost_code_id)||"อื่นๆ"; m[k]=(m[k]||0)+nAmt(l.amount); }); return Object.entries(m).map(([cat,amt])=>({cat,amt})); };

  // ── เปิด template ──
  let wb;
  try{ wb = XLSX.read(Buffer.from(ADVANCE_TEMPLATE_B64,"base64"), { type:"buffer", cellStyles:true }); }
  catch(e){ return Response.json({ error:"เปิดเทมเพลตไม่ได้: "+(e?.message||e) }, { status:500 }); }
  const ws = wb.Sheets[wb.SheetNames[0]];

  // ── ส่วนที่ 1: ใบเบิก (header) ──
  put(ws,"H6", dTH(r.created_at));
  put(ws,"D7", prof?.full_name||"");
  put(ws,"D8", r.department_code||"");
  put(ws,"D9", deptName);
  put(ws,"D10", projCode);
  put(ws,"D11", projName);
  put(ws,"D12", fd.purpose || fd.expense_desc || r.title || "");

  // ส่วนที่ 1 รายการ (rows 15-18) — ใบเบิกใช้ line ของตัวเอง · ใบเคลียร์ใช้ line ของใบ advance ต้นทาง (ถ้ามี)
  const sec1src = isClearing ? (advLines && advLines.length ? aggByCat(advLines) : null) : aggByCat(thisLines);
  const sec1 = sec1src && sec1src.length ? sec1src.slice(0,4) : null;
  for(let i=0;i<4;i++){ const row=15+i; const it=sec1?sec1[i]:null;
    put(ws,"C"+row, it?it.cat:""); put(ws,"D"+row, it?"":""); put(ws,"H"+row, it?Math.round(it.amt*100)/100:"");
  }
  // ใบเคลียร์ที่ไม่มี line ต้นทาง → ใส่ยอดเงินทดรองรับมาเป็นบรรทัดเดียว
  if(isClearing && !sec1 && nAmt(fd.advance_amount)>0){
    put(ws,"C15","เงินทดรองจ่ายที่รับมา"); put(ws,"H15", Math.round(nAmt(fd.advance_amount)*100)/100);
  }

  // ── ส่วนที่ 2: ใบเคลียร์ (actual) — เฉพาะคำขอที่เป็นการเคลียร์ ──
  if(isClearing){
    put(ws,"H32", dTH(r.created_at));
    const rows2 = thisLines.slice(0,15);
    for(let i=0;i<15;i++){ const row=35+i; const l=rows2[i];
      put(ws,"C"+row, ""); // วันที่ (ไม่มีใน line — เว้นให้กรอกเพิ่ม)
      put(ws,"D"+row, l?catOf(l.cost_code_id):"");
      put(ws,"E"+row, l?(l.description||""):"");
      put(ws,"H"+row, l?Math.round(nAmt(l.amount)*100)/100:"");
    }
  }

  // ── ออกไฟล์ ──
  const buf = XLSX.write(wb, { type:"buffer", bookType:"xlsx", cellStyles:true });
  const safe = String(r.ticket_no||"advance").replace(/[^\w\-]+/g,"_");
  const fname = (isClearing?"ใบเคลียร์เงินทดรอง_":"ใบเบิกเงินทดรอง_")+safe+".xlsx";
  return new Response(buf, { status:200, headers:{
    "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition":"attachment; filename*=UTF-8''"+encodeURIComponent(fname),
  }});
}
