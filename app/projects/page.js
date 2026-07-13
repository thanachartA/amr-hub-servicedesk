"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { fmtMoney, downloadCSV, readSheetAt, toNum, toDate } from "../../components/util";

const APV={pending:"รออนุมัติ",approved:"อนุมัติแล้ว",rejected:"ไม่อนุมัติ"};

// หัวคอลัมน์ของ ERP Budget Report (sheet "BudgetReport")
const A={
  ref_code:["ref._code","ref_code","refcode","ref"],
  project_code:["project_code","projectcode","project_no","รหัสโครงการ"],
  project_name:["project_name","projectname","ชื่อโครงการ"],
  cost_code:["cost_code","costcode","รหัสต้นทุน"],
  description:["description","desc","รายละเอียด"],
  pm_name:["pm_name","pmname","pm","ผู้จัดการโครงการ"],
  budget:["budget","งบประมาณ"],
  purchase_cost:["purchase_cost","purchasecost"],
  actual_ac:["actual_cost_(a/c)","actual_cost_(ac)","actual_cost_a/c","actual_cost"],
  unbook:["unbook"],
  actual_all:["actual_cost_(all)","actual_cost_all"],
};
const norm=s=>String(s??"").trim().toLowerCase().replace(/[\s\n\r]+/g,"_");
function mapHead(head){
  const cells=head.map(norm);
  const ix={};
  for(const k in A) ix[k]=cells.findIndex(c=>A[k].includes(c));
  return ix;
}
// Project Code จาก ERP มีอักขระซ่อน (zero-width) ติดมา
const clean=s=>String(s??"").replace(/[​-‍﻿‌]/g,"").trim();

