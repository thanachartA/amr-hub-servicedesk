// API: นำเข้างบประมาณโครงการจากไฟล์ BF (.xlsx) → สร้าง/อัปเดตโครงการ + ลงงบราย cost code
// ใช้ pattern เดียวกับ reset-password: service role + ตรวจสิทธิ์จาก hub_team (owner/supervisor)
// โหมด: dryRun=true → พรีวิวอย่างเดียว (ไม่เขียน DB) · commit → เขียนจริง
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kkbffgbotigddtfmultm.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CODE_RE = /^[CG]\d{6}$/;
const toNum = (v)=>{ if(v==null) return null; const n=Number(String(v).replace(/[,\s]/g,"")); return isFinite(n)?n:null; };
const cell = (v)=> v==null ? "" : String(v).trim();

// หา value ตัวแรกที่ไม่ว่างทางขวาของ index ที่ระบุ (ในแถวเดียวกัน)
function rightVal(row, idx){ for(let j=idx+1;j<row.length;j++){ const v=row[j]; if(v!=null && String(v).trim()!=="") return v; } return null; }
function rightNum(row, idx){ for(let j=idx+1;j<row.length;j++){ const n=toNum(row[j]); if(n!=null) return n; } return null; }

function parseSummary(rows){
  const out={ code:"", name:"", customer:"", contract_value:null, total_budget:null, pm:"", start:null, end:null };
  const setDate=(v)=>{ if(v instanceof Date) return v.toISOString().slice(0,10);
    const s=cell(v); const m=s.match(/(\d{4})-(\d{2})-(\d{2})/); return m?m[0]:null; };
  for(const row of rows){
    for(let i=0;i<row.length;i++){
      const c=cell(row[i]).replace(/\s+/g," ");
      if(!c) continue;
      const lc=c.toLowerCase();
      if((lc.startsWith("project no")||lc.startsWith("reference no")) && !out.code){ const v=cell(rightVal(row,i)); if(v) out.code=v; }
      else if(lc.startsWith("project name") && !out.name){ out.name=cell(rightVal(row,i)); }
      else if((lc.includes("customer") && lc.includes("name")) && !out.customer){ out.customer=cell(rightVal(row,i)); }
      else if(lc.startsWith("contract value") && out.contract_value==null){ out.contract_value=rightNum(row,i); }
      else if(lc.startsWith("total budget") && out.total_budget==null){ out.total_budget=rightNum(row,i); }
      else if((lc.startsWith("project manager")) && !out.pm){ out.pm=cell(rightVal(row,i)); }
      else if(lc.startsWith("project start date") && !out.start){ out.start=setDate(rightVal(row,i)); }
      else if(lc.startsWith("project end date") && !out.end){ out.end=setDate(rightVal(row,i)); }
    }
  }
  return out;
}

// แถวใน "(2) SUMMARY P&L": หา cell ที่เป็น cost code → budget = ตัวเลขตัวแรกถัดไป (ข้าม label "Budget") · desc = ข้อความก่อนหน้า
function parseLines(rows){
  const lines=[];
  for(const row of rows){
    let idx=-1;
    for(let i=0;i<row.length;i++){ const c=cell(row[i]); if(CODE_RE.test(c)){ idx=i; break; } }
    if(idx<0) continue;
    const code=cell(row[idx]);
    const budget=rightNum(row, idx);
    let desc=""; for(let j=idx-1;j>=0;j--){ const c=cell(row[j]); if(c){ desc=c; break; } }
    if(budget!=null && budget>0) lines.push({ cost_code:code, budget:Math.round(budget*100)/100, description:desc.slice(0,120) });
  }
  return lines;
}

