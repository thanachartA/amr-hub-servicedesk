// API route: ถอดข้อมูลจากรูปบิล/ใบเสร็จ ด้วย Gemini (server-side — เก็บ API key ปลอดภัย)
// ต้องตั้ง env: GEMINI_API_KEY  (option: GEMINI_MODEL, ค่าเริ่มต้น gemini-3.6-flash)
// โหมด:
//   - เดี่ยว (default)          → คืน { data:{vendor,total,...} }  (1 บิล = 1 ผลลัพธ์)
//   - หลายรายการ (multi:true)  → คืน { data:{items:[...], doc_total} } สำหรับ 1 ไฟล์ที่มีใบปะหน้า+บิลจริงหลายใบ
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req){
  try{
    const { image, mime, multi } = await req.json();
    if(!image) return Response.json({ error:"ไม่พบรูปภาพ" }, { status:400 });
    const key = process.env.GEMINI_API_KEY;
    if(!key) return Response.json({ error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel" }, { status:500 });
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const b64 = String(image).replace(/^data:[^;]+;base64,/, "");

    const promptSingle =
      "คุณเป็นผู้ช่วยบัญชีไทยที่เชี่ยวชาญการอ่านใบเสร็จ/ใบกำกับภาษี/บิล/สเตทเมนต์บัตรเครดิต (ทั้งแบบพิมพ์และเขียนด้วยลายมือ). "+
      "อ่านรูปนี้แล้วสกัดข้อมูลเป็น JSON ตาม schema เท่านั้น. "+
      "กติกา: total = ยอดสุทธิที่ต้องจ่ายรวม VAT แล้ว · subtotal = ก่อน VAT · ตัวเลขเป็นตัวเลขล้วนไม่มีคอมมา/สัญลักษณ์ · "+
      "สกุลเงิน: ทุกจำนวนเงิน (total, subtotal, vat) ต้องเป็น 'เงินบาทไทย (THB)' เสมอ. "+
      "ถ้าเอกสารแสดงสกุลเงินต่างประเทศ (USD/EUR/ฯลฯ) คู่กับยอดเงินบาท (เช่นคอลัมน์ 'จำนวนเงิน (บาท)' / 'Amount (Baht)') ให้ใช้ 'ยอดเงินบาท' เป็น total เด็ดขาด ห้ามเอายอดสกุลต่างประเทศมาเป็น total. "+
      "ถ้ามีสกุลต่างประเทศ ให้กรอก fx_currency (เช่น USD) และ fx_amount (ยอดสกุลนั้น เช่น 128.39) ไว้เพื่ออ้างอิง · currency = 'THB' · "+
      "แต่ถ้าเอกสารมี ‘เฉพาะสกุลต่างประเทศ ไม่มียอดเงินบาทเลย’ (เช่น PR/ใบเสนอราคา/Quotation ที่เป็น USD และยังไม่ระบุอัตราแลกเปลี่ยน) ให้ total=null, subtotal=null, currency=สกุลนั้น (เช่น 'USD'), fx_currency=สกุลนั้น, fx_amount=ยอดนั้น — ห้ามเดาหรือแปลงเป็นบาทเอง และห้ามเอายอดต่างประเทศมาใส่ total เด็ดขาด · "+
      "date เป็นรูปแบบ YYYY-MM-DD และถ้าปีเป็น พ.ศ. (มากกว่า 2500) ให้ลบ 543 แปลงเป็น ค.ศ. · "+
      "tax_id = เลขประจำตัวผู้เสียภาษี 13 หลัก · description = สรุปสั้น ๆ ว่าซื้อ/จ่ายอะไร · "+
      "confidence = ความมั่นใจในการอ่านโดยรวม 0 ถึง 1 (ถ้าลายมืออ่านยาก/เบลอให้ค่าต่ำ) · "+
      "ฟิลด์ใดที่อ่านไม่ได้/ไม่มี ให้เป็น null";

    const promptMulti =
      "คุณเป็นผู้ช่วยบัญชีไทยที่เชี่ยวชาญการเคลียร์เงินทดรอง (Clear Advance). "+
      "ไฟล์นี้เป็นเอกสาร 'ชุดเดียวหลายหน้า' ที่มักประกอบด้วย: (1) ใบปะหน้า/ใบสรุปที่เป็นตาราง และ (2) ใบเสร็จ/บิล/ใบกำกับภาษีจริงหลายใบ. "+
      "งานของคุณ: แตกออกมาเป็นรายการ (items) โดยยึด 'บิล/ใบเสร็จจริงแต่ละใบ' เป็นหลัก — 1 ใบ = 1 รายการ. ห้ามยุบรวมทุกใบเป็นรายการเดียวเด็ดขาด. "+
      "แต่ละรายการให้ระบุ: description=สรุปสั้น ๆ ว่าจ่ายค่าอะไร · vendor=ชื่อร้าน/ผู้รับเงิน · date=YYYY-MM-DD (ถ้าเป็น พ.ศ.>2500 ให้ลบ 543) · "+
      "amount=ยอดสุทธิที่จ่ายจริงของบิลใบนั้น (ตัวเลขล้วน ไม่มีคอมมา) · "+
      "cost_code=รหัส cost code / รหัสงบประมาณ ถ้าใบปะหน้า/ตารางสรุประบุไว้ตรงกับรายการนั้น (ถ้าไม่มีให้ null) · confidence=0 ถึง 1. "+
      "สกุลเงิน: amount ทุกบรรทัดต้องเป็นเงินบาทไทย (THB) เสมอ. ถ้าบิลใบใดเป็นสกุลต่างประเทศ (USD/EUR/ฯลฯ) คู่กับยอดเงินบาท ให้ใช้ 'ยอดเงินบาท' เป็น amount เด็ดขาด ห้ามใช้ยอดสกุลต่างประเทศ. "+
      "ถ้ามีตารางใบปะหน้าที่จับคู่ 'รายการ ↔ cost code ↔ จำนวนเงิน' ให้ใช้ตารางนั้นกำหนด cost_code และตรวจทานยอดกับบิลจริงประกอบ. "+
      "doc_total = ยอดรวมทั้งเอกสาร (บาท). ฟิลด์ที่อ่านไม่ได้ให้เป็น null.";

    const schemaSingle = {
      type: "OBJECT",
      properties: {
        vendor:      { type:"STRING",  nullable:true },
        tax_id:      { type:"STRING",  nullable:true },
        doc_no:      { type:"STRING",  nullable:true },
        date:        { type:"STRING",  nullable:true },
        subtotal:    { type:"NUMBER",  nullable:true },
        vat:         { type:"NUMBER",  nullable:true },
        total:       { type:"NUMBER",  nullable:true },
        currency:    { type:"STRING",  nullable:true },
        fx_currency: { type:"STRING",  nullable:true },
        fx_amount:   { type:"NUMBER",  nullable:true },
        description: { type:"STRING",  nullable:true },
        confidence:  { type:"NUMBER",  nullable:true },
      },
    };
    const schemaMulti = {
      type: "OBJECT",
      properties: {
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              description: { type:"STRING", nullable:true },
              vendor:      { type:"STRING", nullable:true },
              date:        { type:"STRING", nullable:true },
              amount:      { type:"NUMBER", nullable:true },
              cost_code:   { type:"STRING", nullable:true },
              confidence:  { type:"NUMBER", nullable:true },
            },
          },
        },
        doc_total:  { type:"NUMBER", nullable:true },
        confidence: { type:"NUMBER", nullable:true },
      },
    };

    const body = {
      contents: [{ parts: [
        { inline_data: { mime_type: mime || "image/jpeg", data: b64 } },
        { text: multi ? promptMulti : promptSingle },
      ]}],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: multi ? schemaMulti : schemaSingle,
      },
    };

    const url = "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent?key="+key;
    const gr = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    if(!gr.ok){ const t = await gr.text(); return Response.json({ error:"Gemini "+gr.status+": "+t.slice(0,300) }, { status:502 }); }
    const gj = await gr.json();
    const txt = (gj?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
    let data; try{ data = JSON.parse(txt); }catch{ data = { raw: txt }; }
    return Response.json({ ok:true, model, data });
  }catch(e){
    return Response.json({ error: String(e?.message || e) }, { status:500 });
  }
}
