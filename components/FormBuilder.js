"use client";
import { useState } from "react";

const TYPES=[
  ["text","ข้อความสั้น"],["textarea","ข้อความยาว"],["number","ตัวเลข"],
  ["date","วันที่"],["datetime","วัน-เวลา"],["select","ตัวเลือก (dropdown)"],["checkbox","ติ๊กถูก (ใช่/ไม่ใช่)"]
];
const TYPE_TH=Object.fromEntries(TYPES);

// สร้าง key อัตโนมัติจากชื่อช่อง (ใช้เก็บใน DB — ห้ามซ้ำ)
function autoKey(label, list, self){
  let base=(label||"").trim().toLowerCase()
    .replace(/[^a-z0-9฀-๿]+/g,"_").replace(/^_+|_+$/g,"").slice(0,32);
  if(!base) base="field";
  let k=base, n=2;
  while(list.some(f=>f!==self && f.key===k)){ k=base+"_"+n; n++; }
  return k;
}

export default function FormBuilder({ schema, onChange }){
  const list = Array.isArray(schema) ? schema : [];
  const [open,setOpen]=useState(null);

  const upd=(i,patch)=>onChange(list.map((f,j)=>j===i?{...f,...patch}:f));
  const del=i=>{ if(!confirm('ลบช่อง "'+(list[i].label||"")+'" ?')) return; onChange(list.filter((_,j)=>j!==i)); setOpen(null); };
  const move=(i,d)=>{ const j=i+d; if(j<0||j>=list.length) return; const c=[...list]; const t=c[i]; c[i]=c[j]; c[j]=t; onChange(c); setOpen(j); };
  const add=()=>{
    const f={ key:autoKey("ช่องใหม่",list), label:"ช่องใหม่", type:"text", required:false };
    onChange([...list,f]); setOpen(list.length);
  };

  return (<div>
    <div style={{display:"grid",gap:8}}>
      {list.map((f,i)=>{
        const isOpen=open===i;
        const others=list.filter((_,j)=>j!==i);
        const cond=f.show_if||{};
        const parent=list.find(x=>x.key===cond.field);
        return (<div key={i} style={{border:"1px solid "+(isOpen?"#2D6CDF":"#E4E7EB"),borderRadius:10,background:"#fff",overflow:"hidden"}}>
          {/* หัวแถว */}
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:isOpen?"#EEF4FF":"#F8FAFC"}}>
            <span className="mono" style={{fontSize:11,color:"#98A4AE",width:22}}>{i+1}.</span>
            <b style={{fontSize:13,flex:1}}>{f.label||"(ไม่มีชื่อ)"}
              {f.required&&<span style={{color:"#B03A2E"}}> *</span>}
              <span className="muted" style={{fontWeight:400,marginLeft:8,fontSize:11}}>{TYPE_TH[f.type]||f.type}</span>
              {cond.field&&<span className="tag" style={{marginLeft:6,fontSize:10,background:"#EEF4FF",color:"#2D6CDF",borderColor:"#C7D9F7"}}>มีเงื่อนไข</span>}
            </b>
            {/* สลับบังคับกรอกได้ทันที ไม่ต้องกดเข้าไปแก้ */}
            <label style={{display:"inline-flex",alignItems:"center",gap:5,cursor:"pointer",whiteSpace:"nowrap",marginRight:4}}
              title="บังคับกรอก — ถ้าไม่กรอก ผู้ขอจะกดส่งไม่ได้">
              <input type="checkbox" checked={!!f.required} onChange={e=>upd(i,{required:e.target.checked})} style={{width:"auto",margin:0}}/>
              <span style={{fontSize:11.5,fontWeight:f.required?700:400,color:f.required?"#B03A2E":"#98A4AE"}}>
                {f.required?"บังคับ":"ไม่บังคับ"}
              </span>
            </label>
            <button type="button" className="btn sm sec" onClick={()=>move(i,-1)} disabled={i===0} title="เลื่อนขึ้น">↑</button>
            <button type="button" className="btn sm sec" onClick={()=>move(i,1)} disabled={i===list.length-1} title="เลื่อนลง">↓</button>
            <button type="button" className="btn sm sec" onClick={()=>setOpen(isOpen?null:i)}>{isOpen?"ปิด":"แก้ไข"}</button>
            <button type="button" className="btn sm sec" style={{color:"#B03A2E"}} onClick={()=>del(i)}>ลบ</button>
          </div>

          {/* รายละเอียด */}
          {isOpen&&<div style={{padding:"12px 14px",borderTop:"1px solid #E4E7EB"}}>
            <div className="row2">
              <div className="field"><label>ชื่อช่อง (ที่ user เห็น)</label>
                <input value={f.label||""} onChange={e=>{
                  const label=e.target.value;
                  const patch={label};
                  if(!f._keyLocked) patch.key=autoKey(label,list,f);
                  upd(i,patch);
                }}/>
              </div>
              <div className="field"><label>ชนิดข้อมูล</label>
                <select value={f.type||"text"} onChange={e=>upd(i,{type:e.target.value})}>
                  {TYPES.map(([v,l])=>(<option key={v} value={v}>{l}</option>))}
                </select>
              </div>
            </div>

            <div className="field">
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:400,color:"#20232A"}}>
                <input type="checkbox" checked={!!f.required} onChange={e=>upd(i,{required:e.target.checked})} style={{width:"auto",margin:0}}/>
                <b>บังคับกรอก</b> — ถ้าไม่กรอก user จะกดส่งไม่ได้
              </label>
            </div>

            {f.type==="select"&&<div className="field">
              <label>ตัวเลือก (พิมพ์ 1 บรรทัด = 1 ตัวเลือก)</label>
              <textarea value={(f.options||[]).join("\n")}
                onChange={e=>upd(i,{options:e.target.value.split("\n").map(s=>s.trim()).filter(Boolean)})}
                placeholder={"ตัวเลือกที่ 1\nตัวเลือกที่ 2"}/>
            </div>}

            <div className="row2">
              <div className="field"><label>ข้อความตัวอย่างในช่อง (placeholder)</label>
                <input value={f.placeholder||""} onChange={e=>upd(i,{placeholder:e.target.value})} placeholder="เช่น 1กก 1234 กรุงเทพมหานคร"/></div>
              <div className="field"><label>คำอธิบายใต้ช่อง (help)</label>
                <input value={f.help||""} onChange={e=>upd(i,{help:e.target.value})} placeholder="เช่น อ้างอิงรอบจ่ายวันที่ 15 หรือ 30"/></div>
            </div>

            {/* เงื่อนไขการแสดง */}
            <div style={{background:"#F8FAFC",border:"1px solid #E4E7EB",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>เงื่อนไขการแสดงช่องนี้ (ไม่บังคับ)</div>
              <div className="row2">
                <div className="field" style={{marginBottom:0}}><label>แสดงเมื่อช่อง</label>
                  <select value={cond.field||""} onChange={e=>{
                    const k=e.target.value;
                    if(!k) upd(i,{show_if:undefined});
                    else {
                      const p=list.find(x=>x.key===k);
                      upd(i,{show_if:{field:k, equals: p?.type==="checkbox" ? true : (p?.options?.[0]||"")}});
                    }
                  }}>
                    <option value="">— แสดงเสมอ —</option>
                    {others.map(o=>(<option key={o.key} value={o.key}>{o.label}</option>))}
                  </select>
                </div>
                {cond.field&&<div className="field" style={{marginBottom:0}}><label>มีค่าเท่ากับ</label>
                  {parent?.type==="checkbox"
                    ? <select value={String(cond.equals)} onChange={e=>upd(i,{show_if:{...cond,equals:e.target.value==="true"}})}>
                        <option value="true">ถูกติ๊ก (ใช่)</option>
                        <option value="false">ไม่ถูกติ๊ก</option>
                      </select>
                    : (parent?.options?.length
                        ? <select value={cond.equals||""} onChange={e=>upd(i,{show_if:{...cond,equals:e.target.value}})}>
                            {parent.options.map(o=>(<option key={o} value={o}>{o}</option>))}
                          </select>
                        : <input value={cond.equals||""} onChange={e=>upd(i,{show_if:{...cond,equals:e.target.value}})}/>)}
                </div>}
              </div>
              {cond.field&&<div className="muted" style={{fontSize:11,marginTop:6}}>
                ช่องนี้จะโผล่ก็ต่อเมื่อ <b>{parent?.label}</b> = <b>{parent?.type==="checkbox" ? (cond.equals?"ถูกติ๊ก":"ไม่ถูกติ๊ก") : String(cond.equals)}</b>
              </div>}
            </div>

            <div className="muted" style={{fontSize:11,marginTop:8}}>
              รหัสช่อง (key): <span className="mono">{f.key}</span> — ระบบใช้เก็บข้อมูล ไม่ควรแก้หลังมีคำขอใช้งานแล้ว
            </div>
          </div>}
        </div>);
      })}
    </div>

    {!list.length&&<div className="muted" style={{fontSize:13,padding:"10px 0"}}>ยังไม่มีช่องกรอก — กด “＋ เพิ่มช่อง” เพื่อเริ่ม</div>}
    <button type="button" className="btn sm sec" style={{marginTop:10}} onClick={add}>＋ เพิ่มช่อง</button>
  </div>);
}
