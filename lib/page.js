"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { fmtMoney, downloadCSV, readSheet, toNum, toDate } from "../../components/util";

const ALIAS={
  department:["department","dept","ฝ่าย","แผนก","หน่วยงาน","cost_center","costcenter","ศูนย์ต้นทุน"],
  period:["period","งวด","เดือน","month","yyyy-mm"],
  cost_code:["cost_code","costcode","รหัสต้นทุน","account","account_code","หมวด","หมวดค่าใช้จ่าย"],
  amount:["amount","จำนวนเงิน","งบประมาณ","budget","total","ยอดเงิน","value","debit"],
  note:["note","หมายเหตุ","remark"],
  doc_no:["doc_no","docno","document_no","เลขที่เอกสาร","voucher","voucher_no","ref","doc"],
  line_no:["line_no","lineno","line","บรรทัด","item_no"],
  doc_date:["doc_date","date","วันที่","posting_date","วันที่เอกสาร"],
  description:["description","desc","รายละเอียด","detail","narration"],
  vendor:["vendor","supplier","ผู้ขาย","คู่ค้า"],
};
function mapHeader(head){
  const norm=head.map(h=>String(h||"").trim().toLowerCase().replace(/\s+/g,"_"));
  const idx={};
  for(const k in ALIAS) idx[k]=norm.findIndex(h=>ALIAS[k].includes(h));
  return idx;
}
function toPeriod(v, fallbackDate){
  const s=String(v??"").trim();
  if(/^\d{4}-\d{1,2}$/.test(s)){ const p=s.split("-"); return p[0]+"-"+String(p[1]).padStart(2,"0"); }
  const m1=s.match(/^(\d{1,2})[\/\-.](\d{4})$/);
  if(m1){ let y=Number(m1[2]); if(y>2400) y-=543; return y+"-"+m1[1].padStart(2,"0"); }
  const d=toDate(s);
  if(d) return d.slice(0,7);
  if(fallbackDate) return String(fallbackDate).slice(0,7);
  return null;
}

