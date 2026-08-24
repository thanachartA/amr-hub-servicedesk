"use client";
// นำเข้างบโครงการจากไฟล์ BF (.xlsx) → พรีวิว → ยืนยัน → สร้าง/อัปเดตโครงการ + ลงงบราย cost code
import { useEffect, useState } from "react";
import Shell from "../../../components/Shell";
import { supabase } from "../../../lib/supabaseClient";

const fmt=(n)=> (n==null||isNaN(n))?"-":Number(n).toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2});

export default function BudgetImport(){
  const [ready,setReady]=useState(false); const [canManage,setCanManage]=useState(false);
  const [file,setFile]=useState(null); const [b64,setB64]=useState(null);
  const [busy,setBusy]=useState(false); const [err,setErr]=useState(null); const [msg,setMsg]=useState(null);
  const [preview,setPreview]=useState(null); const [done,setDone]=useState(null);

  useEffect(()=>{ (async()=>{
    const { data:sess }=await supabase.auth.getSession();
    if(!sess.session){ setReady(true); return; }
    const { data:t }=await supabase.from("hub_team").select("hub_role").eq("user_id",sess.session.user.id).maybeSingle();
    setCanManage(["owner","supervisor"].includes(t?.hub_role)); setReady(true);
  })(); },[]);

  async function pick(f){
    setErr(null); setMsg(null); setPreview(null); setDone(null);
    if(!f){ setFile(null); setB64(null); return; }
    setFile(f);
    const rd=new FileReader(); rd.onload=()=>setB64(String(rd.result)); rd.readAsDataURL(f);
  }

  async function call(dryRun){
    if(!b64){ setErr("เลือกไฟล์ก่อน"); return; }
    setBusy(true); setErr(null); setMsg(null);
    try{
      const { data:sess }=await supabase.auth.getSession();
      const token=sess.session?.access_token;
      const res=await fetch("/api/admin/import-budget",{ method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer "+token },
        body: JSON.stringify({ file:b64, filename:file?.name, dryRun }) });
      const j=await res.json();
      if(!res.ok||j.error) throw new Error(j.error||("HTTP "+res.status));
      if(dryRun){ setPreview(j.preview); }
      else{ setDone(j); setPreview(null); setMsg("นำเข้าสำเร็จ ✓"); }
    }catch(e){ setErr(e?.message||String(e)); }
    setBusy(false);
  }

  if(!ready) return <Shell><div className="muted" style={{padding:20}}>กำลังโหลด…</div></Shell>;
  if(!canManage) return <Shell><div style={{padding:20,color:"#B03A2E"}}>เฉพาะ Owner / Supervisor เท่านั้นที่นำเข้างบโครงการได้</div></Shell>;

  return (<Shell>
    <div style={{maxWidth:920,margin:"0 auto"}}>
      <h2 style={{margin:"4px 0 2px"}}>นำเข้างบโครงการ (Budget File)</h2>
      <div className="muted" style={{fontSize:12.5,marginBottom:14}}>อัปโหลดไฟล์ BF (.xlsx) ของโครงการ → ระบบอ่านหัวโครงการ + งบราย cost code จากชีต <b>(1) PROJECT SUMMARY</b> และ <b>(2) SUMMARY P&L</b> อัตโนมัติ · พรีวิวก่อนแล้วค่อยยืนยัน</div>

      <div style={{border:"1px solid #E4E7EB",borderRadius:10,padding:16,background:"#fff",marginBottom:14}}>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={e=>pick(e.target.files&&e.target.files[0])}/>
        <div style={{marginTop:12,display:"flex",gap:8}}>
          <button className="btn" disabled={!b64||busy} onClick={()=>call(true)}>{busy?"⏳ กำลังอ่าน…":"🔎 อ่านไฟล์ + พรีวิว"}</button>
          {preview&&!preview.unknown_codes?.length&&<button className="btn" style={{background:"#2E7D5B"}} disabled={busy} onClick={()=>call(false)}>{busy?"⏳ กำลังนำเข้า…":(preview.project.exists?"✔ ยืนยันอัปเดตงบ":"✔ ยืนยันสร้างโครงการ + ลงงบ")}</button>}
        </div>
      </div>

      {err&&<div style={{background:"#FFF6F6",border:"1.5px solid #F0B7BC",color:"#B03A2E",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,whiteSpace:"pre-wrap"}}>⛔ {err}</div>}
      {msg&&<div style={{background:"#F0F9F3",border:"1.5px solid #BFE3CC",color:"#2E7D5B",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13}}>{msg}</div>}

      {done&&<div style={{background:"#F0F9F3",border:"1.5px solid #BFE3CC",borderRadius:8,padding:14,marginBottom:14}}>
        <b style={{color:"#2E7D5B"}}>{done.created?"สร้างโครงการใหม่":"อัปเดตงบโครงการ"} สำเร็จ</b>
        <div style={{fontSize:13,marginTop:4}}>ลงงบ {done.lines} บรรทัด · รวม {fmt(done.sum)} บาท — หน้าเปิดคำขอจะเห็น “งบเหลือ” รายcost code ทันที</div>
      </div>}

      {preview&&<div style={{border:"1px solid #E4E7EB",borderRadius:10,overflow:"hidden",background:"#fff"}}>
        <div style={{padding:"12px 16px",background:preview.project.exists?"#FFF7EC":"#F0F7F2",borderBottom:"1px solid #E4E7EB"}}>
          <div style={{fontWeight:800,fontSize:15}}>{preview.project.code} — {preview.project.name||"(ไม่พบชื่อ)"}</div>
          <div className="muted" style={{fontSize:12.5,marginTop:3,lineHeight:1.8}}>
            ลูกค้า: {preview.project.customer||"-"} · Contract: {fmt(preview.project.contract_value)} · PM: {preview.project.pm||"-"}<br/>
            ระยะ: {preview.project.start||"-"} → {preview.project.end||"-"} · {preview.project.exists
              ? <b style={{color:"#B26A00"}}>⚠ โครงการนี้มีอยู่แล้ว — ยืนยันจะแทนที่งบเดิมทั้งหมด</b>
              : <b style={{color:"#2E7D5B"}}>โครงการใหม่ (ยังไม่มีในระบบ)</b>}
          </div>
        </div>
        {preview.unknown_codes?.length>0&&<div style={{padding:"10px 16px",background:"#FFF6F6",color:"#B03A2E",fontSize:12.5,borderBottom:"1px solid #F0B7BC"}}>
          ⛔ cost code ที่ไม่มีในระบบ (ต้องแก้ก่อนนำเข้า): <b>{preview.unknown_codes.join(", ")}</b></div>}
        <table style={{margin:0,fontSize:12.5}}>
          <thead><tr style={{background:"#F8FAFC"}}><th style={{width:110}}>Cost Code</th><th>รายละเอียด</th><th className="right" style={{width:140}}>งบ (บาท)</th></tr></thead>
          <tbody>{preview.lines.map((l,i)=>(<tr key={i}>
            <td><b>{l.cost_code}</b></td><td>{l.description}</td><td className="right">{fmt(l.budget)}</td></tr>))}
          </tbody>
          <tfoot><tr style={{fontWeight:800,background:"#FAFDFB",borderTop:"2px solid #DDE6E0"}}>
            <td colSpan="2">รวม {preview.lines.length} บรรทัด</td><td className="right" style={{color:"#2E7D5B"}}>{fmt(preview.sum_lines)}</td></tr>
            {preview.match_total!=null&&<tr><td colSpan="3" style={{fontSize:11.5,color:preview.match_total?"#2E7D5B":"#B03A2E",padding:"4px 12px"}}>
              {preview.match_total?"✓ ยอดรวมตรงกับ Total Budget Cost ในไฟล์":"⚠ ยอดรวมไม่ตรงกับ Total Budget Cost ในไฟล์ ("+fmt(preview.project.total_budget)+") — ตรวจไฟล์อีกครั้ง"}</td></tr>}
          </tfoot>
        </table>
      </div>}
    </div>
  </Shell>);
}
