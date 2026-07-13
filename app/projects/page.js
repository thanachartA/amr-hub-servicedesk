"use client";
import { useEffect, useState } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { fmtMoney, downloadCSV, readSheet, toNum, toDate } from "../../components/util";

const APV={pending:"รออนุมัติ",approved:"อนุมัติแล้ว",rejected:"ไม่อนุมัติ"};

// หัวคอลัมน์ที่ยอมรับ (รองรับทั้งไทย/อังกฤษ เผื่อ ERP export มาคนละชื่อ)
const ALIAS={
  project_code:["project_code","projectcode","รหัสโครงการ","project","job_no","job"],
  doc_no:["doc_no","docno","document_no","เลขที่เอกสาร","voucher","voucher_no","ref","doc"],
  line_no:["line_no","lineno","line","บรรทัด","item_no"],
  doc_date:["doc_date","date","วันที่","posting_date","วันที่เอกสาร"],
  cost_code:["cost_code","costcode","รหัสต้นทุน","account","account_code"],
  description:["description","desc","รายละเอียด","detail","narration"],
  vendor:["vendor","supplier","ผู้ขาย","คู่ค้า"],
  amount:["amount","จำนวนเงิน","total","ยอดเงิน","value","debit"],
};
function mapHeader(head){
  const norm=head.map(h=>String(h||"").trim().toLowerCase().replace(/\s+/g,"_"));
  const idx={};
  for(const key in ALIAS) idx[key]=norm.findIndex(h=>ALIAS[key].includes(h));
  return idx;
}