export async function POST(req){
  if(!SERVICE || !SB_URL) return Response.json({ error:"เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY บน Vercel (ใส่แล้วต้อง Redeploy)" }, { status:500 });
  const hdr = req.headers.get("authorization")||"";
  const token = hdr.startsWith("Bearer ")?hdr.slice(7):null;
  if(!token) return Response.json({ error:"ไม่ได้เข้าสู่ระบบ" }, { status:401 });

  const admin = createClient(SB_URL, SERVICE, { auth:{ persistSession:false, autoRefreshToken:false } });
  const { data:who, error:authErr } = await admin.auth.getUser(token);
  const caller = who && who.user;
  if(authErr || !caller) return Response.json({ error:"เซสชันหมดอายุ — เข้าสู่ระบบใหม่" }, { status:401 });
  const { data:me } = await admin.from("hub_team").select("hub_role").eq("user_id", caller.id).maybeSingle();
  if(!me || !["owner","supervisor"].includes(me.hub_role)) return Response.json({ error:"เฉพาะ Owner / Supervisor เท่านั้นที่นำเข้างบได้" }, { status:403 });

  const body = await req.json().catch(()=>({}));
  const { file, filename, dryRun } = body;
  if(!file) return Response.json({ error:"ไม่พบไฟล์" }, { status:400 });

  let wb;
  try{ const buf = Buffer.from(String(file).replace(/^data:[^;]+;base64,/,""), "base64"); wb = XLSX.read(buf, { type:"buffer" }); }
  catch(e){ return Response.json({ error:"อ่านไฟล์ Excel ไม่ได้: "+(e?.message||e) }, { status:400 }); }

  const findSheet=(kw)=>wb.SheetNames.find(n=>n.replace(/\s+/g,"").toLowerCase().includes(kw));
  const sumName = findSheet("projectsummary") || wb.SheetNames.find(n=>/summary/i.test(n)&&/project/i.test(n));
  const plName  = wb.SheetNames.find(n=>/summary\s*p\s*&?\s*l/i.test(n)) || findSheet("summaryp&l") || findSheet("summarypl");
  if(!plName) return Response.json({ error:"ไม่พบชีต '(2) SUMMARY P&L' ในไฟล์ — ตรวจว่าเป็นไฟล์ BF มาตรฐาน" }, { status:400 });

  const asRows=(name)=> XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, raw:true, defval:null });
  const summary = sumName ? parseSummary(asRows(sumName)) : { code:"", name:"" };
  const lines   = parseLines(asRows(plName));

  if(!summary.code) return Response.json({ error:"อ่านรหัสโครงการ (Project No.) ไม่ได้จากชีต PROJECT SUMMARY" }, { status:400 });
  if(!lines.length) return Response.json({ error:"ไม่พบบรรทัดงบ (cost code + จำนวนเงิน) ในชีต SUMMARY P&L" }, { status:400 });

  // ตรวจ cost code กับ master
  const { data:master } = await admin.from("hub_cost_codes").select("code");
  const known = new Set((master||[]).map(m=>String(m.code).trim().toUpperCase()));
  const unknown = [...new Set(lines.filter(l=>!known.has(l.cost_code.toUpperCase())).map(l=>l.cost_code))];
  const sumLines = Math.round(lines.reduce((s,l)=>s+l.budget,0)*100)/100;

  // มีโครงการนี้อยู่แล้วไหม
  const { data:existing } = await admin.from("projects").select("id,code,name").eq("code", summary.code).maybeSingle();

  const preview = {
    project: { code:summary.code, name:summary.name, customer:summary.customer, contract_value:summary.contract_value,
               total_budget:summary.total_budget, pm:summary.pm, start:summary.start, end:summary.end,
               exists: !!existing },
    lines, sum_lines:sumLines,
    match_total: summary.total_budget!=null ? (Math.abs(sumLines-summary.total_budget)<1) : null,
    unknown_codes: unknown,
  };

  if(dryRun) return Response.json({ ok:true, dryRun:true, preview });
  if(unknown.length) return Response.json({ error:"มี cost code ที่ไม่มีในระบบ: "+unknown.join(", ")+" — แก้ไฟล์หรือเพิ่ม cost code ก่อน" }, { status:400 });

  // ── เขียนจริง ──
  const projPatch = {
    code: summary.code, name: summary.name || summary.code,
    contract_value: summary.contract_value, start_date: summary.start, end_date: summary.end,
    total_original_budget: sumLines, budget_amount: sumLines, budget_status: "active",
  };
  let projectId;
  if(existing){ projectId=existing.id; await admin.from("projects").update(projPatch).eq("id", projectId); }
  else{ const { data:ins, error:ie } = await admin.from("projects").insert({ ...projPatch, status:"active", created_by:caller.id }).select("id").single();
        if(ie) return Response.json({ error:"สร้างโครงการไม่สำเร็จ: "+ie.message }, { status:500 }); projectId=ins.id; }

  const today = new Date().toISOString().slice(0,10);
  const rows = lines.map(l=>({ project_id:projectId, project_code:summary.code, project_name:summary.name||summary.code,
    cost_code:l.cost_code, description:l.description, budget:l.budget, purchase_cost:0,
    ref_code:summary.code, pm_name:summary.pm||null, source_file:filename||"BF.xlsx", as_of:today,
    imported_by:caller.id, imported_at:new Date().toISOString() }));

  // แทนที่งบเดิมของโครงการนี้ทั้งหมด (replace) แล้วใส่ชุดใหม่
  const { error:de } = await admin.from("hub_project_budget").delete().eq("project_id", projectId);
  if(de) return Response.json({ error:"ล้างงบเดิมไม่สำเร็จ: "+de.message }, { status:500 });
  const { error:ine } = await admin.from("hub_project_budget").insert(rows);
  if(ine) return Response.json({ error:"บันทึกงบไม่สำเร็จ: "+ine.message }, { status:500 });

  return Response.json({ ok:true, project_id:projectId, created: !existing, lines:rows.length, sum:sumLines, preview });
}
