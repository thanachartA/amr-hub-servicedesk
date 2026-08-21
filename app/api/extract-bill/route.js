// API route: ถอดข้อมูลจากรูปบิล/ใบเสร็จ ด้วย Gemini (server-side — เก็บ API key ปลอดภัย)
// ต้องตั้ง env: GEMINI_API_KEY  (option: GEMINI_MODEL, ค่าเริ่มต้น gemini-2.5-flash)
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req){
  try{
    const { image, mime } = await req.json();
    if(!image) return Response.json({ error:"ไม่พบรูปภาพ" }, { status:400 });
    const key = process.env.GEMINI_API_KEY;
    if(!key) return Response.json({ error:"ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Vercel" }, { status:500 });
    const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
    const b64 = String(image).replace(/^data:[^;]+;base64,/, "");

    const prompt =
      "คุณเป็นผู้ช่วยบัญชีไทยที่เชี่ยวชาญการอ่านใบเสร็จ/ใบกำกับภาษี/บิล (ทั้งแบบพิมพ์และเขียนด้วยลายมือ). "+
      "อ่านรูปนี้แล้วสกัดข้อมูลเป็น JSON ตาม schema เท่านั้น. "+
      "กติกา: total = ยอดสุทธิที่ต้องจ่ายรวม VAT แล้ว · subtotal = ก่อน VAT · ตัวเลขเป็นตัวเลขล้วนไม่มีคอมมา/สัญลักษณ์ · "+
      "date เป็นรูปแบบ YYYY-MM-DD และถ้าปีเป็น พ.ศ. (มากกว่า 2500) ให้ลบ 543 แปลงเป็น ค.ศ. · "+
      "tax_id = เลขประจำตัวผู้เสียภาษี 13 หลัก · description = สรุปสั้น ๆ ว่าซื้อ/จ่ายอะไร · "+
      "confidence = ความมั่นใจในการอ่านโดยรวม 0 ถึง 1 (ถ้าลายมืออ่านยาก/เบลอให้ค่าต่ำ) · "+
      "ฟิลด์ใดที่อ่านไม่ได้/ไม่มี ให้เป็น null";

    const body = {
      contents: [{ parts: [
        { inline_data: { mime_type: mime || "image/jpeg", data: b64 } },
        { text: prompt },
      ]}],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
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
            description: { type:"STRING",  nullable:true },
            confidence:  { type:"NUMBER",  nullable:true },
          },
        },
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