export default function Budget(){
  const [budgets,setBudgets]=useState([]); const [actuals,setActuals]=useState([]);
  const [canManage,setCanManage]=useState(false);
  const [busy,setBusy]=useState(null); const [result,setResult]=useState(null); const [msg,setMsg]=useState(null);
  const [period,setPeriod]=useState("all");

  async function load(){
    const { data:sess }=await supabase.auth.getSession();
    const { data:t }=await supabase.from("hub_team").select("hub_role").eq("user_id",sess.session.user.id).maybeSingle();
    setCanManage(["owner","supervisor"].includes(t?.hub_role));
    const [b,a]=await Promise.all([
      supabase.from("hub_dept_budgets").select("*").limit(20000),
      supabase.from("hub_dept_actuals").select("*").limit(20000),
    ]);
    setBudgets(b.data||[]); setActuals(a.data||[]);
  }
  useEffect(()=>{ load(); },[]);

  const periods=useMemo(()=>{
    const s=new Set();
    budgets.forEach(x=>x.period&&s.add(x.period));
    actuals.forEach(x=>x.period&&s.add(x.period));
    return [...s].sort().reverse();
  },[budgets,actuals]);

  const rows=useMemo(()=>{
    const inP=x=>period==="all"||x.period===period;
    const map={};
    const key=(d,c)=>String(d).trim().toLowerCase()+"|"+String(c||"").trim().toLowerCase();
    const touch=(d,c)=>{ const k=key(d,c);
      if(!map[k]) map[k]={dept:String(d).trim(),code:String(c||"").trim(),budget:0,actual:0};
      return map[k]; };
    budgets.filter(inP).forEach(x=>{ touch(x.department,x.cost_code).budget+=Number(x.amount)||0; });
    actuals.filter(inP).forEach(x=>{ touch(x.department,x.cost_code).actual+=Number(x.amount)||0; });
    return Object.values(map).sort((a,b)=>
      a.dept.localeCompare(b.dept,"th") || a.code.localeCompare(b.code,"th"));
  },[budgets,actuals,period]);

  const byDept=useMemo(()=>{
    const m={};
    rows.forEach(r=>{ if(!m[r.dept]) m[r.dept]={dept:r.dept,budget:0,actual:0,lines:[]};
      m[r.dept].budget+=r.budget; m[r.dept].actual+=r.actual; m[r.dept].lines.push(r); });
    return Object.values(m).sort((a,b)=>b.actual-a.actual);
  },[rows]);
  const tot=byDept.reduce((s,d)=>({budget:s.budget+d.budget,actual:s.actual+d.actual}),{budget:0,actual:0});

  function tplBudget(){
    downloadCSV("dept_budget_template.csv",
      [{key:"department",label:"department"},{key:"period",label:"period"},{key:"cost_code",label:"cost_code"},
       {key:"amount",label:"amount"},{key:"note",label:"note"}],
      [{department:"GA",period:"2026-07",cost_code:"5101",amount:120000,note:"ค่าเดินทาง"},
       {department:"GA",period:"2026-07",cost_code:"5203",amount:50000,note:"เครื่องเขียน"}]);
  }
  function tplActual(){
    downloadCSV("dept_actual_template.csv",
      [{key:"department",label:"department"},{key:"doc_no",label:"doc_no"},{key:"line_no",label:"line_no"},
       {key:"doc_date",label:"doc_date"},{key:"cost_code",label:"cost_code"},{key:"description",label:"description"},
       {key:"vendor",label:"vendor"},{key:"amount",label:"amount"}],
      [{department:"GA",doc_no:"JV6900456",line_no:1,doc_date:"2026-07-05",cost_code:"5101",
        description:"ค่าแท็กซี่",vendor:"-",amount:850}]);
  }
  const day=new Date().toISOString().slice(0,10);
  function exportView(){
    downloadCSV("งบฝ่าย_"+(period==="all"?"ทุกงวด":period)+"_"+day+".csv",[
      {label:"ฝ่าย",key:"dept"},{label:"Cost Code",get:r=>r.code||"(รวมทั้งฝ่าย)"},
      {label:"งบประมาณ",key:"budget"},{label:"ใช้จริง",key:"actual"},
      {label:"คงเหลือ",get:r=>r.budget-r.actual},
      {label:"% ใช้",get:r=>r.budget?Math.round(100*r.actual/r.budget):""},
    ], rows);
  }

  async function importFile(e, kind){
    const file=e.target.files?.[0]; e.target.value="";
    if(!file) return;
    setBusy(kind); setResult(null); setMsg(null);
    try{
      const grid=await readSheet(file);
      if(grid.length<2) throw new Error("ไฟล์ว่าง หรือมีแต่หัวตาราง");
      const ix=mapHeader(grid[0]);
      const need=(kind==="budget"?["department","amount"]:["department","doc_no","amount"]).filter(k=>ix[k]<0);
      if(need.length) throw new Error("ไม่พบคอลัมน์: "+need.join(", ")+" — โหลดเทมเพลตไปใช้ก่อน");

      const { data:sess }=await supabase.auth.getSession(); const uid=sess.session.user.id;
      const recs=[]; const errors=[]; const seen={};
      for(let r=1;r<grid.length;r++){
        const row=grid[r]; const g=k=>ix[k]>=0?String(row[ix[k]]??"").trim():"";
        const dept=g("department"); const amt=toNum(g("amount"));
        if(!dept && isNaN(amt)) continue;
        if(!dept){ errors.push("แถว "+(r+1)+": ไม่ระบุฝ่าย"); continue; }
        if(isNaN(amt)){ errors.push("แถว "+(r+1)+": จำนวนเงินไม่ใช่ตัวเลข ("+g("amount")+")"); continue; }
        const dd=toDate(g("doc_date"));
        const per=toPeriod(g("period"), dd);
        if(!per){ errors.push("แถว "+(r+1)+": ระบุงวดไม่ได้ (ใส่ period เช่น 2026-07 หรือ doc_date)"); continue; }

        if(kind==="budget"){
          const code=g("cost_code")||null;
          const k2=dept.toLowerCase()+"|"+per+"|"+(code||"").toLowerCase();
          if(seen[k2]){ errors.push("แถว "+(r+1)+": ซ้ำในไฟล์ ("+dept+" "+per+" "+(code||"รวม")+")"); continue; }
          seen[k2]=1;
          recs.push({ department:dept, period:per, cost_code:code, amount:amt,
            note:g("note")||null, source_file:file.name, updated_by:uid, updated_at:new Date().toISOString() });
        } else {
          const doc=g("doc_no");
          if(!doc){ errors.push("แถว "+(r+1)+": ไม่มีเลขที่เอกสาร"); continue; }
          const line=ix.line_no>=0 ? (parseInt(g("line_no"),10)||1) : 1;
          const k2=doc+"#"+line;
          if(seen[k2]){ errors.push("แถว "+(r+1)+": ซ้ำในไฟล์ ("+k2+")"); continue; }
          seen[k2]=1;
          recs.push({ department:dept, period:per, doc_no:doc, line_no:line, doc_date:dd,
            cost_code:g("cost_code")||null, description:g("description")||null, vendor:g("vendor")||null,
            amount:amt, source_file:file.name, imported_by:uid });
        }
      }
      if(!recs.length) throw new Error("ไม่มีแถวที่ใช้ได้เลย");

      let ok=0;
      if(kind==="actual"){
        for(let i=0;i<recs.length;i+=300){
          const chunk=recs.slice(i,i+300);
          const { error }=await supabase.from("hub_dept_actuals").upsert(chunk,{onConflict:"doc_no,line_no"});
          if(error) errors.push("บันทึกไม่สำเร็จ: "+error.message); else ok+=chunk.length;
        }
      } else {
        // งบ: ลบของเดิม (ฝ่าย+งวด) ที่อยู่ในไฟล์ แล้วใส่ใหม่ → อัปโหลดซ้ำได้ ไม่บาน
        const scopes={};
        recs.forEach(c=>{ scopes[c.department+"|"+c.period]={dept:c.department,per:c.period}; });
        for(const s of Object.values(scopes)){
          const { error }=await supabase.from("hub_dept_budgets").delete()
            .eq("department",s.dept).eq("period",s.per);
          if(error) errors.push("ล้างงบเดิมไม่สำเร็จ ("+s.dept+" "+s.per+"): "+error.message);
        }
        for(let i=0;i<recs.length;i+=300){
          const chunk=recs.slice(i,i+300);
          const { error }=await supabase.from("hub_dept_budgets").insert(chunk);
          if(error) errors.push("บันทึกไม่สำเร็จ: "+error.message); else ok+=chunk.length;
        }
      }
      setResult({ kind, ok, total:recs.length, errors, sum:recs.reduce((s,x)=>s+x.amount,0) });
      await load();
    }catch(ex){ setResult({ kind, errors:[ex.message] }); }
    setBusy(null);
  }

  async function clearTable(kind){
    const table = kind==="budget" ? "hub_dept_budgets" : "hub_dept_actuals";
    const n = kind==="budget" ? budgets.length : actuals.length;
    if(!confirm("ลบ"+(kind==="budget"?"งบประมาณฝ่าย":"ต้นทุนจริงของฝ่าย")+"ทั้งหมด ("+n+" แถว) ?\n\nย้อนกลับไม่ได้")) return;
    const { error }=await supabase.from(table).delete().neq("id","00000000-0000-0000-0000-000000000000");
    if(error){ setMsg("ลบไม่สำเร็จ: "+error.message); return; }
    setMsg("ลบเรียบร้อย"); setResult(null); await load();
  }

  function Card({kind,title,desc,tpl}){
    const n=(kind==="budget"?budgets:actuals).length;
    return (<div style={{flex:"1 1 320px",border:"1px solid #E4E7EB",borderRadius:10,padding:"12px 14px",background:"#fff"}}>
      <div style={{fontWeight:700,fontSize:13.5,marginBottom:4}}>{title}</div>
      <div className="muted" style={{fontSize:12,lineHeight:1.7,marginBottom:10}}>{desc}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button type="button" className="btn sm sec" onClick={tpl}>⬇ เทมเพลต</button>
        <label className="btn sm" style={{cursor:"pointer",margin:0}}>
          {busy===kind?"กำลังอ่าน…":"⬆ อัปโหลด (.xlsx / .csv)"}
          <input type="file" accept=".xlsx,.xls,.csv" disabled={!!busy}
            onChange={e=>importFile(e,kind)} style={{display:"none"}}/>
        </label>
        {n>0&&<button type="button" className="btn sm sec" style={{color:"#B03A2E"}} onClick={()=>clearTable(kind)}>ล้างข้อมูล ({n})</button>}
      </div>
    </div>);
  }

  return (<Shell title="งบประมาณฝ่าย (Department Budget)">
    {msg&&<div className="ok">{msg}</div>}

    {canManage&&(<div className="card">
      <h2>📥 นำเข้าข้อมูล</h2>
      <p className="muted" style={{fontSize:12.5,marginTop:-4}}>
        <b>งบ</b> มาจาก Excel ที่ทำแยก · <b>ใช้จริง</b> มาจากไฟล์ที่บัญชีลงบันทึก — คนละไฟล์กัน อัปโหลดแยกกันได้
      </p>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12}}>
        <Card kind="budget" title="① งบประมาณฝ่าย" tpl={tplBudget}
          desc={<>คอลัมน์: <span className="mono">department, period, cost_code, amount</span><br/>
            อัปโหลดซ้ำ = <b>ทับงบของฝ่าย+งวดนั้นทั้งชุด</b> · เว้น cost_code = งบรวมทั้งฝ่าย</>}/>
        <Card kind="actual" title="② ใช้จริง (จากบัญชี)" tpl={tplActual}
          desc={<>คอลัมน์: <span className="mono">department, doc_no, amount</span> (+ doc_date, cost_code…)<br/>
            กันซ้ำด้วย <b>doc_no + line_no</b> · ไม่ใส่ period ก็ได้ ระบบดึงงวดจาก doc_date ให้</>}/>
      </div>
      {result&&(<div style={{marginTop:12,background:"#F8FAFC",border:"1px solid #E4E7EB",borderRadius:8,padding:"10px 12px",fontSize:12.5,lineHeight:1.8}}>
        {result.ok>0&&<div>✅ นำเข้า{result.kind==="budget"?"งบ":"ใช้จริง"}สำเร็จ <b>{result.ok}</b> / {result.total} แถว · รวม <b>{fmtMoney(result.sum)}</b></div>}
        {result.errors?.length>0&&<div style={{color:"#B03A2E"}}>
          ⚠️ ข้าม/ผิดพลาด {result.errors.length} รายการ:
          <ul style={{margin:"4px 0 0 18px"}}>{result.errors.slice(0,8).map((e,i)=>(<li key={i}>{e}</li>))}</ul>
          {result.errors.length>8&&<div className="muted">…และอีก {result.errors.length-8} รายการ</div>}
        </div>}
      </div>)}
    </div>)}

    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:8}}>
        <h2 style={{margin:0}}>Budget vs Actual รายฝ่าย</h2>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select value={period} onChange={e=>setPeriod(e.target.value)} style={{minWidth:150}}>
            <option value="all">ทุกงวด</option>
            {periods.map(p=>(<option key={p} value={p}>{p}</option>))}
          </select>
          <button className="btn sm sec" onClick={exportView}>⬇ Export</button>
        </div>
      </div>

      <table><thead><tr>
        <th>ฝ่าย / Cost Code</th><th className="right">งบประมาณ</th><th className="right">ใช้จริง</th>
        <th className="right">คงเหลือ</th><th className="right">% ใช้</th>
      </tr></thead>
      <tbody>{byDept.map(d=>{
        const pct=d.budget?Math.round(100*d.actual/d.budget):0; const rem=d.budget-d.actual;
        return (<Fragment key={d.dept}>
          <tr style={{background:"#F8FAFC",fontWeight:700}}>
            <td>{d.dept}</td>
            <td className="right">{d.budget?fmtMoney(d.budget):"—"}</td>
            <td className="right">{d.actual?fmtMoney(d.actual):"—"}</td>
            <td className="right" style={{color:rem<0?"#B03A2E":"inherit"}}>{d.budget?fmtMoney(rem):"—"}</td>
            <td className="right">{d.budget
              ? <span style={{color:pct>100?"#B03A2E":pct>85?"#B26A00":"#2E7D5B"}}>{pct}%</span>
              : <span className="muted">ไม่มีงบ</span>}</td>
          </tr>
          {d.lines.filter(l=>l.code).map((l,i)=>{
            const p=l.budget?Math.round(100*l.actual/l.budget):0; const rm=l.budget-l.actual;
            return (<tr key={d.dept+"-"+i}>
              <td style={{paddingLeft:26}} className="muted">↳ {l.code}</td>
              <td className="right">{l.budget?fmtMoney(l.budget):"—"}</td>
              <td className="right">{l.actual?fmtMoney(l.actual):"—"}</td>
              <td className="right" style={{color:rm<0?"#B03A2E":"inherit"}}>{l.budget?fmtMoney(rm):"—"}</td>
              <td className="right">{l.budget
                ? <span style={{color:p>100?"#B03A2E":p>85?"#B26A00":"#2E7D5B"}}>{p}%</span>
                : <span className="muted">—</span>}</td>
            </tr>);
          })}
        </Fragment>);
      })}
      {!byDept.length&&<tr><td colSpan="5" className="muted">ยังไม่มีข้อมูล — อัปโหลดงบประมาณฝ่าย และ/หรือ ไฟล์ใช้จริงจากบัญชี</td></tr>}
      </tbody>
      {byDept.length>0&&<tfoot><tr style={{fontWeight:700,borderTop:"2px solid #DDE3E8"}}>
        <td>รวม ({byDept.length} ฝ่าย)</td>
        <td className="right">{fmtMoney(tot.budget)}</td>
        <td className="right">{fmtMoney(tot.actual)}</td>
        <td className="right" style={{color:tot.budget-tot.actual<0?"#B03A2E":"inherit"}}>{fmtMoney(tot.budget-tot.actual)}</td>
        <td className="right">{tot.budget?Math.round(100*tot.actual/tot.budget)+"%":"—"}</td>
      </tr></tfoot>}
      </table>
      <p className="muted" style={{fontSize:11.5,marginTop:10}}>
        แถวไฮไลต์ = รวมทั้งฝ่าย · แถวย่อย ↳ = แยกตาม Cost Code ·
        ฝ่ายที่ขึ้นว่า <b>ไม่มีงบ</b> = มีการใช้จ่ายแต่ยังไม่ได้อัปโหลดงบของงวดนั้น
      </p>
    </div>
  </Shell>);
}
