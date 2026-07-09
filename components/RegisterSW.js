"use client";
import { useEffect } from "react";
export default function RegisterSW(){
  useEffect(()=>{
    if(typeof navigator!=="undefined" && "serviceWorker" in navigator){
      navigator.serviceWorker.register("/sw.js").catch(()=>{});
    }
  },[]);
  return null;
}
