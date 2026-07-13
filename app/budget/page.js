"use client";
import { useEffect, useMemo, useState, Fragment } from "react";
import Shell from "../../components/Shell";
import { supabase } from "../../lib/supabaseClient";
import { fmtMoney, downloadCSV, readSheetAt, toNum, toDate } from "../../components/util";

// รองรับทั้งเทมเพลตของเรา และไฟล์ Raw GL จากบัญชีโดยตรง (dpt_name / ac_code / vchno / vchdate / Dr-Cr)
const ALIAS={
  department:["department","dept","dpt_name","dpt_code","ฝ่าย","แผนก","หน่วยงาน","cost_center","costcenter","ศูนย์ต้นทุน"],
  period:["period","งวด","เดือน","month","yyyy-mm","glperiod"],
  cost_code:["cost_code","costcode","ac_code","account_no","รหัสต้นทุน","account","account_code","หมวด","หมวดค่าใช้จ่าย"],
  amount:["amount","dr-cr","จำนวนเงิน","งบประมาณ","budget","total","ยอดเงิน","value"],
  amtdr:["amtdr","debit","เดบิต"],
  amtcr:["amtcr","credit","เครดิต"],
  note:["note","หมายเหตุ"],
  doc_no:["doc_no","docno","vchno","document_no","เลขที่เอกสาร","voucher","voucher_no","ref","doc"],
  line_no:["line_no","lineno","line","บรรทัด","item_no"],
  doc_date:["doc_date","vchdate","date","วันที่","posting_date","วันที่เอกสาร"],
  description:["description","ac_des","remark","desc","รายละเอียด","detail","narration"],
  vendor:["vendor","vend_cust","supplier","ผู้ขาย","คู่ค้า"],
};
const MONTH_TH=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
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
  // glperiod = เลขเดือนล้วน (1-12) → ต้องอาศัยปีจาก doc_date
  if(/^\d{1,2}$/.test(s) && Number(s)>=1 && Number(s)<=12 && fallbackDate){
    return String(fallbackDate).slice(0,4)+"-"+s.padStart(2,"0");
  }
  const d=toDate(s);
  if(d) return d.slice(0,7);
  if(fallbackDate) return String(fallbackDate).slice(0,7);
  return null;
}
const pctColor=p=>p>100?"#B03A2E":p>85?"#B26A00":"#2E7D5B";

