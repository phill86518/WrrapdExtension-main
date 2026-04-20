import {
  assignDriver,
  createOrder,
  deleteOrders,
  listDrivers,
  listOrdersByStatus,
  reopenOrderAsAssigned,
  updateOrderStatus,
} from "@/lib/data";
import { createSessionToken, getSession, setSessionCookie } from "@/lib/auth";
import { SameOriginLogoutLink } from "@/components/same-origin-logout-link";
import { LogoutButton } from "@/components/logout-button";
import { AdminCreateDeliverySection } from "@/components/admin-create-delivery-section";
import { PasswordField } from "@/components/password-field";
import { SelectAllOrdersButton } from "@/components/select-all-orders-button";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { maxStopSequenceByRouteKey } from "@/lib/route-optimization";
import { formatDateKeyNy } from "@/lib/ny-date";
import { formatInTimeZone } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function adminLoginAction(formData: FormData) {
  "use server";
  const password = String(formData.get("password") || "").trim();
  const expected = (process.env.APP_ADMIN_PASSWORD || "admin123").trim();
  if (password !== expected) {
    redirect("/admin?error=1");
  }
  const token = await createSessionToken({
    role: "admin",
    userId: "admin-1",
    name: "Admin",
  });
  await setSessionCookie(token);
  redirect("/admin");
}

/** Next may pass string | string[]; normalize so we never render invalid React children. */
function pickSearchParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
  return undefined;
}

async function createOrderAction(formData: FormData) {
  "use server";
  const result = await createOrder({
    customerName: String(formData.get("customerName") || ""),
    customerPhone: String(formData.get("customerPhone") || ""),
    recipientName: String(formData.get("recipientName") || ""),
    addressLine1: String(formData.get("addressLine1") || ""),
    city: String(formData.get("city") || ""),
    state: String(formData.get("state") || ""),
    postalCode: String(formData.get("postalCode") || "").trim(),
    scheduledFor: String(formData.get("scheduledFor") || ""),
    skipCustomerNotifications: true,
  });
  if (!result.ok) {
    redirect(`/admin?createError=${encodeURIComponent(result.error)}`);
  }
  revalidatePath("/admin");
}

async function updateStatusAction(formData: FormData) {
  "use server";
  await updateOrderStatus(
    String(formData.get("orderId") || ""),
    String(formData.get("status") || "assigned") as
      | "scheduled"
      | "assigned"
      | "en_route"
      | "delivered"
      | "cancelled",
    "admin",
  );
  revalidatePath("/admin");
}

async function assignDriverAction(formData: FormData) {
  "use server";
  await assignDriver(String(formData.get("orderId") || ""), String(formData.get("driverId") || ""), "admin");
  revalidatePath("/admin");
}

async function reopenAssignedAction(formData: FormData) {
  "use server";
  await reopenOrderAsAssigned(String(formData.get("orderId") || ""), "admin");
  revalidatePath("/admin");
}

async function deleteSelectedOrdersAction(formData: FormData) {
  "use server";
  const ids = formData
    .getAll("orderIds")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (!ids.length) return;
  await deleteOrders(ids, "admin");
  revalidatePath("/admin");
}

