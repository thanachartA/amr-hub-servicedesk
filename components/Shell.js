"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { fmtDate } from "./util";

export default function Shell({ children, title }) {
  const router = useRouter(); const path = usePathname();
  const [me, setMe] = useState(null); const [uid,setUid]=useState(null);
  const [isLead,setIsLead]=useState(false); const [isStaff,setIsStaff]=useState(false); const [ready, setReady] = useState(false);
  const [notifs,setNotifs]=useState([]); const [open,setOpen]=useState(false);

  async function loadNotifs(u){
    const { data }=await supabase.from("hub_notifications").select("*").eq("user_id",u).order("created_at",{ascending:false}).limit(20);
    setNotifs(data||[]);
  }
  useEffect(() => {
    let timer;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const u = data.session.user.id; setUid(u);
      const { data: p } = await supabase.from("profiles").select("id,full_name,role").eq("id", u).maybeSingle();
      const { data: t } = await supabase.from("hub_team").select("hub_role").eq("user_id", u).maybeSingle();
      const staff=!!t;
      if(!staff && typeof window!=="undefined" && window.location.pathname==="/"){ router.replace("/requests"); return; }
      setMe(p || { full_name: data.session.user.email }); setIsLead(t?.hub_role==="lead"); setIsStaff(staff); setReady(true);
      loadNotifs(u);
      timer=setInterval(()=>loadNotifs(u),15000);
    });
    return ()=>{ if(timer) clearInterval(timer); };
  }, []);
  const unread=notifs.filter(n=>!n.is_read).length;
  async function openNotif(n){
    if(!n.is_read){ await supabase.from("hub_notifications").update({is_read:true}).eq("id",n.id); setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,is_read:true}:x)); }
    setOpen(false); if(n.link) router.push(n.link);
  }
  async function markAll(){
    if(!uid) return;
    await supabase.from("hub_notifications").update({is_read:true}).eq("user_id",uid).eq("is_read",false);
    setNotifs(ns=>ns.map(x=>({...x,is_read:true})));
  }
  let nav;
  if(isStaff){
    nav = [["/","Dashboard"],["/requests","คำขอทั้งหมด"],["/requests/new","+ เปิดคำขอ"],["/team","ทีม (Lead)"],["/projects","ต้นทุนโครงการ"],["/reports","รายงานปิดเดือน"]];
    if (isLead){ nav.push(["/performance","Performance (Lead)"]); nav.push(["/admin","จัดการผู้ใช้ (Admin)"]); }
  } else {
    nav = [["/requests/new","+ เปิดคำขอใหม่"],["/requests","คำขอของฉัน"]];
  }
  if (!ready) return <div style={{padding:40,color:"#5A6672"}}>กำลังโหลด…</div>;
  return (
    <div className="layout">
      <div className="side">
        <div className="brand">Central Admin Hub<small>Service Desk · AMR Asia</small></div>
        <div className="nav">{nav.map(([h,l])=>(<a key={h} href={h} className={path===h?"active":""}>{l}</a>))}</div>
        <div style={{padding:"14px 20px",marginTop:10,borderTop:"1px solid rgba(255,255,255,.12)",fontSize:12,color:"#9db4c9"}}>
          {me?.full_name}{isLead?" · Lead":(isStaff?" · Hub":"")}<br/>
          <a href="#" onClick={async(e)=>{e.preventDefault();await supabase.auth.signOut();router.replace("/login");}} style={{color:"#cde0ee"}}>ออกจากระบบ</a>
        </div>
      </div>
      <div className="main">
        <div className="top" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h1>{title}</h1>
          <div style={{position:"relative"}}>
            <button onClick={()=>setOpen(o=>!o)} style={{position:"relative",background:"#fff",border:"1px solid #DDE3E8",borderRadius:8,padding:"7px 11px",cursor:"pointer",fontSize:16}} aria-label="แจ้งเตือน">🔔
              {unread>0&&<span style={{position:"absolute",top:-6,right:-6,background:"#B03A2E",color:"#fff",borderRadius:10,fontSize:11,minWidth:18,height:18,lineHeight:"18px",padding:"0 4px",fontWeight:700}}>{unread}</span>}
            </button>
            {open&&<div style={{position:"absolute",right:0,top:44,width:340,background:"#fff",border:"1px solid #DDE3E8",borderRadius:10,boxShadow:"0 8px 28px rgba(0,0,0,.12)",zIndex:50,overflow:"hidden"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderBottom:"1px solid #EEF1F3"}}>
                <b style={{fontSize:13}}>การแจ้งเตือน</b>
                {unread>0&&<a href="#" onClick={e=>{e.preventDefault();markAll();}} style={{fontSize:12,color:"#0E7C86"}}>อ่านทั้งหมด</a>}
              </div>
              <div style={{maxHeight:380,overflowY:"auto"}}>
                {notifs.length===0&&<div style={{padding:"18px 14px",color:"#5A6672",fontSize:13}}>ยังไม่มีการแจ้งเตือน</div>}
                {notifs.map(n=>(<div key={n.id} onClick={()=>openNotif(n)} style={{padding:"10px 14px",borderBottom:"1px solid #F2F4F6",cursor:"pointer",background:n.is_read?"#fff":"#EFF7F8"}}>
                  <div style={{fontSize:13,fontWeight:n.is_read?400:700,color:"#16324F"}}>{n.title}</div>
                  {n.body&&<div style={{fontSize:12,color:"#5A6672",marginTop:2}}>{n.body}</div>}
                  <div style={{fontSize:11,color:"#98A4AE",marginTop:3}}>{fmtDate(n.created_at)}</div>
                </div>))}
              </div>
            </div>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