/* ---------- กราฟ Burn Rate (SVG ล้วน ไม่พึ่ง library) ---------- */
function BurnChart({ months }){
  const W=980, H=300, PL=76, PR=20, PT=16, PB=46;
  const iw=W-PL-PR, ih=H-PT-PB;
  const maxBar=Math.max(1,...months.map(m=>Math.max(m.budget,m.actual)));
  const maxCum=Math.max(1,...months.map(m=>Math.max(m.cumB,m.cumA)));
  const bw=iw/months.length;
  const y=(v,max)=>PT+ih-(v/max)*ih;
  const cx=i=>PL+bw*i+bw/2;
  const line=(key)=>months.map((m,i)=>(i?"L":"M")+cx(i)+","+y(m[key],maxCum)).join(" ");
  const ticks=[0,.25,.5,.75,1];
  const short=v=>v>=1e6?(v/1e6).toFixed(1)+"M":v>=1e3?Math.round(v/1e3)+"K":String(Math.round(v));
  return (
    <div style={{overflowX:"auto"}}>
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",minWidth:640,height:"auto"}}>
        {ticks.map((t,i)=>(<g key={i}>
          <line x1={PL} x2={W-PR} y1={PT+ih-t*ih} y2={PT+ih-t*ih} stroke="#EEF1F3"/>
          <text x={PL-8} y={PT+ih-t*ih+4} textAnchor="end" fontSize="10" fill="#98A4AE">{short(maxBar*t)}</text>
        </g>))}
        {months.map((m,i)=>{
          const over=m.budget>0 && m.actual>m.budget;
          return (<g key={i}>
            <rect x={cx(i)-bw*0.32} y={y(m.budget,maxBar)} width={bw*0.28}
              height={Math.max(0,PT+ih-y(m.budget,maxBar))} fill="#D6DCE2" rx="2"/>
            <rect x={cx(i)+bw*0.04} y={y(m.actual,maxBar)} width={bw*0.28}
              height={Math.max(0,PT+ih-y(m.actual,maxBar))} fill={over?"#B03A2E":"#E81828"} rx="2"/>
            <text x={cx(i)} y={H-26} textAnchor="middle" fontSize="10.5" fill="#5A6672">{m.label}</text>
          </g>);
        })}
        <path d={line("cumB")} fill="none" stroke="#98A4AE" strokeWidth="1.8" strokeDasharray="5 4"/>
        <path d={line("cumA")} fill="none" stroke="#202028" strokeWidth="2"/>
        {months.map((m,i)=>(<circle key={i} cx={cx(i)} cy={y(m.cumA,maxCum)} r="2.8" fill="#202028"/>))}
        <g transform={"translate("+PL+","+(H-8)+")"} fontSize="10.5" fill="#5A6672">
          <rect x="0" y="-8" width="10" height="8" fill="#D6DCE2" rx="1"/><text x="14" y="0">งบ/เดือน</text>
          <rect x="72" y="-8" width="10" height="8" fill="#E81828" rx="1"/><text x="86" y="0">ใช้จริง/เดือน</text>
          <line x1="160" y1="-4" x2="180" y2="-4" stroke="#98A4AE" strokeWidth="1.8" strokeDasharray="5 4"/><text x="184" y="0">งบสะสม</text>
          <line x1="248" y1="-4" x2="268" y2="-4" stroke="#202028" strokeWidth="2"/><text x="272" y="0">ใช้จริงสะสม</text>
        </g>
      </svg>
    </div>
  );
}

