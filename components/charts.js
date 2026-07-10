"use client";
// Lightweight dependency-free SVG charts (AMR theme)

export function Donut({ data, size=168, thickness=24, centerLabel="รวม" }){
  const total=data.reduce((s,d)=>s+(d.value||0),0);
  const R=(size-thickness)/2, C=size/2, circ=2*Math.PI*R; let acc=0;
  return (<svg width={size} height={size} viewBox={"0 0 "+size+" "+size}>
    <circle cx={C} cy={C} r={R} fill="none" stroke="#EEF1F4" strokeWidth={thickness}/>
    {total>0 && data.map((d,i)=>{ const len=((d.value||0)/total)*circ; const node=(
      <circle key={i} cx={C} cy={C} r={R} fill="none" stroke={d.color} strokeWidth={thickness}
        strokeDasharray={len+" "+(circ-len)} strokeDashoffset={-acc} transform={"rotate(-90 "+C+" "+C+")"}/>);
      acc+=len; return node; })}
    <text x={C} y={C-2} textAnchor="middle" fontSize={size*0.21} fontWeight="800" fill="#202028">{total}</text>
    <text x={C} y={C+17} textAnchor="middle" fontSize="11" fill="#7A828C">{centerLabel}</text>
  </svg>);
}

export function BarsH({ data, unit="" }){
  const mx=Math.max(1,...data.map(d=>d.value||0));
  return (<div style={{display:"flex",flexDirection:"column",gap:11}}>
    {data.map((d,i)=>(<div key={i}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,marginBottom:4}}>
        <span style={{color:"#3a4048"}}>{d.label}</span><b>{d.value}{unit}</b></div>
      <div style={{height:9,background:"#EEF1F4",borderRadius:6,overflow:"hidden"}}>
        <div style={{height:"100%",width:(100*(d.value||0)/mx)+"%",background:d.color||"#E81828",borderRadius:6,transition:"width .6s ease"}}/>
      </div>
    </div>))}
    {!data.length&&<div className="muted">ยังไม่มีข้อมูล</div>}
  </div>);
}

export function TrendBars({ data, color="#E81828", height=96 }){
  const mx=Math.max(1,...data.map(d=>d.value||0));
  return (<div style={{display:"flex",alignItems:"flex-end",gap:3,height,paddingTop:6}}>
    {data.map((d,i)=>(<div key={i} title={d.label+": "+d.value} style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"flex-end",alignItems:"center",gap:4}}>
      <div style={{width:"72%",minHeight:2,height:(d.value?Math.max(6,(height-18)*d.value/mx):2)+"px",background:d.value?color:"#E7EAEE",borderRadius:"5px 5px 2px 2px",transition:"height .6s ease"}}/>
      <div style={{fontSize:9,color:"#98A4AE"}}>{d.short}</div>
    </div>))}
  </div>);
}

export function Ring({ value, max=100, label, color="#23A55A", size=120, suffix="%" }){
  const R=(size-14)/2, C=size/2, circ=2*Math.PI*R;
  const frac=Math.max(0,Math.min(1,(value||0)/max)); const len=frac*circ;
  return (<div style={{textAlign:"center"}}>
    <svg width={size} height={size} viewBox={"0 0 "+size+" "+size}>
      <circle cx={C} cy={C} r={R} fill="none" stroke="#EEF1F4" strokeWidth={11}/>
      <circle cx={C} cy={C} r={R} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round"
        strokeDasharray={len+" "+(circ-len)} transform={"rotate(-90 "+C+" "+C+")"} style={{transition:"stroke-dasharray .7s ease"}}/>
      <text x={C} y={C+2} textAnchor="middle" fontSize={size*0.23} fontWeight="800" fill="#202028">{Math.round(value)}{suffix}</text>
    </svg>
    <div className="muted" style={{fontSize:12,marginTop:2}}>{label}</div>
  </div>);
}

export function Sparkline({ data, color="#2D6CDF", w=120, h=34 }){
  const mx=Math.max(1,...data), mn=Math.min(0,...data);
  const pts=data.map((v,i)=>{ const x=(i/(Math.max(1,data.length-1)))*w; const y=h-((v-mn)/((mx-mn)||1))*h; return x+","+y; }).join(" ");
  return (<svg width={w} height={h} viewBox={"0 0 "+w+" "+h}><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
}

export const STATUS_COLOR={ new:"#2D6CDF", assigned:"#0E9AA6", in_progress:"#F5A623", waiting:"#E85D2A", review:"#7A5AF8", closed:"#23A55A", cancelled:"#98A4AE" };
export const STATUS_TH={ new:"ใหม่", assigned:"มอบหมายแล้ว", in_progress:"กำลังทำ", waiting:"รอข้อมูล", review:"รอตรวจ", closed:"ปิด", cancelled:"ยกเลิก" };
