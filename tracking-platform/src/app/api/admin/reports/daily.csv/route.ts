import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { listAllOrders } from "@/lib/data";
import { formatDateKeyNy } from "@/lib/ny-date";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const orders = await listAllOrders();
  const map = new Map<
    string,
    { total: number; delivered: number; open: number; drivers: Set<string> }
  >();

  for (const o of orders) {
    const date = formatDateKeyNy(o.scheduledFor);
    const cur = map.get(date) ?? {
      total: 0,
      delivered: 0,
      open: 0,
      drivers: new Set<string>(),
    };
    cur.total += 1;
    if (o.status === "delivered") cur.delivered += 1;
    if (o.status === "assigned" || o.status === "en_route") cur.open += 1;
    if (o.driverId) cur.drivers.add(o.driverId);
    map.set(date, cur);
  }

  const lines = [
    "date_et,total_orders,delivered,open_assigned_or_en_route,drivers_used",
    ...[...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([d, v]) => `${d},${v.total},${v.delivered},${v.open},${v.drivers.size}`
      ),
  ];
  const csv = `${lines.join("\n")}\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="daily-delivery-report.csv"',
    },
  });
}