export default function Budget(){
  const [budgets,setBudgets]=useState([]); const [actuals,setActuals]=useState([]);
  const [canManage,setCanManage]=useState(false);
  const [busy,setBusy]=useState(null); const [result,setResult]=useState(null); const [msg,setMsg]=useState(null);
  const [year,setYear]=useState(""); const [dept,setDept]=useState("all");

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

  const years=useMemo(()=>{
    const s=new Set();
    budgets.forEach(x=>x.period&&s.add(x.period.slice(0,4)));
    actuals.forEach(x=>x.period&&s.add(x.period.slice(0,4)));
    return [...s].sort().reverse();
  },[budgets,actuals]);
  useEffect(()=>{ if(!year && years.length) setYear(years[0]); },[years,year]);

  const depts=useMemo(()=>{
    const s=new Set();
    budgets.forEach(x=>x.department&&s.add(x.department.trim()));
    actuals.forEach(x=>x.department&&s.add(x.department.trim()));
    return [...s].sort((a,b)=>a.localeCompare(b,"th"));
  },[budgets,actuals]);

  const inScope=x=>(!year||String(x.period||"").startsWith(year)) &&
                   (dept==="all"||String(x.department||"").trim()===dept);
  const B=useMemo(()=>budgets.filter(inScope),[budgets,year,dept]);
  const A=useMemo(()=>actuals.filter(inScope),[actuals,year,dept]);

  // ---------- รายเดือน + สะสม ----------
  const months=useMemo(()=>{
    const m=[];
    for(let i=1;i<=12;i++){
      const p=year+"-"+String(i).padStart(2,"0");
      m.push({ p, label:MONTH_TH[i-1],
        budget:B.filter(x=>x.period===p).reduce((s,x)=>s+(Number(x.amount)||0),0),
        actual:A.filter(x=>x.period===p).reduce((s,x)=>s+(Number(x.amount)||0),0) });
    }
    let cb=0, ca=0;
    m.forEach(x=>{ cb+=x.budget; ca+=x.actual; x.cumB=cb; x.cumA=ca; });
    return m;
  },[B,A,year]);

  const lastIdx=useMemo(()=>{ let i=-1; months.forEach((m,k)=>{ if(m.actual>0) i=k; }); return i; },[months]);
  const cur=lastIdx>=0?months[lastIdx]:null;
  const prev=lastIdx>0?months[lastIdx-1]:null;
  const mom = (cur&&prev&&prev.actual>0) ? Math.round(100*(cur.actual-prev.actual)/prev.actual) : null;

  const ytdBudget=cur?cur.cumB:months.reduce((s,m)=>s+m.budget,0);
  const ytdActual=cur?cur.cumA:0;
  const yearBudget=months.reduce((s,m)=>s+m.budget,0);
  const monthsWithActual=months.filter(m=>m.actual>0).length;
  const runRate=monthsWithActual?ytdActual/monthsWithActual:0;
  const forecast=runRate*12;
  const pace = ytdBudget ? Math.round(100*ytdActual/ytdBudget) : 0;   // เทียบงบเฉพาะเดือนที่ผ่านมา
  const yearPct = yearBudget ? Math.round(100*forecast/yearBudget) : 0;

  // ---------- ตาราง ฝ่าย × cost code ----------
  const rows=useMemo(()=>{
    const map={};
    const key=(d,c)=>String(d).trim().toLowerCase()+"|"+String(c||"").trim().toLowerCase();
    const touch=(d,c)=>{ const k=key(d,c);
      if(!map[k]) map[k]={dept:String(d).trim(),code:String(c||"").trim(),budget:0,actual:0,curM:0,prevM:0};
      return map[k]; };
    B.forEach(x=>{ touch(x.department,x.cost_code).budget+=Number(x.amount)||0; });
    A.forEach(x=>{ const r=touch(x.department,x.cost_code); const v=Number(x.amount)||0;
      r.actual+=v;
      if(cur && x.period===cur.p) r.curM+=v;
      if(prev && x.period===prev.p) r.prevM+=v;
    });
    return Object.values(map).sort((a,b)=>a.dept.localeCompare(b.dept,"th")||a.code.localeCompare(b.code,"th"));
  },[B,A,cur,prev]);

  const byDept=useMemo(()=>{
    const m={};
    rows.forEach(r=>{ if(!m[r.dept]) m[r.dept]={dept:r.dept,budget:0,actual:0,curM:0,prevM:0,lines:[]};
      const d=m[r.dept]; d.budget+=r.budget; d.actual+=r.actual; d.curM+=r.curM; d.prevM+=r.prevM; d.lines.push(r); });
    return Object.values(m).sort((a,b)=>b.actual-a.actual);
  },[rows]);
  const tot=byDept.reduce((s,d)=>({budget:s.budget+d.budget,actual:s.actual+d.actual}),{budget:0,actual:0});

  // ---------- import ----------
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
    downloadCSV("งบฝ่าย_"+year+"_"+day+".csv",[
      {label:"ฝ่าย",key:"dept"},{label:"Cost Code",get:r=>r.code||"(รวมทั้งฝ่าย)"},
      {label:"งบทั้งปี",key:"budget"},{label:"ใช้จริงสะสม",key:"actual"},
      {label:"คงเหลือ",get:r=>r.budget-r.actual},
      {label:"% ใช้",get:r=>r.budget?Math.round(100*r.actual/r.budget):""},
      {label:"เดือนล่าสุด",key:"curM"},{label:"เดือนก่อน",key:"prevM"},
      {label:"MoM %",get:r=>r.prevM?Math.round(100*(r.curM-r.prevM)/r.prevM):""},
    ], rows);
  }
  function exportMonthly(){
    downloadCSV("burn_rate_"+year+"_"+day+".csv",[
      {label:"งวด",key:"p"},{label:"งบ",key:"budget"},{label:"ใช้จริง",key:"actual"},
      {label:"งบสะสม",key:"cumB"},{label:"ใช้จริงสะสม",key:"cumA"},
      {label:"% สะสม",get:m=>m.cumB?Math.round(100*m.cumA/m.cumB):""},
    ], months);
  }

  async function importFile(e, kind){
    const file=e.target.files?.[0]; e.target.value="";
    if(!file) return;
    setBusy(kind); setResult(null); setMsg(null);
    try{
      // หาแถวหัวตารางเอง — ไฟล์ Raw GL จากบัญชีมีหัวรายงานอยู่ข้างบน 4 แถว
      const must = kind==="budget" ? ["department","amount"] : ["dpt_name","vchno","department","doc_no"];
      const { grid, headerRow }=await readSheetAt(file,{ mustHave:must });
      if(grid.length<2) throw new Error("ไฟล์ว่าง หรือหาหัวตารางไม่เจอ");
      const ix=mapHeader(grid[0]);
      const need=(kind==="budget"?["department","amount"]:["department","doc_no"]).filter(k=>ix[k]<0);
      if(need.length) throw new Error("ไม่พบคอลัมน์: "+need.join(", ")+" — โหลดเทมเพลตไปใช้ก่อน");
      const hasAmt = ix.amount>=0 || (ix.amtdr>=0 && ix.amtcr>=0);
      if(!hasAmt) throw new Error("ไม่พบคอลัมน์จำนวนเงิน (amount / Dr-Cr / amtdr+amtcr)");

      const { data:sess }=await supabase.auth.getSession(); const uid=sess.session.user.id;
      const recs=[]; const errors=[]; const seen={}; const lineSeq={}; let zeroSkipped=0;
      for(let r=1;r<grid.length;r++){
        const row=grid[r]; const g=k=>ix[k]>=0?String(row[ix[k]]??"").trim():"";
        const rowNo=r+headerRow+1;
        const d=g("department");
        // จำนวนเงิน: ใช้ amount/Dr-Cr ถ้ามี ไม่งั้นคำนวณ amtdr - amtcr
        let amt=toNum(g("amount"));
        if(isNaN(amt) && ix.amtdr>=0){
          const dr=toNum(g("amtdr")), cr=toNum(g("amtcr"));
          amt=(isNaN(dr)?0:dr)-(isNaN(cr)?0:cr);
        }
        if(!d && (isNaN(amt)||amt===0)) continue;
        if(!d){ errors.push("แถว "+rowNo+": ไม่ระบุฝ่าย"); continue; }
        if(isNaN(amt)){ errors.push("แถว "+rowNo+": จำนวนเงินไม่ใช่ตัวเลข ("+g("amount")+")"); continue; }
        if(kind==="actual" && amt===0){ zeroSkipped++; continue; }
        const dd=toDate(g("doc_date"));
        const per=toPeriod(g("period"), dd);
        if(!per){ errors.push("แถว "+rowNo+": ระบุงวดไม่ได้ (ใส่ period เช่น 2026-07 หรือ doc_date)"); continue; }

        if(kind==="budget"){
          const code=g("cost_code")||null;
          const k2=d.toLowerCase()+"|"+per+"|"+(code||"").toLowerCase();
          if(seen[k2]){ errors.push("แถว "+rowNo+": ซ้ำในไฟล์ ("+d+" "+per+" "+(code||"รวม")+")"); continue; }
          seen[k2]=1;
          recs.push({ department:d, period:per, cost_code:code, amount:amt,
            note:g("note")||null, source_file:file.name, updated_by:uid, updated_at:new Date().toISOString() });
        } else {
          const doc=g("doc_no");
          if(!doc){ errors.push("แถว "+rowNo+": ไม่มีเลขที่เอกสาร"); continue; }
          // ⭐ ไฟล์ Raw GL ไม่มี line_no แต่ 1 เอกสารมีได้หลายร้อยบรรทัด → เดินเลขเองตามลำดับในไฟล์
          let line;
          if(ix.line_no>=0 && g("line_no")) line=parseInt(g("line_no"),10)||1;
          else { lineSeq[doc]=(lineSeq[doc]||0)+1; line=lineSeq[doc]; }
          const k2=doc+"#"+line;
          if(seen[k2]){ errors.push("แถว "+rowNo+": ซ้ำในไฟล์ ("+k2+")"); continue; }
          seen[k2]=1;
          recs.push({ department:d, period:per, doc_no:doc, line_no:line, doc_date:dd,
            cost_code:g("cost_code")||null, description:g("description")||null, vendor:g("vendor")||null,
            amount:amt, source_file:file.name, imported_by:uid });
        }
      }
      if(!recs.length) throw new Error("ไม่มีแถวที่ใช้ได้เลย");
      if(zeroSkipped) errors.push("ข้ามแถวยอด 0 บาท "+zeroSkipped+" แถว");

      let ok=0;
      if(kind==="actual"){
        // ล้างงวดที่มีในไฟล์ก่อน แล้วใส่ใหม่ → อัปโหลดไฟล์ที่อัปเดตแล้วซ้ำได้ ตัวเลขไม่บาน
        const pers=[...new Set(recs.map(x=>x.period))];
        const { error:dErr }=await supabase.from("hub_dept_actuals").delete().in("period",pers);
        if(dErr) errors.push("ล้างข้อมูลงวดเดิมไม่สำเร็จ: "+dErr.message);
        for(let i=0;i<recs.length;i+=300){
          const chunk=recs.slice(i,i+300);
          const { error }=await supabase.from("hub_dept_actuals").insert(chunk);
          if(error) errors.push("บันทึกไม่สำเร็จ: "+error.message); else ok+=chunk.length;
        }
      } else {
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

  const hasData=budgets.length>0||actuals.length>0;

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
          desc={<>✅ อัปโหลดไฟล์ <b>Raw GL</b> จากบัญชีได้ตรง ๆ (<span className="mono">dpt_name, ac_code, vchno, vchdate, Dr-Cr</span>)<br/>
            ระบบหาหัวตารางเอง · เดินเลขบรรทัดให้เอง · อัปโหลดซ้ำ = <b>แทนที่งวดที่อยู่ในไฟล์</b> ไม่บาน</>}/>
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

    {!hasData ? (
      <div className="card"><div className="muted">ยังไม่มีข้อมูล — อัปโหลดงบประมาณฝ่าย และ/หรือ ไฟล์ใช้จริงจากบัญชี</div></div>
    ) : (<>

    {/* ---------- ตัวกรอง ---------- */}
    <div className="card" style={{paddingTop:14,paddingBottom:14}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <b style={{fontSize:13}}>ดูข้อมูล:</b>
        <select value={year} onChange={e=>setYear(e.target.value)} style={{width:110}}>
          {years.map(y=>(<option key={y} value={y}>ปี {y}</option>))}
        </select>
        <select value={dept} onChange={e=>setDept(e.target.value)} style={{minWidth:190}}>
          <option value="all">ทุกฝ่าย ({depts.length})</option>
          {depts.map(d=>(<option key={d} value={d}>{d}</option>))}
        </select>
        <div style={{flex:1}}/>
        <button className="btn sm sec" onClick={exportMonthly}>⬇ Burn rate</button>
        <button className="btn sm sec" onClick={exportView}>⬇ ตารางฝ่าย</button>
      </div>
    </div>

    {/* ---------- KPI ---------- */}
    <div className="kpis" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
      <div className="kpi">
        <div className="n" style={{fontSize:20}}>{fmtMoney(yearBudget)}</div>
        <div className="l">งบทั้งปี {year}</div>
      </div>
      <div className="kpi">
        <div className="n" style={{fontSize:20}}>{fmtMoney(ytdActual)}</div>
        <div className="l">ใช้จริงสะสม (YTD{cur?" ถึง "+cur.label:""})</div>
      </div>
      <div className="kpi" style={{borderTopColor:pctColor(pace)}}>
        <div className="n" style={{fontSize:20,color:pctColor(pace)}}>{pace}%</div>
        <div className="l">ใช้เทียบงบที่ควรใช้ถึงงวดนี้</div>
      </div>
      <div className="kpi">
        <div className="n" style={{fontSize:20,color:(yearBudget-ytdActual)<0?"#B03A2E":"inherit"}}>{fmtMoney(yearBudget-ytdActual)}</div>
        <div className="l">งบคงเหลือทั้งปี</div>
      </div>
      <div className="kpi" style={{borderTopColor:pctColor(yearPct)}}>
        <div className="n" style={{fontSize:20,color:pctColor(yearPct)}}>{monthsWithActual?fmtMoney(forecast):"—"}</div>
        <div className="l">คาดการณ์สิ้นปี {monthsWithActual?"("+yearPct+"% ของงบ)":""}</div>
      </div>
    </div>

    {/* ---------- Burn rate ---------- */}
    <div className="card">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
        <h2 style={{margin:0}}>📈 Burn Rate รายเดือน — {dept==="all"?"ทุกฝ่าย":dept} · ปี {year}</h2>
        {mom!==null&&cur&&(<div style={{fontSize:12.5}}>
          <span className="muted">{cur.label} เทียบ {prev.label}: </span>
          <b style={{color:mom>0?"#B03A2E":"#2E7D5B"}}>{mom>0?"▲ +":"▼ "}{mom}%</b>
          <span className="muted"> ({fmtMoney(prev.actual)} → {fmtMoney(cur.actual)})</span>
        </div>)}
      </div>
      <BurnChart months={months}/>
      {monthsWithActual>0&&(
        <p className="muted" style={{fontSize:12,marginTop:6,lineHeight:1.8}}>
          เฉลี่ยใช้จริง <b>{fmtMoney(runRate)}</b>/เดือน (จาก {monthsWithActual} เดือนที่มีข้อมูล) →
          ถ้าใช้อัตรานี้ต่อไปจนสิ้นปีจะอยู่ที่ <b style={{color:pctColor(yearPct)}}>{fmtMoney(forecast)}</b>
          {yearBudget?<> เทียบงบ {fmtMoney(yearBudget)} = <b style={{color:pctColor(yearPct)}}>{yearPct}%</b>
            {yearPct>100?<span style={{color:"#B03A2E"}}> — เสี่ยงเกินงบ {fmtMoney(forecast-yearBudget)}</span>:null}</>:null}
        </p>
      )}
    </div>

    {/* ---------- ตารางฝ่าย ---------- */}
    <div className="card">
      <h2>Budget vs Actual รายฝ่าย · ปี {year}</h2>
      <table><thead><tr>
        <th>ฝ่าย / Cost Code</th>
        <th className="right">งบทั้งปี</th><th className="right">ใช้จริงสะสม</th>
        <th className="right">คงเหลือ</th><th className="right">% ใช้</th>
        <th className="right">{cur?cur.label:"เดือนล่าสุด"}</th>
        <th className="right">{prev?prev.label:"เดือนก่อน"}</th>
        <th className="right">MoM</th>
      </tr></thead>
      <tbody>{byDept.map(d=>{
        const pct=d.budget?Math.round(100*d.actual/d.budget):0; const rem=d.budget-d.actual;
        const m=d.prevM?Math.round(100*(d.curM-d.prevM)/d.prevM):null;
        return (<Fragment key={d.dept}>
          <tr style={{background:"#F8FAFC",fontWeight:700}}>
            <td>{d.dept}</td>
            <td className="right">{d.budget?fmtMoney(d.budget):"—"}</td>
            <td className="right">{d.actual?fmtMoney(d.actual):"—"}</td>
            <td className="right" style={{color:rem<0?"#B03A2E":"inherit"}}>{d.budget?fmtMoney(rem):"—"}</td>
            <td className="right">{d.budget?<span style={{color:pctColor(pct)}}>{pct}%</span>:<span className="muted">ไม่มีงบ</span>}</td>
            <td className="right">{d.curM?fmtMoney(d.curM):"—"}</td>
            <td className="right muted">{d.prevM?fmtMoney(d.prevM):"—"}</td>
            <td className="right" style={{color:m===null?"#98A4AE":m>0?"#B03A2E":"#2E7D5B"}}>
              {m===null?"—":(m>0?"▲ +":"▼ ")+m+"%"}</td>
          </tr>
          {d.lines.filter(l=>l.code).map((l,i)=>{
            const p=l.budget?Math.round(100*l.actual/l.budget):0; const rm=l.budget-l.actual;
            const lm=l.prevM?Math.round(100*(l.curM-l.prevM)/l.prevM):null;
            return (<tr key={d.dept+"-"+i}>
              <td style={{paddingLeft:26}} className="muted">↳ {l.code}</td>
              <td className="right">{l.budget?fmtMoney(l.budget):"—"}</td>
              <td className="right">{l.actual?fmtMoney(l.actual):"—"}</td>
              <td className="right" style={{color:rm<0?"#B03A2E":"inherit"}}>{l.budget?fmtMoney(rm):"—"}</td>
              <td className="right">{l.budget?<span style={{color:pctColor(p)}}>{p}%</span>:<span className="muted">—</span>}</td>
              <td className="right">{l.curM?fmtMoney(l.curM):"—"}</td>
              <td className="right muted">{l.prevM?fmtMoney(l.prevM):"—"}</td>
              <td className="right" style={{color:lm===null?"#98A4AE":lm>0?"#B03A2E":"#2E7D5B"}}>
                {lm===null?"—":(lm>0?"▲ +":"▼ ")+lm+"%"}</td>
            </tr>);
          })}
        </Fragment>);
      })}
      {!byDept.length&&<tr><td colSpan="8" className="muted">ไม่มีข้อมูลในปี/ฝ่ายที่เลือก</td></tr>}
      </tbody>
      {byDept.length>0&&<tfoot><tr style={{fontWeight:700,borderTop:"2px solid #DDE3E8"}}>
        <td>รวม ({byDept.length} ฝ่าย)</td>
        <td className="right">{fmtMoney(tot.budget)}</td>
        <td className="right">{fmtMoney(tot.actual)}</td>
        <td className="right" style={{color:tot.budget-tot.actual<0?"#B03A2E":"inherit"}}>{fmtMoney(tot.budget-tot.actual)}</td>
        <td className="right">{tot.budget?Math.round(100*tot.actual/tot.budget)+"%":"—"}</td>
        <td className="right">{cur?fmtMoney(cur.actual):"—"}</td>
        <td className="right">{prev?fmtMoney(prev.actual):"—"}</td>
        <td className="right" style={{color:mom===null?"#98A4AE":mom>0?"#B03A2E":"#2E7D5B"}}>
          {mom===null?"—":(mom>0?"▲ +":"▼ ")+mom+"%"}</td>
      </tr></tfoot>}
      </table>
      <p className="muted" style={{fontSize:11.5,marginTop:10}}>
        แถวไฮไลต์ = รวมทั้งฝ่าย · ↳ = แยกตาม Cost Code · <b>MoM</b> = เดือนล่าสุดเทียบเดือนก่อน (▲ แดง = ใช้เพิ่มขึ้น) ·
        ฝ่ายที่ขึ้นว่า <b>ไม่มีงบ</b> = มีการใช้จ่ายแต่ยังไม่ได้อัปโหลดงบของปีนั้น
      </p>
    </div>
    </>)}
  </Shell>);
}
