"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function Shell({ children, title }) {
  const router = useRouter(); const path = usePathname();
  const [me, setMe] = useState(null); const [isLead,setIsLead]=useState(false); const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const uid = data.session.user.id;
      const { data: p } = await supabase.from("profiles").select("id,full_name,role").eq("id", uid).maybeSingle();
      const { data: t } = await supabase.from("hub_team").select("hub_role").eq("user_id", uid).maybeSingle();
      setMe(p || { full_name: data.session.user.email }); setIsLead(t?.hub_role==="lead"); setReady(true);
    });
  }, []);
  const nav = [["/","Dashboard"],["/requests","คำขอทั้งหมด"],["/requests/new","+ เปิดคำขอ"],["/team","ทีม (Lead)"],["/projects","ต้นทุนโครงการ"]];
  if (isLead) nav.push(["/admin","จัดการผู้ใช้ (Admin)"]);
  if (!ready) return <div style={{padding:40,color:"#5A6672"}}>กำลังโหลด…</div>;
  return (
    <div className="layout">
      <div className="side">
        <div className="brand">Central Admin Hub<small>Service Desk · AMR Asia</small></div>
        <div className="nav">{nav.map(([h,l])=>(<a key={h} href={h} className={path===h?"active":""}>{l}</a>))}</div>
        <div style={{padding:"14px 20px",marginTop:10,borderTop:"1px solid rgba(255,255,255,.12)",fontSize:12,color:"#9db4c9"}}>
          {me?.full_name}{isLead?" · Lead":""}<br/>
          <a href="#" onClick={async(e)=>{e.preventDefault();await supabase.auth.signOut();router.replace("/login");}} style={{color:"#cde0ee"}}>ออกจากระบบ</a>
        </div>
      </div>
      <div className="main"><div className="top"><h1>{title}</h1></div>{children}</div>
    </div>
  );
}
