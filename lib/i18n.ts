// Thai/English text. Strings shared with the artifact page come from lib/i18n.artifact.json (extracted word for word by
// scripts/extract-i18n.js). Only strings the artifact never had are written here; their Thai is NEW and needs a
// native-speaker check (listed in docs/PLAN.md).
import artifact from "./i18n.artifact.json";

export type Lang = "th" | "en";

const extra: Record<Lang, Record<string, string>> = {
  en: {
    signInAs: "Sign in as (local test only)", signOut: "Sign out", devOnly: "Test sign-in. Real sign-in comes with Supabase.",
    needsCeo: "Special prices need the CEO before shipping", ceoApprove: "Confirm prices (CEO)", ceoApproved: "Prices confirmed by {n}",
    rPriceApproval: "The CEO must confirm the special prices first.", br_below_catalog: "below catalog {l}", br_no_discount: "item can't be discounted",
    br_over_max_disc: "over the {l}% limit", saveItems: "Save items", unsaved: "Unsaved changes", stale: "Someone saved this job after you opened it. Reload to see their changes.",
    reload: "Reload", legacyRo: "This job belongs to the old system. Change it there until cutover.", back: "Jobs", more: "Load more", qtyShort: "Qty",
    signedOut: "Please sign in.", notStaff: "Your account isn't on the team yet. Ask an admin.", error: "Something went wrong. Try again.",
    a_prices_approved: "confirmed special prices", a_status_fix: "corrected the status to {s}", a_checkout: "checked out items", a_checkin: "checked in items", reason: "Reason", searchCustName: "Search customer name or code",
    a_repair_sent: "sent damaged items to repair", rateCheck: "listed twice — check rate", otPerHr: "OT {r}/hr", searchCrew: "Search name, nickname or position", flaggedNew: "new — check details",
    markChecked: "Mark as checked", flaggedOnly: "New customers to check", recentJobs: "Recent jobs", addPeopleLater: "Adding people comes with real sign-in (Supabase). Here you can change roles or switch someone off.",
    activeLbl: "Active", typeLbl: "Type", tookOver: "Edited in v2 — the old system's copy no longer updates it.", viewOnly: "View only",
  },
  th: {
    signInAs: "เข้าใช้งานเป็น (ทดสอบในเครื่องเท่านั้น)", signOut: "ออกจากระบบ", devOnly: "การเข้าใช้งานสำหรับทดสอบ ระบบล็อกอินจริงจะมากับ Supabase",
    needsCeo: "ราคาพิเศษต้องให้ CEO ยืนยันก่อนส่งของ", ceoApprove: "ยืนยันราคา (CEO)", ceoApproved: "ยืนยันราคาแล้วโดย {n}",
    rPriceApproval: "ต้องให้ CEO ยืนยันราคาพิเศษก่อน", br_below_catalog: "ต่ำกว่าราคากลาง {l}", br_no_discount: "สินค้านี้ลดราคาไม่ได้",
    br_over_max_disc: "เกินส่วนลดสูงสุด {l}%", saveItems: "บันทึกรายการ", unsaved: "ยังไม่ได้บันทึก", stale: "มีคนบันทึกงานนี้หลังจากที่คุณเปิด กดโหลดใหม่เพื่อดูการเปลี่ยนแปลง",
    reload: "โหลดใหม่", legacyRo: "งานนี้อยู่ในระบบเดิม แก้ไขในระบบเดิมจนกว่าจะย้ายระบบ", back: "งาน", more: "แสดงเพิ่ม", qtyShort: "จำนวน",
    signedOut: "กรุณาเข้าสู่ระบบ", notStaff: "บัญชีของคุณยังไม่อยู่ในทีม ติดต่อผู้ดูแล", error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
    a_prices_approved: "ยืนยันราคาพิเศษ", a_status_fix: "แก้สถานะเป็น {s}", a_checkout: "เช็กเอาต์", a_checkin: "เช็กอิน", reason: "เหตุผล", searchCustName: "ค้นหาชื่อหรือรหัสลูกค้า",
    a_repair_sent: "ส่งของเสียหายเข้าซ่อม", rateCheck: "มีเรท 2 รายการ — ตรวจสอบ", otPerHr: "OT {r}/ชม.", searchCrew: "ค้นหาชื่อ ชื่อเล่น หรือตำแหน่ง", flaggedNew: "ลูกค้าใหม่ — ตรวจสอบข้อมูล",
    markChecked: "ตรวจสอบแล้ว", flaggedOnly: "ลูกค้าใหม่ที่ต้องตรวจสอบ", recentJobs: "งานล่าสุด", addPeopleLater: "การเพิ่มคนจะมาพร้อมระบบล็อกอินจริง (Supabase) ตอนนี้เปลี่ยนบทบาทหรือปิดการใช้งานได้",
    activeLbl: "ใช้งาน", typeLbl: "ประเภท", tookOver: "แก้ไขในระบบใหม่แล้ว ข้อมูลจากระบบเดิมจะไม่ทับอีก", viewOnly: "ดูอย่างเดียว",
  },
};

const A = artifact as Record<Lang, Record<string, string>>;

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = extra[lang][key] ?? A[lang][key] ?? extra.en[key] ?? A.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export const NEW_STRING_KEYS = Object.keys(extra.en);
