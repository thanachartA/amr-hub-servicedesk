// Daily digest ทุกเช้า 08:00 น. (ไทย = 01:00 UTC) → สรุปคำขอค้างของทั้งทีม ส่งอีเมลให้ หัวหน้า/Supervisor/Lead
// ส่งผ่าน Microsoft 365 SMTP (nodemailer)
// env ที่ต้องตั้งบน Vercel:
//   SMTP_HOST=smtp.office365.com · SMTP_PORT=587 · SMTP_USER=<mailbox> · SMTP_PASS=<password/app password>
//   MAIL_FROM="AMR Central Admin Hub <noreply@amrasia.com>"  (ถ้าไม่ตั้ง จะใช้ SMTP_USER)
//   CRON_SECRET=<สุ่มยาวๆ>  (Vercel ใส่ Authorization: Bearer <CRON_SECRET> ให้อัตโนมัติ)
//   MAIL_APP_URL=https://gahub.amrasia.com  (option) · DIGEST_TO=<อีเมลคั่นด้วย ,> (option override ผู้รับ)
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://kkbffgbotigddtfmultm.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.MAIL_APP_URL || "https://gahub.amrasia.com";
const OPEN_EXCLUDE = ["done","closed","cancelled","rejected"];
const esc = (s)=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmtDate = (d)=> d ? new Date(d).toLocaleDateString("th-TH",{day:"2-digit",month:"short",timeZone:"Asia/Bangkok"}) : "-";

function buildHtml(sum, todayStr){
  const RED="#EB0029", DARK="#262729", GREY="#5A6672", LINE="#E3E5E9";
  const kpi=(n,l,c)=>`<td align="center" style="padding:10px 6px;background:#F7F8FA;border-radius:8px"><div style="font-size:26px;font-weight:800;color:${c}">${n}</div><div style="font-size:12px;color:${GREY}">${l}</div></td>`;
  const rowsByPerson = sum.byPerson.map(p=>`<tr><td style="padding:6px 8px;border-bottom:1px solid ${LINE}">${esc(p.name)}</td><td align="center" style="padding:6px 8px;border-bottom:1px solid ${LINE}">${p.open}</td><td align="center" style="padding:6px 8px;border-bottom:1px solid ${LINE};color:${p.overdue?RED:DARK};font-weight:${p.overdue?700:400}">${p.overdue||"-"}</td></tr>`).join("");
  const overdueList = sum.overdue.slice(0,15).map(r=>`<tr><td style="padding:5px 8px;border-bottom:1px solid ${LINE}"><a href="${APP_URL}/requests/${r.id}" style="color:${RED};text-decoration:none">${esc(r.title||"(ไม่มีชื่อ)")}</a><div style="font-size:11px;color:${GREY}">${esc(r.type||"")} · ${esc(r.assignee||"ยังไม่มอบหมาย")} · ครบกำหนด ${fmtDate(r.sla)}</div></td></tr>`).join("") || `<tr><td style="padding:8px;color:${GREY}">— ไม่มีงานเลย SLA —</td></tr>`;
  const unassignedList = sum.unassigned.slice(0,10).map(r=>`<tr><td style="padding:5px 8px;border-bottom:1px solid ${LINE}"><a href="${APP_URL}/requests/${r.id}" style="color:${DARK};text-decoration:none">${esc(r.title||"(ไม่มีชื่อ)")}</a> <span style="font-size:11px;color:${GREY}">· ${esc(r.type||"")}</span></td></tr>`).join("") || `<tr><td style="padding:8px;color:${GREY}">— ทุกคำขอมีผู้รับผิดชอบแล้ว —</td></tr>`;
  return `<div style="font-family:Arial,'TH Sarabun New',sans-serif;max-width:640px;margin:0 auto;color:${DARK}">
    <div style="background:${DARK};padding:18px 20px;border-radius:10px 10px 0 0">
      <div style="color:#fff;font-size:19px;font-weight:800">สรุปคำขอค้าง — Central Admin Hub</div>
      <div style="color:#C9CCD1;font-size:13px;margin-top:2px">ประจำเช้าวันที่ ${todayStr}</div>
    </div>
    <div style="border:1px solid ${LINE};border-top:none;border-radius:0 0 10px 10px;padding:18px 20px">
      <table width="100%" cellspacing="8" cellpadding="0"><tr>
        ${kpi(sum.totalOpen,"เปิดค้างทั้งหมด",DARK)}
        ${kpi(sum.newCount,"ใหม่ยังไม่รับ",DARK)}
        ${kpi(sum.overdue.length,"เลย SLA",RED)}
        ${kpi(sum.unassigned.length,"ยังไม่มอบหมาย","#B26A00")}
      </tr></table>
      <div style="font-weight:800;color:${RED};margin:18px 0 6px">โหลดงานค้างรายคน</div>
      <table width="100%" style="border-collapse:collapse;font-size:13px">
        <tr style="background:#F7F8FA"><td style="padding:6px 8px;font-weight:700">ผู้รับผิดชอบ</td><td align="center" style="padding:6px 8px;font-weight:700">ค้าง</td><td align="center" style="padding:6px 8px;font-weight:700">เลย SLA</td></tr>
        ${rowsByPerson || `<tr><td colspan="3" style="padding:8px;color:${GREY}">— ไม่มีงานค้าง —</td></tr>`}
      </table>
      <div style="font-weight:800;color:${RED};margin:18px 0 6px">⛔ งานเลย SLA (เร่งด่วน)</div>
      <table width="100%" style="border-collapse:collapse;font-size:13px">${overdueList}</table>
      <div style="font-weight:800;color:#B26A00;margin:18px 0 6px">🟡 คำขอที่ยังไม่มีผู้รับผิดชอบ</div>
      <table width="100%" style="border-collapse:collapse;font-size:13px">${unassignedList}</table>
      <div style="margin-top:20px;text-align:center">
        <a href="${APP_URL}" style="display:inline-block;background:${RED};color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:700">เปิดระบบ Central Admin Hub</a>
      </div>
      <div style="font-size:11px;color:${GREY};margin-top:16px;text-align:center">อีเมลอัตโนมัติจากระบบ Central Admin Hub · ส่งทุกเช้า 08:00 น.</div>
    </div>
  </div>`;
}

