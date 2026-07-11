import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { formatDateKeyNy } from "@/lib/ny-date";
import { normalizeOrderStatus, orderWrapstarId } from "@/lib/types";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const orders = await listAllOrders();
  const map = new Map<
    string,
    { total: number; delivered: number; open: number; wrapstars: Set<string> }
  >();

  for (const o of orders) {
    const date = formatDateKeyNy(o.scheduledFor);
    const st = normalizeOrderStatus(o.status);
    const cur = map.get(date) ?? {
      total: 0,
      delivered: 0,
      open: 0,
      wrapstars: new Set<string>(),
    };
    cur.total += 1;
    if (st === "delivered") cur.delivered += 1;
    if (
      st === "assigned" ||
      st === "accepted" ||
      st === "in_progress" ||
      st === "out_for_delivery"
    ) {
      cur.open += 1;
    }
    const ws = orderWrapstarId(o);
    if (ws) cur.wrapstars.add(ws);
    map.set(date, cur);
  }

  const lines = [
    "date_et,total_orders,delivered,open_assigned_or_in_progress,wrapstars_used",
    ...[...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => `${d},${v.total},${v.delivered},${v.open},${v.wrapstars.size}`),
  ];
  const csv = `${lines.join("\n")}\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="daily-delivery-report.csv"',
    },
  });
}
