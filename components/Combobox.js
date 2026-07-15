"use client";
import { useState, useRef, useEffect, useMemo } from "react";

// ช่องเลือกแบบพิมพ์ค้นหาได้ (สำหรับรายการยาว ๆ เช่นโครงการ 700+ รายการ)
// options: [{value, label, sub}] · value: ค่าที่เลือก · onChange(value)
export default function Combobox({ options, value, onChange, placeholder="พิมพ์เพื่อค้นหา…", required, allowEmpty=true, emptyLabel="— ไม่ระบุ —" }){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const [hi,setHi]=useState(0);
  const boxRef=useRef(null);

  const selected = options.find(o=>o.value===value) || null;

  useEffect(()=>{
    const onDoc=e=>{ if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",onDoc);
    return ()=>document.removeEventListener("mousedown",onDoc);
  },[]);

  const filtered = useMemo(()=>{
    const s=q.trim().toLowerCase();
    const base = allowEmpty ? [{value:"",label:emptyLabel,sub:""}] : [];
    if(!s) return base.concat(options.slice(0,200));
    const hit = options.filter(o=>
      (o.label||"").toLowerCase().includes(s) || (o.sub||"").toLowerCase().includes(s)
    );
    return base.concat(hit.slice(0,200));
  },[q,options,allowEmpty,emptyLabel]);

  function pick(o){ onChange(o.value); setOpen(false); setQ(""); }

  return (<div ref={boxRef} style={{position:"relative"}}>
    <div onClick={()=>{ setOpen(true); setTimeout(()=>boxRef.current?.querySelector("input")?.focus(),0); }}
      style={{width:"100%",padding:"9px 11px",border:"1px solid var(--line, #E6E8EC)",borderRadius:8,
        fontSize:13.5,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
        minHeight:40,color:selected?"var(--ink,#161819)":"#98A4AE"}}>
      <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {selected ? selected.label : (placeholder)}
      </span>
      {selected && <span onClick={e=>{e.stopPropagation();onChange("");}} title="ล้าง"
        style={{color:"#B03A2E",fontSize:14,padding:"0 2px"}}>✕</span>}
      <span style={{color:"#98A4AE",fontSize:11}}>▾</span>
    </div>

    {open&&<div style={{position:"absolute",left:0,right:0,top:"calc(100% + 4px)",background:"#fff",
      border:"1px solid #D6DCE6",borderRadius:10,boxShadow:"0 10px 30px rgba(5,36,96,.16)",zIndex:60,overflow:"hidden"}}>
      <div style={{padding:8,borderBottom:"1px solid #EEF1F3"}}>
        <input autoFocus value={q} onChange={e=>{setQ(e.target.value);setHi(0);}}
          onKeyDown={e=>{
            if(e.key==="ArrowDown"){e.preventDefault();setHi(h=>Math.min(h+1,filtered.length-1));}
            else if(e.key==="ArrowUp"){e.preventDefault();setHi(h=>Math.max(h-1,0));}
            else if(e.key==="Enter"){e.preventDefault();if(filtered[hi])pick(filtered[hi]);}
            else if(e.key==="Escape"){setOpen(false);}
          }}
          placeholder="🔎 พิมพ์รหัส / ชื่อโครงการ"
          style={{width:"100%",padding:"8px 10px",border:"1px solid #E6E8EC",borderRadius:7,fontSize:13,fontFamily:"inherit"}}/>
      </div>
      <div style={{maxHeight:280,overflowY:"auto"}}>
        {filtered.length===0 && <div style={{padding:"12px 14px",color:"#98A4AE",fontSize:13}}>ไม่พบโครงการที่ค้นหา</div>}
        {filtered.map((o,i)=>(<div key={o.value||"_empty"} onMouseEnter={()=>setHi(i)} onClick={()=>pick(o)}
          style={{padding:"8px 12px",cursor:"pointer",fontSize:13,lineHeight:1.5,
            background:i===hi?"#EEF4FF":(o.value===value?"#F6FBF8":"#fff"),
            borderBottom:"1px solid #F4F6F8"}}>
          <div style={{fontWeight:o.value===value?700:400}}>{o.label}</div>
          {o.sub && <div style={{fontSize:11,color:"#98A4AE",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.sub}</div>}
        </div>))}
      </div>
      {options.length>200 && <div style={{padding:"6px 12px",fontSize:11,color:"#98A4AE",borderTop:"1px solid #EEF1F3"}}>
        แสดง 200 รายการแรก — พิมพ์เพื่อค้นหาให้แคบลง</div>}
    </div>}
    {required && <input tabIndex={-1} required value={value||""} onChange={()=>{}}
      style={{position:"absolute",opacity:0,height:0,width:0,pointerEvents:"none"}}/>}
  </div>);
}
