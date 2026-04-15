import {
  assignDriver,
  createOrder,
  deleteOrders,
  listDrivers,
  listOrdersByStatus,
  reopenOrderAsAssigned,
  updateOrderStatus,
} from "@/lib/data";
import { getSession } from "@/lib/auth";
import { SameOriginLogoutLink } from "@/components/same-origin-logout-link";
import { LogoutButton } from "@/components/logout-button";
import { AdminCreateDeliveryForm } from "@/components/admin-create-delivery-form";
import { PasswordField } from "@/components/password-field";
import { SelectAllOrdersButton } from "@/components/select-all-orders-button";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

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
  if (status === "en_route") return "bg-blue-50";
  if (status === "delivered") return "bg-emerald-50";
  if (status === "cancelled") return "bg-rose-50";
  return "bg-white";
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
        <form action="/api/admin/login" method="post" className="mt-6 space-y-4 rounded-lg border p-6">
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

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Command Center</h1>
        <LogoutButton redirectPath="/admin" />
      </div>

      <section className="mb-8 rounded-xl border p-4">
        <h2 className="text-xl font-medium">Create Scheduled Delivery</h2>
        <AdminCreateDeliveryForm action={createOrderAction} />
        {query.createError && (
          <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {query.createError}
          </p>
        )}
      </section>

      <section className="mb-8 grid gap-3 rounded-xl border p-4 md:grid-cols-2">
        <a href="/admin/drivers" className="rounded border p-3 hover:bg-slate-50">
          <h3 className="font-semibold">Driver Onboarding</h3>
          <p className="text-sm text-slate-600">Approve/reject drivers and apply manual availability overrides.</p>
        </a>
        <a href="/admin/reports" className="rounded border p-3 hover:bg-slate-50">
          <h3 className="font-semibold">Delivery Reports</h3>
          <p className="text-sm text-slate-600">View daily metrics and export CSV for operations.</p>
        </a>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {[
          { title: "Active Deliveries", items: active },
          { title: "Scheduled Deliveries", items: scheduled },
          { title: "Past Deliveries", items: past },
        ].map((group) => {
          const deleteFormId = `delete-${group.title.toLowerCase().replace(/\s+/g, "-")}`;
          return (
          <section key={group.title} className="rounded-xl border p-4">
            <h2 className="text-xl font-medium">{group.title}</h2>
            <form id={deleteFormId} action={deleteSelectedOrdersAction} className="mt-3 mb-2 flex items-center gap-2">
              <SelectAllOrdersButton formId={deleteFormId} />
              <button
                className="rounded-md border border-slate-700 bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 active:translate-y-px"
                type="submit"
              >
                Delete selected
              </button>
              <span className="text-xs text-slate-500">Check orders below, then click delete selected.</span>
            </form>
            <div className="mt-3 space-y-3">
              {group.items.map((order) => (
                <div key={order.id} className={`rounded-lg border p-3 ${orderRowClass(order.status)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="orderIds"
                        value={order.id}
                        form={deleteFormId}
                        className="h-4 w-4"
                        title={`Select ${order.id} for deletion`}
                      />
                      <div className="leading-tight">
                        <p className="font-medium">
                          {order.externalOrderId?.trim() || order.id}
                        </p>
                        {order.externalOrderId?.trim() && (
                          <p className="text-[11px] text-slate-500">Internal ID: {order.id}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {order.stopSequence != null && (
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">
                          Stop {order.stopSequence}
                        </span>
                      )}
                      <p className="text-xs uppercase tracking-wide">{order.status}</p>
                    </div>
                  </div>
                  <p className="text-sm">{order.recipientName}</p>
                  <p className="text-sm text-slate-600">
                    {order.addressLine1}, {order.city}, {order.state} {order.postalCode}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Scheduled: {new Date(order.scheduledFor).toLocaleString()}</p>
                  <a
                    href={`/admin/orders/${order.id}`}
                    className="mt-2 inline-block rounded-md border border-blue-700 bg-blue-100 px-2.5 py-1 text-sm font-medium text-blue-900 no-underline shadow-sm transition hover:bg-blue-50"
                  >
                    View details
                  </a>

                  <form action={updateStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select
                      name="status"
                      defaultValue={order.status}
                      className="rounded border px-2 py-1 text-sm"
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="assigned">assigned</option>
                      <option value="en_route">en_route</option>
                      <option value="delivered">delivered</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <button
                      className="rounded-md border border-sky-700 bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50 active:translate-y-px"
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
                        className="w-full rounded border border-amber-600 bg-amber-50 px-2 py-2 text-sm font-medium text-amber-950"
                      >
                        Reopen as assigned (clears proof & last GPS — use if completed by mistake)
                      </button>
                    </form>
                  )}

                  <form action={assignDriverAction} className="mt-2 flex gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select name="driverId" className="rounded border px-2 py-1 text-sm">
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-md border border-emerald-700 bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 active:translate-y-px"
                      type="submit"
                    >
                      Assign
                    </button>
                  </form>
                </div>
              ))}
              {group.items.length === 0 && <p className="text-sm text-slate-500">No orders yet.</p>}
            </div>
          </section>
        )})}
      </div>
    </main>
  );
}
