"use client";
import { fmtSize, fileIcon, ATT_MAX } from "./util";

// ช่องแนบเอกสารแยกทีละรายการ ตาม doc_slots ของประเภทงาน
// slots : [{key,label,required,multiple,note}]
// picked: { slot_key: [File, ...] }
export default function DocSlots({ slots, picked, onChange, extra=[], onExtra }){
  const list = Array.isArray(slots) ? slots : [];
  const need = list.filter(s=>s.required);
  const done = need.filter(s=>picked?.[s.key]?.length).length;
  const allOk = done === need.length;

  function add(slot, files){
    const arr=[...(files||[])].filter(f=>{
      if(f.size>ATT_MAX){ alert(f.name+" ใหญ่เกิน 10MB"); return false; }
      return true;
    });
    if(!arr.length) return;
    const cur = picked?.[slot.key] || [];
    onChange({ ...picked, [slot.key]: slot.multiple ? [...cur, ...arr] : [arr[0]] });
  }
  function remove(slot, i){
    const cur=[...(picked?.[slot.key]||[])];
    cur.splice(i,1);
    const next={...picked};
    if(cur.length) next[slot.key]=cur; else delete next[slot.key];
    onChange(next);
  }

  if(!list.length){
    // ไม่ได้กำหนดรายการเอกสาร → ใช้ช่องแนบอิสระอย่างเดียว
    return (<FreeBox files={extra} onChange={onExtra}/>);
  }

  return (<div className="field">
    <label style={{display:"flex",alignItems:"center",gap:8}}>
      📎 เอกสารที่ต้องแนบ
      <span style={{fontWeight:700,color:allOk?"#2E7D5B":"#B03A2E"}}>
        ({done}/{need.length})
      </span>
      {need.length>0&&(allOk
        ? <span className="tag" style={{background:"#E4F3EA",color:"#2E7D5B",borderColor:"#B7DEC8"}}>ครบแล้ว</span>
        : <span className="tag" style={{background:"#FDECEE",color:"#B03A2E",borderColor:"#F3C9CE"}}>ยังไม่ครบ — ส่งไม่ได้</span>)}
    </label>

    <div style={{display:"grid",gap:8}}>
      {list.map(s=>{
        const files=picked?.[s.key]||[];
        const ok=files.length>0;
        const isReq=!!s.required;
        return (<div key={s.key} style={{
          border:"1px solid "+(ok?"#B7DEC8":isReq?"#F3C9CE":"#E4E7EB"),
          background:ok?"#F6FBF8":isReq?"#FFFBFB":"#fff",
          borderRadius:10, padding:"10px 12px" }}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:15,width:18}}>{ok?"✅":isReq?"❌":"⬜"}</span>
            <b style={{fontSize:13,flex:1}}>{s.label}
              {isReq
                ? <span style={{color:"#B03A2E"}}> *</span>
                : <span className="muted" style={{fontWeight:400,fontSize:11}}> (ไม่บังคับ)</span>}
              {s.multiple&&<span className="muted" style={{fontWeight:400,fontSize:11}}> · แนบได้หลายไฟล์</span>}
            </b>
            <label className="btn sm sec" style={{cursor:"pointer",margin:0,whiteSpace:"nowrap"}}>
              {ok&&!s.multiple?"เปลี่ยนไฟล์":"เลือกไฟล์"}
              <input type="file" multiple={!!s.multiple} style={{display:"none"}}
                onChange={e=>{ add(s, e.target.files); e.target.value=""; }}/>
            </label>
          </div>
          {s.note&&<div className="muted" style={{fontSize:11,marginLeft:26,marginTop:2}}>{s.note}</div>}
          {files.length>0&&<div style={{marginLeft:26,marginTop:6,display:"grid",gap:4}}>
            {files.map((f,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
              <span>{fileIcon(f.type,f.name)}</span>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
              <span className="muted" style={{fontSize:11}}>{fmtSize(f.size)}</span>
              <button type="button" onClick={()=>remove(s,i)}
                style={{border:"none",background:"none",color:"#B03A2E",cursor:"pointer",fontSize:14,padding:"0 4px"}}
                title="ลบไฟล์นี้">✕</button>
            </div>))}
          </div>}
        </div>);
      })}
    </div>

    <div style={{marginTop:10}}>
      <FreeBox files={extra} onChange={onExtra} label="เอกสารอื่น ๆ เพิ่มเติม (ไม่บังคับ)"/>
    </div>
  </div>);
}

function FreeBox({ files=[], onChange, label="แนบไฟล์ (ถ้ามี)" }){
  return (<div className="field" style={{marginBottom:0}}>
    <label>{label}</label>
    <input type="file" multiple onChange={e=>{
      const arr=[...(e.target.files||[])].filter(f=>{
        if(f.size>ATT_MAX){ alert(f.name+" ใหญ่เกิน 10MB"); return false; }
        return true;
      });
      onChange([...(files||[]), ...arr]); e.target.value="";
    }}/>
    {files.length>0&&<div style={{marginTop:6,display:"grid",gap:4}}>
      {files.map((f,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
        <span>{fileIcon(f.type,f.name)}</span>
        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
        <span className="muted" style={{fontSize:11}}>{fmtSize(f.size)}</span>
        <button type="button" onClick={()=>{ const c=[...files]; c.splice(i,1); onChange(c); }}
          style={{border:"none",background:"none",color:"#B03A2E",cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
      </div>))}
    </div>}
  </div>);
}
