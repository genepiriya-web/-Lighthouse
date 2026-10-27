// GET /api/board/pdf?day=YYYY-MM-DD — the day's board as a landscape PDF, laid out like the Excel (any staff).
import { handle } from "../../../../lib/server/http";
import { requireStaff } from "../../../../lib/server/auth";
import { tx } from "../../../../lib/server/db";
import { getBoard } from "../../../../lib/server/board";
import { htmlToPdf } from "../../../../lib/server/pdf";
import { boardPage } from "../../../../lib/boardform";

export const GET = handle(async (req: Request) => {
  const day = new URL(req.url).searchParams.get("day");
  const board = await tx(async c => { await requireStaff(c, req); return getBoard(c, day); });
  const [y, m, d] = board.day.split("-");
  const pdf = await htmlToPdf(boardPage(board, `${d}/${m}/${y}`), `Board ${d}/${m}/${y}`, { landscape: true });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="board-${board.day}.pdf"`, "x-content-type-options": "nosniff" } });
});