export async function GET(req){
  // ── ตรวจสิทธิ์: Vercel Cron ส่ง Authorization: Bearer <CRON_SECRET> · หรือเรียกเองด้วย ?key= สำหรับทดสอบ ──
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const hdr = req.headers.get("authorization")||"";
  const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  const key = url.searchParams.get("key");
  if(secret && bearer!==secret && key!==secret) return Response.json({ error:"unauthorized" }, { status:401 });
  if(!SERVICE) return Response.json({ error:"ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY" }, { status:500 });

  const admin = createClient(SB_URL, SERVICE, { auth:{ persistSession:false, autoRefreshToken:false } });

  // ── ดึงข้อมูล ──
  const { data:reqs, error:re } = await admin.from("hub_requests")
    .select("id,title,status,sla_due_at,created_at,assignee_id,request_type_id")
    .not("status","in","("+OPEN_EXCLUDE.join(",")+")");
  if(re) return Response.json({ error:"query requests: "+re.message }, { status:500 });
  const { data:profs } = await admin.from("profiles").select("id,full_name,email");
  const { data:types } = await admin.from("hub_request_types").select("id,name");
  const pMap={}; (profs||[]).forEach(p=>pMap[p.id]=p);
  const tMap={}; (types||[]).forEach(t=>tMap[t.id]=t.name);
  const now = Date.now();

  const open = reqs||[];
  const overdue=[], unassigned=[], byPersonMap={};
  let newCount=0;
  open.forEach(r=>{
    const od = r.sla_due_at && new Date(r.sla_due_at).getTime() < now;
    const who = r.assignee_id ? (pMap[r.assignee_id]?.full_name || "ไม่ทราบชื่อ") : null;
    const row = { id:r.id, title:r.title, type:tMap[r.request_type_id], assignee:who, sla:r.sla_due_at };
    if(!r.assignee_id){ unassigned.push(row); newCount++; }
    else if(r.status==="new") newCount++;
    if(od) overdue.push(row);
    if(who){ byPersonMap[who]=byPersonMap[who]||{name:who,open:0,overdue:0}; byPersonMap[who].open++; if(od) byPersonMap[who].overdue++; }
  });
  overdue.sort((a,b)=> new Date(a.sla)-new Date(b.sla));
  const byPerson = Object.values(byPersonMap).sort((a,b)=>b.open-a.open);
  const sum = { totalOpen:open.length, newCount, overdue, unassigned, byPerson };

  const todayStr = new Date().toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"Asia/Bangkok"});
  const html = buildHtml(sum, todayStr);

  // ── โหมดพรีวิว (ไม่ส่งจริง) เพื่อทดสอบ ──
  if(url.searchParams.get("preview")==="1") return new Response(html, { headers:{ "Content-Type":"text/html; charset=utf-8" } });

  // ── ผู้รับ: หัวหน้า/Supervisor/Lead (หรือ override ด้วย DIGEST_TO) ──
  let recipients=[];
  if(process.env.DIGEST_TO){ recipients = process.env.DIGEST_TO.split(",").map(s=>s.trim()).filter(Boolean); }
  else {
    const { data:team } = await admin.from("hub_team").select("user_id,hub_role").in("hub_role",["owner","supervisor","lead"]);
    recipients = (team||[]).map(t=>pMap[t.user_id]?.email).filter(Boolean);
  }
  recipients = [...new Set(recipients)];
  if(!recipients.length) return Response.json({ ok:true, sent:0, note:"ไม่มีผู้รับ (ตรวจ role/email)" , summary:{open:open.length,overdue:overdue.length} });

  // ── ส่งอีเมลผ่าน M365 SMTP ──
  const SMTP_USER=process.env.SMTP_USER, SMTP_PASS=process.env.SMTP_PASS;
  if(!SMTP_USER || !SMTP_PASS) return Response.json({ error:"ยังไม่ได้ตั้ง SMTP_USER / SMTP_PASS" }, { status:500 });
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false, requireTLS: true, auth:{ user:SMTP_USER, pass:SMTP_PASS },
    tls:{ ciphers:"TLSv1.2" },
  });
  const from = process.env.MAIL_FROM || SMTP_USER;
  const subject = "สรุปคำขอค้าง Central Admin Hub — "+todayStr+" (ค้าง "+open.length+" · เลย SLA "+overdue.length+")";
  let sent=0; const errs=[];
  for(const to of recipients){
    try{ await transport.sendMail({ from, to, subject, html }); sent++; }
    catch(e){ errs.push(to+": "+(e?.message||e)); }
  }
  return Response.json({ ok:true, sent, recipients:recipients.length, errors:errs, summary:{ open:open.length, overdue:overdue.length, unassigned:unassigned.length } });
}