export default function Projects(){
  const [rows,setRows]=useState([]); const [detail,setDetail]=useState([]);
  const [erp,setErp]=useState([]); const [canManage,setCanManage]=useState(false);
  const [busy,setBusy]=useState(false); const [result,setResult]=useState(null); const [msg,setMsg]=useState(null);

  async function load(){
    const { data:sess }=await supabase.auth.getSession();
    const { data:t }=await supabase.from("hub_team").select("hub_role").eq("user_id",sess.session.user.id).maybeSingle();
    setCanManage(["owner","supervisor"].includes(t?.hub_role));

    const [{ data:exp }, { data:erpRows }, { data:projs }]=await Promise.all([
      supabase.from("hub_expense_entries")
        .select("amount,approval_status,created_at,erp_ref,project_id,projects(code,name,budget_amount),hub_cost_codes(code,name),hub_requests(ticket_no,title)"),
      supabase.from("hub_erp_costs").select("project_id,project_code,doc_no,line_no,doc_date,cost_code,description,vendor,amount").limit(20000),
      supabase.from("projects").select("id,code,name,budget_amount").limit(1000),
    ]);
    setDetail(exp||[]); setErp(erpRows||[]);

    const map={};
    const touch=(pid,code,name,budget)=>{
      if(!map[pid]) map[pid]={code,name,budget:Number(budget)||0,actual:0,pending:0,erp:0};
      return map[pid];
    };
    (exp||[]).forEach(x=>{ if(!x.project_id) return; const p=x.projects||{};
      const m=touch(x.project_id,p.code,p.name,p.budget_amount);
      m.actual+=Number(x.amount)||0;
      if(x.approval_status==="pending") m.pending+=Number(x.amount)||0;
    });
    const byId={}; (projs||[]).forEach(p=>byId[p.id]=p);
    (erpRows||[]).forEach(x=>{
      const key=x.project_id||("code:"+x.project_code);
      const p=x.project_id?byId[x.project_id]:null;
      const m=touch(key, p?.code||x.project_code, p?.name||"(ไม่พบรหัสโครงการนี้ในระบบ)", p?.budget_amount);
      m.erp+=Number(x.amount)||0;
    });
    setRows(Object.values(map).sort((a,b)=>(b.erp+b.actual)-(a.erp+a.actual)));
  }
  useEffect(()=>{ load(); },[]);

  const day=new Date().toISOString().slice(0,10);
  function exportSummary(){
    downloadCSV("ต้นทุนรายโครงการ_สรุป_"+day+".csv",[
      {label:"โครงการ",get:r=>(r.code||"")+" · "+(r.name||"")},
      {label:"งบประมาณ",key:"budget"},
      {label:"Hub บันทึก",key:"actual"},
      {label:"ERP จริง",key:"erp"},
      {label:"ผลต่าง (ERP-Hub)",get:r=>r.erp-r.actual},
      {label:"คงเหลือจากงบ",get:r=>r.budget-Math.max(r.erp,r.actual)},
      {label:"% ใช้",get:r=>r.budget?Math.round(100*Math.max(r.erp,r.actual)/r.budget):0},
      {label:"รออนุมัติ",key:"pending"},
    ], rows);
  }
  function exportDetail(){
    downloadCSV("ค่าใช้จ่าย_Hub_"+day+".csv",[
      {label:"วันที่",get:r=>r.created_at?new Date(r.created_at).toLocaleString("th-TH"):""},
      {label:"Ticket",get:r=>r.hub_requests?.ticket_no||""},
      {label:"งาน",get:r=>r.hub_requests?.title||""},
      {label:"โครงการ",get:r=>r.projects?(r.projects.code+" · "+r.projects.name):""},
      {label:"Cost Code",get:r=>r.hub_cost_codes?(r.hub_cost_codes.code+" · "+r.hub_cost_codes.name):""},
      {label:"จำนวนเงิน",key:"amount"},
      {label:"สถานะอนุมัติ",get:r=>APV[r.approval_status]||r.approval_status},
      {label:"ERP Ref",key:"erp_ref"},
    ], detail);
  }
  function erpTemplate(){
    downloadCSV("erp_cost_template.csv",[
      {key:"project_code",label:"project_code"},{key:"doc_no",label:"doc_no"},{key:"line_no",label:"line_no"},
      {key:"doc_date",label:"doc_date"},{key:"cost_code",label:"cost_code"},{key:"description",label:"description"},
      {key:"vendor",label:"vendor"},{key:"amount",label:"amount"},
    ],[{project_code:"PRJ-001",doc_no:"PV6900123",line_no:1,doc_date:"2026-07-01",
        cost_code:"5101",description:"ค่าเดินทางติดตั้งอุปกรณ์",vendor:"บริษัท ก จำกัด",amount:15000}]);
  }
  function exportErp(){
    downloadCSV("ต้นทุน_ERP_"+day+".csv",[
      {label:"รหัสโครงการ",key:"project_code"},{label:"เลขที่เอกสาร",key:"doc_no"},{label:"บรรทัด",key:"line_no"},
      {label:"วันที่",key:"doc_date"},{label:"Cost Code",key:"cost_code"},{label:"รายละเอียด",key:"description"},
      {label:"ผู้ขาย",key:"vendor"},{label:"จำนวนเงิน",key:"amount"},
    ], erp);
  }

  async function importErp(e){
    const file=e.target.files?.[0]; e.target.value="";
    if(!file) return;
    setBusy(true); setResult(null); setMsg(null);
    try{
      const grid=await readSheet(file);
      if(grid.length<2) throw new Error("ไฟล์ว่าง หรือมีแต่หัวตาราง");
      const ix=mapHeader(grid[0]);
      const need=["project_code","doc_no","amount"].filter(k=>ix[k]<0);
      if(need.length) throw new Error("ไม่พบคอลัมน์: "+need.join(", ")+" — โหลดเทมเพลตไปใช้ก่อน");

      const { data:projs }=await supabase.from("projects").select("id,code").limit(2000);
      const byCode={}; (projs||[]).forEach(p=>{ if(p.code) byCode[String(p.code).trim().toLowerCase()]=p.id; });

      const { data:sess }=await supabase.auth.getSession();
      const uid=sess.session.user.id;

      const recs=[]; const errors=[]; const seen={}; const unmatched=new Set();
      for(let r=1;r<grid.length;r++){
        const row=grid[r]; const g=k=>ix[k]>=0?String(row[ix[k]]??"").trim():"";
        const code=g("project_code"), doc=g("doc_no");
        const amt=toNum(g("amount"));
        if(!code&&!doc&&isNaN(amt)) continue;
        if(!code||!doc){ errors.push("แถว "+(r+1)+": ขาด project_code หรือ doc_no"); continue; }
        if(isNaN(amt)){ errors.push("แถว "+(r+1)+": จำนวนเงินไม่ใช่ตัวเลข ("+g("amount")+")"); continue; }
        const line=ix.line_no>=0 ? (parseInt(g("line_no"),10)||1) : 1;
        const key=doc+"#"+line;
        if(seen[key]){ errors.push("แถว "+(r+1)+": ซ้ำในไฟล์ ("+key+")"); continue; }
        seen[key]=1;
        const pid=byCode[code.toLowerCase()]||null;
        if(!pid) unmatched.add(code);
        recs.push({ project_id:pid, project_code:code, doc_no:doc, line_no:line,
          doc_date: toDate(g("doc_date")), cost_code:g("cost_code")||null,
          description:g("description")||null, vendor:g("vendor")||null,
          amount:amt, source_file:file.name, imported_by:uid });
      }
      if(!recs.length) throw new Error("ไม่มีแถวที่ใช้ได้เลย");

      let ok=0;
      for(let i=0;i<recs.length;i+=300){
        const { error }=await supabase.from("hub_erp_costs")
          .upsert(recs.slice(i,i+300),{onConflict:"doc_no,line_no"});
        if(error) errors.push("บันทึกไม่สำเร็จ: "+error.message);
        else ok+=Math.min(300,recs.length-i);
      }
      setResult({ ok, total:recs.length, errors, unmatched:[...unmatched],
        sum:recs.reduce((s,x)=>s+x.amount,0) });
      await load();
    }catch(ex){ setResult({ errors:[ex.message] }); }
    setBusy(false);
  }

  async function clearErp(){
    if(!confirm("ลบข้อมูลต้นทุน ERP ทั้งหมด ("+erp.length+" แถว) ?\n\nย้อนกลับไม่ได้ — ใช้เมื่อต้องการ import ใหม่ทั้งชุดเท่านั้น")) return;
    const { error }=await supabase.from("hub_erp_costs").delete().neq("id","00000000-0000-0000-0000-000000000000");
    if(error){ setMsg("ลบไม่สำเร็จ: "+error.message); return; }
    setMsg("ลบข้อมูล ERP ทั้งหมดแล้ว"); setResult(null); await load();
  }

  const tot=rows.reduce((s,r)=>({budget:s.budget+r.budget,actual:s.actual+r.actual,erp:s.erp+r.erp}),{budget:0,actual:0,erp:0});

  return (<Shell title="รายงานต้นทุนรายโครงการ">
    {msg&&<div className="ok">{msg}</div>}

    {canManage&&(<div className="card">
      <h2>📥 นำเข้าต้นทุนจริงจาก ERP (Excel / CSV)</h2>
      <p className="muted" style={{fontSize:12.5,lineHeight:1.8,marginTop:-4}}>
        อัปโหลดไฟล์ที่ export จาก ERP เพื่อเทียบกับค่าใช้จ่ายที่ Hub บันทึกไว้<br/>
        คอลัมน์บังคับ: <span className="mono">project_code, doc_no, amount</span> ·
        ไม่บังคับ: <span className="mono">line_no, doc_date, cost_code, description, vendor</span><br/>
        ระบบใช้ <b>doc_no + line_no</b> เป็นตัวกันซ้ำ → <b>อัปโหลดไฟล์เดิมซ้ำได้ ข้อมูลไม่บาน</b> (ทับของเดิม)
      </p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginTop:12}}>
        <button type="button" className="btn sm sec" onClick={erpTemplate}>⬇ โหลดเทมเพลต</button>
        <label className="btn sm" style={{cursor:"pointer",margin:0}}>
          {busy?"กำลังอ่านไฟล์…":"⬆ อัปโหลดไฟล์ ERP (.xlsx / .csv)"}
          <input type="file" accept=".xlsx,.xls,.csv" onChange={importErp} disabled={busy} style={{display:"none"}}/>
        </label>
        {erp.length>0&&<>
          <button type="button" className="btn sm sec" onClick={exportErp}>⬇ Export ERP ({erp.length})</button>
          <button type="button" className="btn sm sec" style={{color:"#B03A2E"}} onClick={clearErp}>ลบข้อมูล ERP ทั้งหมด</button>
        </>}
      </div>
      {result&&(<div style={{marginTop:12,background:"#F8FAFC",border:"1px solid #E4E7EB",borderRadius:8,padding:"10px 12px",fontSize:12.5,lineHeight:1.8}}>
        {result.ok>0&&<div>✅ นำเข้าสำเร็จ <b>{result.ok}</b> / {result.total} แถว · รวมเป็นเงิน <b>{fmtMoney(result.sum)}</b></div>}
        {result.unmatched?.length>0&&<div style={{color:"#B26A00"}}>
          ⚠️ รหัสโครงการที่ยังไม่มีในระบบ {result.unmatched.length} รหัส (บันทึกไว้แล้ว แต่จะไม่ผูกกับงบ):
          <span className="mono"> {result.unmatched.slice(0,15).join(", ")}</span>{result.unmatched.length>15?" …":""}
        </div>}
        {result.errors?.length>0&&<div style={{color:"#B03A2E"}}>
          ⚠️ ข้าม/ผิดพลาด {result.errors.length} รายการ:
          <ul style={{margin:"4px 0 0 18px"}}>{result.errors.slice(0,8).map((e,i)=>(<li key={i}>{e}</li>))}</ul>
          {result.errors.length>8&&<div className="muted">…และอีก {result.errors.length-8} รายการ</div>}
        </div>}
      </div>)}
    </div>)}

    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:8}}>
        <h2 style={{margin:0}}>Budget vs Actual</h2>
        <div style={{display:"flex",gap:8}}>
          <button className="btn sm sec" onClick={exportSummary}>⬇ สรุป (CSV)</button>
          <button className="btn sm sec" onClick={exportDetail}>⬇ รายการ Hub ({detail.length})</button>
        </div>
      </div>
      <p className="muted" style={{fontSize:12,marginTop:0}}>
        <b>Hub</b> = ค่าใช้จ่ายที่บันทึกผ่านคำขอในระบบนี้ · <b>ERP</b> = ต้นทุนจริงที่ import เข้ามา ·
        <b> ผลต่าง</b> = ERP − Hub (บวก = ERP มีรายการที่ Hub ยังไม่ได้บันทึก)
      </p>
      <table><thead><tr>
        <th>โครงการ</th><th className="right">งบ</th><th className="right">Hub บันทึก</th>
        <th className="right">ERP จริง</th><th className="right">ผลต่าง</th><th className="right">% ใช้</th><th className="right">รออนุมัติ</th>
      </tr></thead>
      <tbody>{rows.map((r,i)=>{
        const used=Math.max(r.erp,r.actual);
        const pct=r.budget?Math.round(100*used/r.budget):0;
        const diff=r.erp-r.actual;
        return (<tr key={i}>
          <td>{r.code} · <span className={r.name?.startsWith("(")?"muted":""}>{r.name}</span></td>
          <td className="right">{r.budget?fmtMoney(r.budget):"—"}</td>
          <td className="right">{r.actual?fmtMoney(r.actual):"—"}</td>
          <td className="right"><b>{r.erp?fmtMoney(r.erp):"—"}</b></td>
          <td className="right" style={{color:diff>0?"#B26A00":diff<0?"#2E7D5B":"#98A4AE"}}>
            {diff?(diff>0?"+":"")+fmtMoney(diff):"—"}</td>
          <td className="right">{r.budget
            ? <b style={{color:pct>100?"#B03A2E":pct>85?"#B26A00":"#2E7D5B"}}>{pct}%</b>
            : <span className="muted">—</span>}</td>
          <td className="right muted">{r.pending?fmtMoney(r.pending):"—"}</td>
        </tr>); })}
        {!rows.length&&<tr><td colSpan="7" className="muted">ยังไม่มีข้อมูล — อัปโหลดไฟล์ ERP หรือสร้างคำขอที่มีค่าใช้จ่าย</td></tr>}
      </tbody>
      {rows.length>0&&<tfoot><tr style={{fontWeight:700,borderTop:"2px solid #DDE3E8"}}>
        <td>รวมทั้งหมด ({rows.length} โครงการ)</td>
        <td className="right">{fmtMoney(tot.budget)}</td>
        <td className="right">{fmtMoney(tot.actual)}</td>
        <td className="right">{fmtMoney(tot.erp)}</td>
        <td className="right">{fmtMoney(tot.erp-tot.actual)}</td>
        <td className="right">{tot.budget?Math.round(100*Math.max(tot.erp,tot.actual)/tot.budget)+"%":"—"}</td>
        <td></td>
      </tr></tfoot>}
      </table>
    </div>
  </Shell>);
}
