// Thai/English text. Strings shared with the artifact page come from lib/i18n.artifact.json (extracted word for word by
// scripts/extract-i18n.js). Only strings the artifact never had are written here; their Thai is NEW and needs a
// native-speaker check (listed in docs/PLAN.md).
import artifact from "./i18n.artifact.json";

export type Lang = "th" | "en";

const extra: Record<Lang, Record<string, string>> = {
  en: {
    signInAs: "Choose a role to try", signOut: "Sign out", devOnly: "Trial: the data is a copy of the old system. Nothing you do here changes the old system.",
    needsCeo: "Special prices need the CEO before shipping", ceoApprove: "Confirm prices (CEO)", ceoApproved: "Prices confirmed by {n}",
    rPriceApproval: "The CEO must confirm the special prices first.", br_below_catalog: "below catalog {l}", br_no_discount: "item can't be discounted",
    br_over_max_disc: "over the {l}% limit", saveItems: "Save items", unsaved: "Unsaved changes", stale: "Someone saved this job after you opened it. Reload to see their changes.",
    reload: "Reload", legacyRo: "This job belongs to the old system. Change it there until cutover.", back: "Jobs", more: "Load more", qtyShort: "Qty",
    signedOut: "Please sign in.", notStaff: "Your account isn't on the team yet. Ask an admin.", error: "Something went wrong. Try again.",
    a_prices_approved: "confirmed special prices", a_status_fix: "corrected the status to {s}", a_checkout: "checked out items", a_checkin: "checked in items", reason: "Reason", searchCustName: "Search customer name or code",
    a_repair_sent: "sent damaged items to repair", rateCheck: "listed twice — check rate", otPerHr: "OT {r}/hr", searchCrew: "Search name, nickname or position", flaggedNew: "new — check details",
    markChecked: "Mark as checked", flaggedOnly: "New customers to check", recentJobs: "Recent jobs", addPeopleLater: "Invite people by email below. Here you can also change roles or switch someone off.",
    activeLbl: "Active", typeLbl: "Type", tookOver: "Edited in v2 — the old system's copy no longer updates it.", viewOnly: "View only", todayLbl: "Today", cockNoteV2: "Old-system jobs: fix them in the old system; they clear at the next import. v2 jobs: fix them here.",
    idsPrivacyV2: "IDs are stored encrypted and only admins can see them. Every time a full ID is shown or sent, it is recorded.", ids_ambiguous: "More than one crew member matches",
    idsPreview: "Check matches", noIdOnFile: "no ID on file", linkFor: "Who is this for?", linkHours: "Link works for", linkShowFull: "Full ID", linkShowMasked: "Masked ID",
    linkCreate: "Create link", linkOnce: "Copy this link now — it is shown only once.", linkCopy: "Copy", linkCopied: "Copied", linksSent: "Links sent",
    lk_active: "active", lk_expired: "expired", lk_revoked: "revoked", lk_used_up: "used up", revoke: "Revoke", views: "views", hours: "{n} h", a_crew_link_created: "sent a crew-ID link", a_crew_link_opened: "crew-ID link opened", a_crew_link_revoked: "revoked a crew-ID link",
    signIn: "Sign in", signInHelp: "Use the email your admin invited. We'll send you a 6-digit code.", emailLbl: "Email", sendCode: "Send code", codeLbl: "6-digit code", codeSent: "Code sent to {e}. It can take a minute.",
    verifyCode: "Sign in", withGoogle: "Sign in with Google", orLbl: "or", authOff: "Sign-in isn't set up yet (Supabase keys missing).", invites: "Invites", invite: "Invite", inviteHelp: "They join with this role the first time they sign in with this email.",
    joined: "joined", pending: "waiting", nameOpt: "Name (optional)", withdraw: "Withdraw", roleLbl: "Role",
    trialBanner: "TRIAL — the old system is still the real one. Jobs made here are not real jobs.", feedback: "Feedback", feedbackHelp: "What's confusing, missing or wrong on this screen? Please add your name.",
    send: "Send", thanks: "Thank you — sent.", pinTitle: "Trial PIN", pinHelp: "Enter your department's PIN (given in the meeting).", wrong_pin: "Wrong PIN.", too_many_tries: "Too many wrong PINs. Wait 10 minutes.",
    tryTitle: "What to try", privacyNote: "Customer data here is real. Please don't screenshot or share it.", netDisc: "Hide discount (net)", fullPrice: "Full price", fb_bug: "Bug", fb_confusing: "Confusing", fb_idea: "Idea", fb_other: "Other", fbKind: "What is it?", fbAuto: "Your browser, screen size and any recent errors are sent with it.", fbAll: "All", fbSent: "sent to Discord", fbNotSent: "not sent to Discord", too_many_reports: "Too many reports in an hour. Try again later.", fb_new: "new", fb_seen: "seen", fb_done: "done", feedbackT: "Trial feedback", noFeedback: "No feedback yet.",
    try_sale: "Create a job, add equipment and crew, try a price below catalog and see the CEO step, move it to Order and Approve, download the quotation.",
    try_store: "Open Store to see what goes out and comes back, check items out and in on a trial job, mark something damaged and send it to repair.",
    try_accounting: "Open a returned job, change insurance or extra discount, move it to Draft INV, download the Draft INV.",
    try_admin: "Open the Cockpit, confirm special prices on a trial job, look at Team and the feedback list.",
    try_crew: "Open Crew rates and check the positions and rates you know.",
    try_support: "Same as Sales for now: create and edit trial jobs, add crew. Tell us what Support does that the screens don't cover.", dept_support: "Support",
  },
  th: {
    signInAs: "เลือกบทบาทเพื่อทดลองใช้", signOut: "ออกจากระบบ", devOnly: "ทดลองใช้: ข้อมูลเป็นสำเนาจากระบบเดิม สิ่งที่ทำที่นี่ไม่เปลี่ยนอะไรในระบบเดิม",
    needsCeo: "ราคาพิเศษต้องให้ CEO ยืนยันก่อนส่งของ", ceoApprove: "ยืนยันราคา (CEO)", ceoApproved: "ยืนยันราคาแล้วโดย {n}",
    rPriceApproval: "ต้องให้ CEO ยืนยันราคาพิเศษก่อน", br_below_catalog: "ต่ำกว่าราคากลาง {l}", br_no_discount: "สินค้านี้ลดราคาไม่ได้",
    br_over_max_disc: "เกินส่วนลดสูงสุด {l}%", saveItems: "บันทึกรายการ", unsaved: "ยังไม่ได้บันทึก", stale: "มีคนบันทึกงานนี้หลังจากที่คุณเปิด กดโหลดใหม่เพื่อดูการเปลี่ยนแปลง",
    reload: "โหลดใหม่", legacyRo: "งานนี้อยู่ในระบบเดิม แก้ไขในระบบเดิมจนกว่าจะย้ายระบบ", back: "งาน", more: "แสดงเพิ่ม", qtyShort: "จำนวน",
    signedOut: "กรุณาเข้าสู่ระบบ", notStaff: "บัญชีของคุณยังไม่อยู่ในทีม ติดต่อผู้ดูแล", error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
    a_prices_approved: "ยืนยันราคาพิเศษ", a_status_fix: "แก้สถานะเป็น {s}", a_checkout: "เช็กเอาต์", a_checkin: "เช็กอิน", reason: "เหตุผล", searchCustName: "ค้นหาชื่อหรือรหัสลูกค้า",
    a_repair_sent: "ส่งของเสียหายเข้าซ่อม", rateCheck: "มีเรท 2 รายการ — ตรวจสอบ", otPerHr: "OT {r}/ชม.", searchCrew: "ค้นหาชื่อ ชื่อเล่น หรือตำแหน่ง", flaggedNew: "ลูกค้าใหม่ — ตรวจสอบข้อมูล",
    markChecked: "ตรวจสอบแล้ว", flaggedOnly: "ลูกค้าใหม่ที่ต้องตรวจสอบ", recentJobs: "งานล่าสุด", addPeopleLater: "เชิญคนใหม่ด้วยอีเมลด้านล่าง เปลี่ยนบทบาทหรือปิดการใช้งานได้ที่นี่",
    activeLbl: "ใช้งาน", typeLbl: "ประเภท", tookOver: "แก้ไขในระบบใหม่แล้ว ข้อมูลจากระบบเดิมจะไม่ทับอีก", viewOnly: "ดูอย่างเดียว", todayLbl: "วันนี้", cockNoteV2: "งานจากระบบเดิม: แก้ในระบบเดิม แล้วจะหายไปเมื่อนำเข้าครั้งถัดไป งานในระบบใหม่: แก้ที่นี่",
    idsPrivacyV2: "เลขบัตรถูกเก็บแบบเข้ารหัส เห็นได้เฉพาะผู้ดูแล ทุกครั้งที่แสดงหรือส่งเลขเต็มจะถูกบันทึก", ids_ambiguous: "ตรงกับช่างมากกว่า 1 คน",
    idsPreview: "ตรวจสอบรายการ", noIdOnFile: "ยังไม่มีเลขบัตร", linkFor: "ส่งให้ใคร", linkHours: "ลิงก์ใช้ได้", linkShowFull: "เลขเต็ม", linkShowMasked: "เลขแบบซ่อน",
    linkCreate: "สร้างลิงก์", linkOnce: "คัดลอกลิงก์ตอนนี้ — จะแสดงเพียงครั้งเดียว", linkCopy: "คัดลอก", linkCopied: "คัดลอกแล้ว", linksSent: "ลิงก์ที่ส่งแล้ว",
    lk_active: "ใช้งานได้", lk_expired: "หมดอายุ", lk_revoked: "ยกเลิกแล้ว", lk_used_up: "เปิดครบแล้ว", revoke: "ยกเลิกลิงก์", views: "ครั้ง", hours: "{n} ชม.", a_crew_link_created: "ส่งลิงก์รายชื่อช่างพร้อมเลขบัตร", a_crew_link_opened: "มีการเปิดลิงก์รายชื่อช่าง", a_crew_link_revoked: "ยกเลิกลิงก์รายชื่อช่าง",
    signIn: "เข้าสู่ระบบ", signInHelp: "ใช้อีเมลที่ผู้ดูแลเชิญ ระบบจะส่งรหัส 6 หลักให้", emailLbl: "อีเมล", sendCode: "ส่งรหัส", codeLbl: "รหัส 6 หลัก", codeSent: "ส่งรหัสไปที่ {e} แล้ว อาจใช้เวลาสักครู่",
    verifyCode: "เข้าสู่ระบบ", withGoogle: "เข้าสู่ระบบด้วย Google", orLbl: "หรือ", authOff: "ยังไม่ได้ตั้งค่าการเข้าสู่ระบบ (ไม่มีคีย์ Supabase)", invites: "คำเชิญ", invite: "เชิญ", inviteHelp: "จะได้บทบาทนี้เมื่อเข้าสู่ระบบด้วยอีเมลนี้ครั้งแรก",
    joined: "เข้าร่วมแล้ว", pending: "รอเข้าร่วม", nameOpt: "ชื่อ (ไม่บังคับ)", withdraw: "ยกเลิกคำเชิญ", roleLbl: "บทบาท",
    trialBanner: "ทดลองใช้ — ระบบจริงยังเป็นระบบเดิม งานที่สร้างที่นี่ไม่ใช่งานจริง", feedback: "ความเห็น", feedbackHelp: "หน้านี้มีอะไรงง ขาด หรือผิดบ้าง (ใส่ชื่อคุณด้วย)",
    send: "ส่ง", thanks: "ขอบคุณ ส่งแล้ว", pinTitle: "PIN ทดลองใช้", pinHelp: "ใส่ PIN ของฝ่ายคุณ (ได้รับในที่ประชุม)", wrong_pin: "PIN ไม่ถูกต้อง", too_many_tries: "ใส่ PIN ผิดหลายครั้งเกินไป รอ 10 นาที",
    tryTitle: "ลองอะไรได้บ้าง", privacyNote: "ข้อมูลลูกค้าในนี้เป็นข้อมูลจริง ห้ามถ่ายภาพหน้าจอหรือส่งต่อ", netDisc: "ซ่อนส่วนลด (ราคาสุทธิ)", fullPrice: "ราคาเต็ม", fb_bug: "บั๊ก/ใช้ไม่ได้", fb_confusing: "งง", fb_idea: "อยากได้", fb_other: "อื่นๆ", fbKind: "เรื่องอะไร", fbAuto: "ระบบจะแนบข้อมูลเบราว์เซอร์ ขนาดจอ และข้อผิดพลาดล่าสุดไปด้วย", fbAll: "ทั้งหมด", fbSent: "ส่งเข้า Discord แล้ว", fbNotSent: "ยังไม่ได้ส่งเข้า Discord", too_many_reports: "ส่งเยอะเกินไปใน 1 ชั่วโมง ลองใหม่ภายหลัง", fb_new: "ใหม่", fb_seen: "อ่านแล้ว", fb_done: "จัดการแล้ว", feedbackT: "ความเห็นจากการทดลอง", noFeedback: "ยังไม่มีความเห็น",
    try_sale: "สร้างงาน ใส่อุปกรณ์และช่าง ลองตั้งราคาต่ำกว่าราคากลางแล้วดูขั้นตอนให้ CEO ยืนยัน ย้ายเป็น Order และ Approve แล้วดาวน์โหลดใบเสนอราคา",
    try_store: "เปิดหน้าสโตร์ดูของออกและของเข้า ลองเช็กเอาต์และเช็กอินงานทดลอง ระบุของเสียหายแล้วส่งซ่อม",
    try_accounting: "เปิดงานที่คืนของแล้ว ลองแก้ค่าประกันหรือส่วนลดเพิ่ม ย้ายเป็น Draft INV แล้วดาวน์โหลด Draft INV",
    try_admin: "เปิดห้องควบคุม ยืนยันราคาพิเศษของงานทดลอง ดูหน้าทีมและรายการความเห็น",
    try_crew: "เปิดเรทช่าง ตรวจตำแหน่งและเรทที่คุณรู้จัก",
    try_support: "ตอนนี้ใช้สิทธิ์เดียวกับฝ่ายขาย: สร้างและแก้งานทดลอง ใส่ช่าง แล้วบอกเราว่างานของ Support มีอะไรที่หน้าจอยังไม่รองรับ", dept_support: "ซัพพอร์ต",
  },
};

const A = artifact as Record<Lang, Record<string, string>>;

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = extra[lang][key] ?? A[lang][key] ?? extra.en[key] ?? A.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const NEW_STRING_KEYS = Object.keys(extra.en);
