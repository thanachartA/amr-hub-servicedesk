"use client";
import { useEffect } from "react";

// กัน bug: scroll เมาส์ทับช่อง <input type="number"> ที่ focus อยู่ แล้วค่าจำนวนเปลี่ยนเอง
// ดักที่ระดับ document (capture) — ถ้าช่องตัวเลขกำลัง focus และเมาส์อยู่บนช่องนั้น ให้กันไม่ให้ค่าเลื่อน
// ข้อดี: ไม่หลุด focus, ครอบทุกช่อง number ทั้งเว็บ ไม่ต้องแก้ทีละหน้า
export default function NoWheelNumber() {
  useEffect(() => {
    const onWheel = (e) => {
      const el = document.activeElement;
      if (
        el &&
        el.tagName === "INPUT" &&
        el.type === "number" &&
        el === e.target
      ) {
        e.preventDefault();
      }
    };
    // passive:false จำเป็นเพื่อให้ preventDefault ทำงานกับ wheel
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);
  return null;
}
