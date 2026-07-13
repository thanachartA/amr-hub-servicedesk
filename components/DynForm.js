"use client";
// ฟอร์มไดนามิก: สร้างช่องกรอกจาก form_schema (JSON) ของแต่ละประเภทงาน
// รองรับ: text, textarea, number, date, datetime, select, checkbox + เงื่อนไขแสดงผล (show_if)

export function isVisible(field, data){
  const c = field.show_if;
  if(!c || !c.field) return true;
  const v = data[c.field];
  if(typeof c.equals === "boolean") return !!v === c.equals;
  return String(v ?? "") === String(c.equals);
}

// คืน array ของ label ที่ยังกรอกไม่ครบ (เฉพาะช่องที่ "แสดงอยู่" และ required)
export function missingFields(schema, data){
  return (schema||[])
    .filter(f => f.required && isVisible(f, data))
    .filter(f => {
      const v = data[f.key];
      if(f.type === "checkbox") return false; // checkbox ไม่บังคับติ๊ก
      if(f.type === "number") return v === "" || v === null || v === undefined || isNaN(Number(v));
      return String(v ?? "").trim() === "";
    })
    .map(f => f.label);
}

export default function DynForm({ schema, data, onChange }){
  const list = (schema||[]).filter(f => isVisible(f, data));
  if(!list.length) return null;
  const set = (k,v) => onChange({ ...data, [k]: v });

  return (
    <div style={{background:"#F8FAFC",border:"1px solid #E4E7EB",borderRadius:10,padding:14,marginBottom:14}}>
      <div style={{fontWeight:700,color:"#202028",marginBottom:10,fontSize:13.5}}>
        ข้อมูลที่ต้องใช้ดำเนินการ <span className="muted" style={{fontWeight:400,fontSize:11.5}}>· ช่องที่มี * ต้องกรอก</span>
      </div>
      {list.map(f=>{
        const v = data[f.key];
        const lab = (<label>{f.label}{f.required&&<span style={{color:"#B03A2E"}}> *</span>}</label>);
        if(f.type==="checkbox"){
          return (<div className="field" key={f.key}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontWeight:400,color:"#20232A"}}>
              <input type="checkbox" checked={!!v} onChange={e=>set(f.key,e.target.checked)} style={{width:"auto",margin:0}}/>
              {f.label}
            </label>
            {f.help&&<div className="muted" style={{fontSize:11,marginTop:3}}>{f.help}</div>}
          </div>);
        }
        return (<div className="field" key={f.key}>
          {lab}
          {f.type==="textarea" && <textarea value={v||""} placeholder={f.placeholder||""} onChange={e=>set(f.key,e.target.value)}/>}
          {f.type==="select" && (
            <select value={v||""} onChange={e=>set(f.key,e.target.value)}>
              <option value="">— เลือก —</option>
              {(f.options||[]).map(o=>(<option key={o} value={o}>{o}</option>))}
            </select>)}
          {f.type==="number" && <input type="number" value={v??""} placeholder={f.placeholder||""} onChange={e=>set(f.key,e.target.value)}/>}
          {f.type==="date" && <input type="date" value={v||""} onChange={e=>set(f.key,e.target.value)}/>}
          {f.type==="datetime" && <input type="datetime-local" value={v||""} onChange={e=>set(f.key,e.target.value)}/>}
          {(!f.type || f.type==="text") && <input type="text" value={v||""} placeholder={f.placeholder||""} onChange={e=>set(f.key,e.target.value)}/>}
          {f.help&&<div className="muted" style={{fontSize:11,marginTop:3}}>{f.help}</div>}
        </div>);
      })}
    </div>
  );
}

// แสดงข้อมูลที่กรอกมา (ฝั่ง Admin ในหน้าคำขอ)
export function DynView({ schema, data }){
  const list=(schema||[]).filter(f=>{
    if(!isVisible(f,data||{})) return false;
    const v=(data||{})[f.key];
    if(f.type==="checkbox") return !!v;
    return String(v??"").trim()!=="";
  });
  if(!list.length) return <div className="muted" style={{fontSize:13}}>ไม่มีข้อมูลเพิ่มเติม</div>;
  return (
    <table><tbody>
      {list.map(f=>(<tr key={f.key}>
        <td style={{width:220,color:"#5A6672",fontSize:12.5,verticalAlign:"top"}}>{f.label}</td>
        <td style={{fontSize:13,whiteSpace:"pre-wrap"}}>
          <b>{f.type==="checkbox" ? "ใช่" : String(data[f.key])}</b>
        </td>
      </tr>))}
    </tbody></table>
  );
}