export default function Projects(){
  const [pb,setPb]=useState([]); const [detail,setDetail]=useState([]);
  const [canManage,setCanManage]=useState(false);
  const [busy,setBusy]=useState(false); const [result,setResult]=useState(null); const [msg,setMsg]=useState(null);
  const [q,setQ]=useState(""); const [onlyOver,setOnlyOver]=useState(false);
  const [syncProjects,setSyncProjects]=useState(true);

  async function load(){
    const { data:sess }=await supabase.auth.getSession();
    const { data:t }=await supabase.from("hub_team").select("hub_role").eq("user_id",sess.session.user.id).maybeSingle();
    setCanManage(["owner","supervisor"].includes(t?.hub_role));
    const [p,e]=await Promise.all([
      supabase.from("hub_project_budget").select("*").limit(20000),
      supabase.from("hub_expense_entries")
        .select("amount,approval_status,created_at,project_id,projects(code,name),hub_cost_codes(code,name),hub_requests(ticket_no,title)"),
    ]);
    setPb(p.data||[]); setDetail(e.data||[]);
  }
  useEffect(()=>{ load(); },[]);

  // ค่าใช้จ่ายที่ Hub บันทึกเอง (รายโครงการ)
  const hubByCode=useMemo(()=>{
    const m={};
    detail.forEach(x=>{ const c=x.projects?.code; if(!c) return;
      m[c]=(m[c]||0)+(Number(x.amount)||0); });
    return m;
  },[detail]);

  // รวมเป็นรายโครงการ
  const rows=useMemo(()=>{
    const m={};
    pb.forEach(x=>{
      const k=x.ref_code;
      if(!m[k]) m[k]={ref:k,code:x.project_code,name:x.project_name,pm:x.pm_name,
        budget:0,purchase:0,actual:0,unbook:0,lines:[],asOf:x.as_of};
      const r=m[k];
      r.budget+=Number(x.budget)||0;
      r.purchase+=Number(x.purchase_cost)||0;
      r.actual+=Number(x.actual_all)||0;
      r.unbook+=Number(x.unbook)||0;
      r.lines.push(x);
    });
    return Object.values(m).map(r=>({...r, hub:hubByCode[r.ref]||0, balance:r.budget-r.actual}))
      .sort((a,b)=>b.actual-a.actual);
  },[pb,hubByCode]);

  const shown=useMemo(()=>rows.filter(r=>{
    if(onlyOver && r.balance>=0) return false;
    if(!q) return true;
    const s=q.toLowerCase();
    return (r.ref||"").toLowerCase().includes(s) || (r.code||"").toLowerCase().includes(s)
        || (r.name||"").toLowerCase().includes(s) || (r.pm||"").toLowerCase().includes(s);
  }),[rows,q,onlyOver]);

  const tot=rows.reduce((s,r)=>({budget:s.budget+r.budget,actual:s.actual+r.actual,
    purchase:s.purchase+r.purchase,over:s.over+(r.balance<0?1:0)}),{budget:0,actual:0,purchase:0,over:0});
  const asOf=pb.find(x=>x.as_of)?.as_of;

  const day=new Date().toISOString().slice(0,10);
  function exportSummary(){
    downloadCSV("ต้นทุนโครงการ_"+day+".csv",[
      {label:"Ref. Code",key:"ref"},{label:"Project Code",key:"code"},{label:"ชื่อโครงการ",key:"name"},
      {label:"PM",key:"pm"},{label:"Budget",key:"budget"},{label:"Purchase Cost",key:"purchase"},
      {label:"Actual (ALL)",key:"actual"},{label:"Balance",key:"balance"},
      {label:"% ใช้",get:r=>r.budget?Math.round(100*r.actual/r.budget):""},
      {label:"Hub บันทึก",key:"hub"},
    ], rows);
  }
  function exportLines(){
    downloadCSV("ต้นทุนโครงการ_รายcostcode_"+day+".csv",[
      {label:"Ref. Code",key:"ref_code"},{label:"Project Code",key:"project_code"},{label:"ชื่อโครงการ",key:"project_name"},
      {label:"Cost Code",key:"cost_code"},{label:"Description",key:"description"},{label:"PM",key:"pm_name"},
      {label:"Budget",key:"budget"},{label:"Purchase Cost",key:"purchase_cost"},
      {label:"Actual (A/C)",key:"actual_ac"},{label:"Unbook",key:"unbook"},{label:"Actual (ALL)",key:"actual_all"},
    ], pb);
  }

  async function importFile(e){
    const file=e.target.files?.[0]; e.target.value="";
    if(!file) return;
    setBusy(true); setResult(null); setMsg(null);
    try{
      const { grid, headerRow }=await readSheetAt(file,{ sheetName:"BudgetReport", mustHave:["ref._code","cost_code","budget"] });
      if(grid.length<2) throw new Error("ไฟล์ว่าง หรือหาหัวตารางไม่เจอ");
      const ix=mapHead(grid[0]);
      const need=["ref_code","budget"].filter(k=>ix[k]<0);
      if(need.length) throw new Error("ไม่พบคอลัมน์: "+need.join(", ")+" — ต้องเป็น sheet \"BudgetReport\" จาก ERP");

      const { data:sess }=await supabase.auth.getSession(); const uid=sess.session.user.id;
      const g=(row,k)=>ix[k]>=0?clean(row[ix[k]]):"";
      const n=(row,k)=>{ const v=toNum(g(row,k)); return isNaN(v)?0:v; };

      const recs=[]; const errors=[]; const seen={};
      for(let r=1;r<grid.length;r++){
        const row=grid[r];
        const ref=g(row,"ref_code");
        if(!ref) continue;
        const cc=g(row,"cost_code")||"";
        const key=ref+"|"+cc;
        if(seen[key]){ errors.push("แถว "+(r+headerRow+1)+": ซ้ำในไฟล์ ("+ref+" / "+cc+")"); continue; }
        seen[key]=1;
        recs.push({
          ref_code:ref, project_code:g(row,"project_code")||null, project_name:g(row,"project_name")||null,
          cost_code:cc, description:g(row,"description")||null, pm_name:g(row,"pm_name")||null,
          budget:n(row,"budget"), purchase_cost:n(row,"purchase_cost"),
          actual_ac:n(row,"actual_ac"), unbook:n(row,"unbook"),
          actual_all: ix.actual_all>=0 ? n(row,"actual_all") : (n(row,"actual_ac")+n(row,"unbook")),
          as_of:new Date().toISOString().slice(0,10),
          source_file:file.name, imported_by:uid,
        });
      }
      if(!recs.length) throw new Error("ไม่มีแถวที่ใช้ได้เลย");

      // 1) snapshot = ล้างของเดิมแล้วใส่ใหม่ทั้งชุด
      const { error:delErr }=await supabase.from("hub_project_budget").delete()
        .neq("id","00000000-0000-0000-0000-000000000000");
      if(delErr) errors.push("ล้างข้อมูลเดิมไม่สำเร็จ: "+delErr.message);

      // 2) sync ทะเบียนโครงการ (ถ้าเลือก)
      let created=0;
      const { data:projs }=await supabase.from("projects").select("id,code").limit(5000);
      const byCode={}; (projs||[]).forEach(p=>{ if(p.code) byCode[p.code.trim().toLowerCase()]=p.id; });
      if(syncProjects){
        const master={};
        recs.forEach(x=>{ if(!master[x.ref_code]) master[x.ref_code]={code:x.ref_code,name:x.project_name||x.ref_code,budget:0};
          master[x.ref_code].budget+=x.budget; });
        const news=Object.values(master).filter(m=>!byCode[m.code.toLowerCase()]);
        for(let i=0;i<news.length;i+=200){
          const chunk=news.slice(i,i+200).map(m=>({code:m.code,name:m.name,budget_amount:m.budget,status:"active"}));
          const { data:ins, error }=await supabase.from("projects").insert(chunk).select("id,code");
          if(error) errors.push("สร้างโครงการใหม่ไม่สำเร็จ: "+error.message);
          else { created+=ins.length; ins.forEach(p=>{ byCode[p.code.trim().toLowerCase()]=p.id; }); }
        }
      }
      recs.forEach(x=>{ x.project_id=byCode[x.ref_code.toLowerCase()]||null; });

      // 3) insert
      let ok=0;
      for(let i=0;i<recs.length;i+=300){
        const chunk=recs.slice(i,i+300);
        const { error }=await supabase.from("hub_project_budget").insert(chunk);
        if(error) errors.push("บันทึกไม่สำเร็จ: "+error.message); else ok+=chunk.length;
      }
      const unmatched=recs.filter(x=>!x.project_id).length;
      setResult({ ok, total:recs.length, errors, created, unmatched,
        budget:recs.reduce((s,x)=>s+x.budget,0), actual:recs.reduce((s,x)=>s+x.actual_all,0) });
      await load();
    }catch(ex){ setResult({ errors:[ex.message] }); }
    setBusy(false);
  }

  async function clearAll(){
    if(!confirm("ลบข้อมูลต้นทุนโครงการทั้งหมด ("+pb.length+" แถว) ?\n\nย้อนกลับไม่ได้")) return;
    const { error }=await supabase.from("hub_project_budget").delete().neq("id","00000000-0000-0000-0000-000000000000");
    if(error){ setMsg("ลบไม่สำเร็จ: "+error.message); return; }
    setMsg("ลบเรียบร้อย"); setResult(null); await load();
  }

  return (<Shell title="รายงานต้นทุนรายโครงการ">
    {msg&&<div className="ok">{msg}</div>}

    {canManage&&(<div className="card">
      <h2>📥 นำเข้า ERP Budget Report</h2>
      <p className="muted" style={{fontSize:12.5,lineHeight:1.8,marginTop:-4}}>
        อัปโหลดไฟล์ <span className="mono">Budget Report_*.xlsx</span> ที่ export จาก ERP ได้ตรง ๆ —
        ระบบอ่าน sheet <b>BudgetReport</b> และหาหัวตารางเอง<br/>
        ใช้ <b>Ref. Code</b> เป็นตัวแมตช์โครงการ · เป็น <b>snapshot</b> → อัปโหลดใหม่ = <b>แทนที่ของเดิมทั้งชุด</b> (ข้อมูลไม่บาน)
      </p>
      <label style={{display:"flex",alignItems:"center",gap:8,margin:"10px 0",fontSize:12.5,cursor:"pointer"}}>
        <input type="checkbox" checked={syncProjects} onChange={e=>setSyncProjects(e.target.checked)} style={{width:"auto",margin:0}}/>
        สร้างโครงการที่ยังไม่มีในระบบให้อัตโนมัติ (จาก Ref. Code + ชื่อ + งบ)
      </label>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <label className="btn sm" style={{cursor:"pointer",margin:0}}>
          {busy?"กำลังอ่านไฟล์…":"⬆ อัปโหลด Budget Report (.xlsx)"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={importFile} disabled={busy} style={{display:"none"}}/>
        </label>
        {pb.length>0&&<>
          <button type="button" className="btn sm sec" onClick={exportLines}>⬇ Export รายละเอียด ({pb.length})</button>
          <button type="button" className="btn sm sec" style={{color:"#B03A2E"}} onClick={clearAll}>ล้างข้อมูล</button>
        </>}
      </div>
      {result&&(<div style={{marginTop:12,background:"#F8FAFC",border:"1px solid #E4E7EB",borderRadius:8,padding:"10px 12px",fontSize:12.5,lineHeight:1.9}}>
        {result.ok>0&&<>
          <div>✅ นำเข้า <b>{result.ok}</b> / {result.total} แถว</div>
          <div>งบรวม <b>{fmtMoney(result.budget)}</b> · ใช้จริงรวม <b>{fmtMoney(result.actual)}</b></div>
          {result.created>0&&<div style={{color:"#2E7D5B"}}>➕ สร้างโครงการใหม่ในระบบ <b>{result.created}</b> รายการ</div>}
          {result.unmatched>0&&<div style={{color:"#B26A00"}}>⚠️ ยังไม่ผูกกับทะเบียนโครงการ {result.unmatched} แถว</div>}
        </>}
        {result.errors?.length>0&&<div style={{color:"#B03A2E"}}>
          ⚠️ ปัญหา {result.errors.length} รายการ:
          <ul style={{margin:"4px 0 0 18px"}}>{result.errors.slice(0,6).map((e,i)=>(<li key={i}>{e}</li>))}</ul>
        </div>}
      </div>)}
    </div>)}

    {pb.length===0 ? (
      <div className="card"><div className="muted">ยังไม่มีข้อมูล — อัปโหลด ERP Budget Report เพื่อดู Budget vs Actual รายโครงการ</div></div>
    ) : (<>

    <div className="kpis" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
      <div className="kpi"><div className="n" style={{fontSize:19}}>{rows.length}</div><div className="l">โครงการ{asOf?" (ณ "+asOf+")":""}</div></div>
      <div className="kpi"><div className="n" style={{fontSize:19}}>{fmtMoney(tot.budget)}</div><div className="l">Budget รวม</div></div>
      <div className="kpi"><div className="n" style={{fontSize:19}}>{fmtMoney(tot.actual)}</div><div className="l">Actual (ALL) รวม</div></div>
      <div className="kpi" style={{borderTopColor:tot.budget-tot.actual<0?"#B03A2E":undefined}}>
        <div className="n" style={{fontSize:19,color:tot.budget-tot.actual<0?"#B03A2E":"inherit"}}>{fmtMoney(tot.budget-tot.actual)}</div>
        <div className="l">Balance รวม</div></div>
      <div className="kpi red"><div className="n" style={{fontSize:19}}>{tot.over}</div><div className="l">โครงการที่เกินงบ</div></div>
    </div>

    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:8}}>
        <h2 style={{margin:0}}>Budget vs Actual รายโครงการ</h2>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา Ref / ชื่อ / PM…" style={{width:220}}/>
          <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12.5,cursor:"pointer",whiteSpace:"nowrap"}}>
            <input type="checkbox" checked={onlyOver} onChange={e=>setOnlyOver(e.target.checked)} style={{width:"auto",margin:0}}/>
            เฉพาะที่เกินงบ
          </label>
          <button className="btn sm sec" onClick={exportSummary}>⬇ Export</button>
        </div>
      </div>
      <table><thead><tr>
        <th>โครงการ</th><th>PM</th>
        <th className="right">Budget</th><th className="right">Purchase</th>
        <th className="right">Actual (ALL)</th><th className="right">Balance</th><th className="right">% ใช้</th>
      </tr></thead>
      <tbody>{shown.slice(0,300).map(r=>{
        const pct=r.budget?Math.round(100*r.actual/r.budget):0;
        return (<tr key={r.ref}>
          <td><b className="mono" style={{fontSize:12}}>{r.ref}</b>
            <div className="muted" style={{fontSize:11.5}}>{r.name}</div></td>
          <td className="muted" style={{fontSize:11.5}}>{r.pm||"—"}</td>
          <td className="right">{r.budget?fmtMoney(r.budget):"—"}</td>
          <td className="right muted">{r.purchase?fmtMoney(r.purchase):"—"}</td>
          <td className="right"><b>{r.actual?fmtMoney(r.actual):"—"}</b></td>
          <td className="right" style={{color:r.balance<0?"#B03A2E":"inherit"}}>{fmtMoney(r.balance)}</td>
          <td className="right">{r.budget
            ? <b style={{color:pct>100?"#B03A2E":pct>85?"#B26A00":"#2E7D5B"}}>{pct}%</b>
            : <span className="muted">ไม่มีงบ</span>}</td>
        </tr>);
      })}
      {!shown.length&&<tr><td colSpan="7" className="muted">ไม่พบโครงการที่ค้นหา</td></tr>}
      </tbody>
      {shown.length>0&&<tfoot><tr style={{fontWeight:700,borderTop:"2px solid #DDE3E8"}}>
        <td colSpan="2">รวม {shown.length===rows.length?rows.length+" โครงการ":shown.length+" / "+rows.length+" โครงการ"}</td>
        <td className="right">{fmtMoney(shown.reduce((s,r)=>s+r.budget,0))}</td>
        <td className="right">{fmtMoney(shown.reduce((s,r)=>s+r.purchase,0))}</td>
        <td className="right">{fmtMoney(shown.reduce((s,r)=>s+r.actual,0))}</td>
        <td className="right">{fmtMoney(shown.reduce((s,r)=>s+r.balance,0))}</td>
        <td></td>
      </tr></tfoot>}
      </table>
      {shown.length>300&&<p className="muted" style={{fontSize:12,marginTop:8}}>
        แสดง 300 แถวแรกจาก {shown.length} — ใช้ช่องค้นหา หรือกด Export เพื่อดูทั้งหมด</p>}
      <p className="muted" style={{fontSize:11.5,marginTop:10}}>
        <b>Actual (ALL)</b> = Actual Cost (A/C) + Unbook · <b>Balance</b> = Budget − Actual (ALL) ·
        ตัวเลขทั้งหมดมาจาก ERP โดยตรง (snapshot ณ วันที่ export)
      </p>
    </div>
    </>)}
  </Shell>);
}
