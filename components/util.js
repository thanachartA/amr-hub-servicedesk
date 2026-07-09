export function StatusBadge({ s }){
  const th={new:"ใหม่",assigned:"มอบหมายแล้ว",in_progress:"กำลังทำ",waiting:"รอข้อมูล",done:"เสร็จ",closed:"ปิด",cancelled:"ยกเลิก"};
  return <span className={"badge b-"+s}>{th[s]||s}</span>;
}
export function fmtDate(d){ if(!d) return "—"; const x=new Date(d); return x.toLocaleDateString("th-TH",{day:"2-digit",month:"short"})+" "+x.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}); }
export function fmtMoney(n){ return (Number(n)||0).toLocaleString("th-TH",{minimumFractionDigits:0}); }