function orderRowClass(status: string) {
  if (status === "en_route") return "border-l-4 border-l-sky-600 bg-sky-100/80 ring-1 ring-sky-200/80";
  if (status === "delivered") return "border-l-4 border-l-emerald-600 bg-emerald-100/70 ring-1 ring-emerald-200/80";
  if (status === "cancelled") return "border-l-4 border-l-stone-500 bg-stone-200/60 ring-1 ring-stone-300/80";
  return "bg-white ring-1 ring-[#1a3d2e]/12";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = searchParams ? await searchParams : {};
  const query = {
    error: pickSearchParam(raw.error),
    createError: pickSearchParam(raw.createError),
  };
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-16">
        <h1 className="text-3xl font-semibold">Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to the command center.</p>
        {query.error === "1" && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Incorrect admin password. It must match <code className="rounded bg-red-100 px-1">APP_ADMIN_PASSWORD</code> on Cloud Run
            (you may use the same value as the driver passcode if you set both env vars that way).
          </p>
        )}
        <p className="mt-3 text-sm text-slate-500">
          Sign in with the <strong>admin</strong> password from <code className="rounded bg-slate-100 px-1">APP_ADMIN_PASSWORD</code>{" "}
          (default <code className="rounded bg-slate-100 px-1">admin123</code> if unset). Driver login uses{" "}
          <code className="rounded bg-slate-100 px-1">APP_DRIVER_PASSWORD</code> — the two can be identical.
        </p>
        <form action={adminLoginAction} className="mt-6 space-y-4 rounded-lg border p-6">
          <PasswordField name="password" placeholder="Admin password" autoComplete="current-password" />
          <button className="rounded bg-black px-4 py-2 text-white" type="submit">
            Sign in
          </button>
        </form>
      </main>
    );
  }

  let active: Awaited<ReturnType<typeof listOrdersByStatus>>;
  let scheduled: Awaited<ReturnType<typeof listOrdersByStatus>>;
  let past: Awaited<ReturnType<typeof listOrdersByStatus>>;
  let drivers: Awaited<ReturnType<typeof listDrivers>>;
  try {
    const settled = await Promise.allSettled([
      listOrdersByStatus("active"),
      listOrdersByStatus("scheduled"),
      listOrdersByStatus("past"),
      listDrivers(),
    ]);
    const labels = ["orders:active", "orders:scheduled", "orders:past", "drivers"] as const;
    settled.forEach((r, i) => {
      if (r.status === "rejected") {
        const reason = r.reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        const code =
          reason && typeof reason === "object" && "code" in reason
            ? String((reason as { code?: unknown }).code)
            : "";
        console.error(`[admin] load failed (${labels[i]}):`, msg, code || "", reason);
      }
    });
    const failed = settled.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") {
      throw failed.reason;
    }
    active = (settled[0] as PromiseFulfilledResult<typeof active>).value;
    scheduled = (settled[1] as PromiseFulfilledResult<typeof scheduled>).value;
    past = (settled[2] as PromiseFulfilledResult<typeof past>).value;
    drivers = (settled[3] as PromiseFulfilledResult<typeof drivers>).value;
  } catch (err) {
    console.error("[admin] failed to load Firestore / orders", err);
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Command center unavailable</h1>
        <p className="mt-3 text-slate-700">
          Loading orders or drivers failed (often Firestore rules, network, or bad data). Check{" "}
          <strong>Cloud Run → Logs</strong> for lines starting with{" "}
          <code className="rounded bg-slate-100 px-1 text-sm">[admin] load failed</code> or{" "}
          <code className="rounded bg-slate-100 px-1 text-sm">[firebase-admin]</code>.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Try signing out and back in:{" "}
          <SameOriginLogoutLink redirectPath="/admin" className="text-blue-700 underline">
            Log out
          </SameOriginLogoutLink>
        </p>
      </main>
    );
  }

  const routeStopTotals = maxStopSequenceByRouteKey([...active, ...scheduled]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#9aab9f] via-[#c5cfc9] to-[#a8b8ae]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-2xl border-2 border-[#1a3d2e]/40 bg-[#faf8f4] p-6 shadow-xl shadow-[#0f172a]/20 ring-1 ring-white/40">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <WrrapdLogo className="h-10 w-auto max-w-[180px] object-contain object-left" />
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#0f241c]">Command Center</h1>
              <p className="mt-1 text-sm font-medium text-[#2d4a38]">Scheduled deliveries and fleet oversight</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AdminCreateDeliverySection createOrderAction={createOrderAction} createError={query.createError} />
              <LogoutButton redirectPath="/admin" />
            </div>
          </div>
        </div>

        <section className="mb-10 grid gap-5 md:grid-cols-2">
          <a
            href="/admin/drivers"
            className="group relative overflow-hidden rounded-2xl border-2 border-[#1a3d2e]/35 bg-[#faf8f4] p-6 shadow-lg shadow-[#0f172a]/15 transition hover:border-[#c9a227] hover:shadow-xl"
          >
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#c9a227] via-amber-500 to-[#c9a227]" />
            <h3 className="mt-2 font-bold text-[#0f241c]">Driver onboarding</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#2d4a38]">
              Approve or reject drivers and apply manual availability overrides.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#1a3d2e] group-hover:text-emerald-700">
              Open →
            </p>
          </a>
          <a
            href="/admin/reports"
            className="group relative overflow-hidden rounded-2xl border-2 border-[#1a3d2e]/35 bg-[#faf8f4] p-6 shadow-lg shadow-[#0f172a]/15 transition hover:border-[#c9a227] hover:shadow-xl"
          >
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#c9a227] via-amber-500 to-[#c9a227]" />
            <h3 className="mt-2 font-bold text-[#0f241c]">Delivery reports</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#2d4a38]">
              View daily metrics and export CSV for operations.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#1a3d2e] group-hover:text-emerald-700">
              Open →
            </p>
          </a>
        </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {[
          { title: "Active Deliveries", items: active },
          { title: "Scheduled Deliveries", items: scheduled },
          { title: "Past Deliveries", items: past },
        ].map((group) => {
          const deleteFormId = `delete-${group.title.toLowerCase().replace(/\s+/g, "-")}`;
          return (
          <section
            key={group.title}
            className="overflow-hidden rounded-2xl border-2 border-[#1a3d2e]/40 bg-[#faf8f4] shadow-xl shadow-[#0f172a]/18 ring-1 ring-white/30"
          >
            <div className="bg-gradient-to-r from-[#1a3d2e] via-[#234d3c] to-[#2d5a47] px-4 py-3.5">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{group.title}</h2>
            </div>
            <div className="p-5">
            <form
              id={deleteFormId}
              action={deleteSelectedOrdersAction}
              className="flex flex-col gap-3 border-b-2 border-[#1a3d2e]/15 pb-4 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SelectAllOrdersButton formId={deleteFormId} />
                <button
                  className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-rose-600 to-red-700 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-900/30 ring-1 ring-white/25 transition hover:from-rose-500 hover:to-red-600 active:scale-[0.98]"
                  type="submit"
                >
                  Delete selected
                </button>
              </div>
              <span className="text-xs font-medium leading-snug text-[#2d4a38] sm:ml-auto sm:max-w-[220px] sm:text-right">
                Select orders below, then delete. This cannot be undone.
              </span>
            </form>
            <div className="mt-4 space-y-3">
              {group.items.map((order) => (
                <div
                  key={order.id}
                  className={`rounded-xl border-2 border-[#1a3d2e]/20 p-4 shadow-md ${orderRowClass(order.status)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="orderIds"
                        value={order.id}
                        form={deleteFormId}
                        className="h-4 w-4 rounded border-[#1a3d2e]/40 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                        title={`Select ${order.id} for deletion`}
                      />
                      <div className="leading-tight">
                        <p className="font-semibold text-[#0f241c]">{order.externalOrderId?.trim() || order.id}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {order.stopSequence != null && (
                        <span className="rounded-lg bg-gradient-to-b from-[#1a3d2e] to-[#0f241c] px-2.5 py-1 text-xs font-bold text-white shadow-md">
                          Stop {order.stopSequence}
                          {order.driverId
                            ? (() => {
                                const key = `${order.driverId}|${formatDateKeyNy(order.scheduledFor)}`;
                                const total = routeStopTotals.get(key);
                                const suffix =
                                  total != null && total > 1 ? ` of ${total}` : "";
                                const dayEt = formatInTimeZone(
                                  new Date(order.scheduledFor),
                                  "America/New_York",
                                  "MMM d",
                                );
                                return `${suffix} · ${dayEt}`;
                              })()
                            : ""}
                        </span>
                      )}
                      <p className="text-xs font-bold uppercase tracking-wide text-[#2d5a47]">{order.status}</p>
                    </div>
                  </div>
                  <>
                    <p className="text-sm font-medium text-[#0f241c]">{order.recipientName}</p>
                    <p className="text-sm text-[#2d4a38]">
                      {order.addressLine1}, {order.city}, {order.state} {order.postalCode}
                    </p>
                  </>
                  <p className="mt-1 text-xs font-medium text-[#3d5c47]">
                    Scheduled:{" "}
                    {formatInTimeZone(
                      new Date(order.scheduledFor),
                      "America/New_York",
                      "M/d/yyyy, h:mm:ss a zzz",
                    )}
                  </p>
                  <a
                    href={`/admin/orders/${order.id}`}
                    className="mt-3 inline-flex items-center justify-center rounded-xl border-2 border-[#1a3d2e]/50 bg-white px-4 py-2 text-sm font-bold text-[#0f241c] no-underline shadow-md transition hover:border-[#c9a227] hover:bg-[#fffef8] hover:shadow-lg"
                  >
                    View details
                  </a>

                  <form action={updateStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select
                      name="status"
                      defaultValue={order.status}
                      className="rounded-xl border-2 border-[#1a3d2e]/25 bg-white px-3 py-2 text-sm font-medium text-[#0f241c] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="assigned">assigned</option>
                      <option value="en_route">en_route</option>
                      <option value="delivered">delivered</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <button
                      className="rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-900/35 ring-1 ring-white/30 transition hover:from-emerald-400 hover:to-emerald-600 active:scale-[0.98]"
                      type="submit"
                    >
                      Update status
                    </button>
                  </form>

                  {(order.status === "delivered" || order.status === "cancelled") && (
                    <form action={reopenAssignedAction} className="mt-2">
                      <input type="hidden" name="orderId" value={order.id} />
                      <button
                        type="submit"
                        className="w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-3 py-2.5 text-left text-sm font-bold text-amber-950 shadow-md ring-1 ring-amber-200/80 transition hover:from-amber-300 hover:to-amber-500"
                      >
                        Reopen as assigned (clears proof & last GPS — use if completed by mistake)
                      </button>
                    </form>
                  )}

                  <form action={assignDriverAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select
                      name="driverId"
                      className="min-w-0 flex-1 rounded-xl border-2 border-[#1a3d2e]/25 bg-white px-3 py-2 text-sm font-medium text-[#0f241c] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 sm:flex-none sm:min-w-[10rem]"
                    >
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-xl bg-gradient-to-b from-[#c9a227] to-[#a88417] px-5 py-2 text-sm font-bold text-[#1a1a12] shadow-lg shadow-amber-900/25 ring-1 ring-white/40 transition hover:from-[#d4ad32] hover:to-[#b8921f] active:scale-[0.98]"
                      type="submit"
                    >
                      Assign driver
                    </button>
                  </form>
                </div>
              ))}
              {group.items.length === 0 && (
                <p className="py-8 text-center text-sm font-medium text-[#2d4a38]">No orders yet.</p>
              )}
            </div>
            </div>
          </section>
        )})}
      </div>
      </div>
    </main>
  );
}
