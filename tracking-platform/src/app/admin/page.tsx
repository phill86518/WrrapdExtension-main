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
  if (status === "en_route") return "border-l-4 border-l-sky-500 bg-sky-50/40";
  if (status === "delivered") return "border-l-4 border-l-emerald-600 bg-emerald-50/35";
  if (status === "cancelled") return "border-l-4 border-l-zinc-400 bg-zinc-100/80";
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
    <main className="min-h-screen bg-zinc-50/90">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Command Center</h1>
          <p className="mt-1 text-sm text-zinc-500">Scheduled deliveries and fleet oversight</p>
        </div>
        <LogoutButton redirectPath="/admin" />
      </div>

      <section className="mb-8 rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Create scheduled delivery</h2>
        <p className="mt-0.5 text-sm text-zinc-500">Manual entry for ops-created stops</p>
        <AdminCreateDeliveryForm action={createOrderAction} />
        {query.createError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {query.createError}
          </p>
        )}
      </section>

      <section className="mb-10 grid gap-4 md:grid-cols-2">
        <a
          href="/admin/drivers"
          className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
        >
          <h3 className="font-semibold text-zinc-900">Driver onboarding</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            Approve or reject drivers and apply manual availability overrides.
          </p>
        </a>
        <a
          href="/admin/reports"
          className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
        >
          <h3 className="font-semibold text-zinc-900">Delivery reports</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">View daily metrics and export CSV for operations.</p>
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
          <section key={group.title} className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">{group.title}</h2>
            <form
              id={deleteFormId}
              action={deleteSelectedOrdersAction}
              className="mt-4 flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SelectAllOrdersButton formId={deleteFormId} />
                <button
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-800 shadow-sm transition hover:bg-red-50"
                  type="submit"
                >
                  Delete selected
                </button>
              </div>
              <span className="text-xs leading-snug text-zinc-500 sm:ml-auto sm:max-w-[220px] sm:text-right">
                Select orders below, then delete. This cannot be undone.
              </span>
            </form>
            <div className="mt-4 space-y-3">
              {group.items.map((order) => (
                <div key={order.id} className={`rounded-xl border border-zinc-200 p-4 shadow-sm ${orderRowClass(order.status)}`}>
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
                          <p className="text-[11px] text-zinc-500">Internal ID: {order.id}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {order.stopSequence != null && (
                        <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-white">
                          Stop {order.stopSequence}
                        </span>
                      )}
                      <p className="text-xs uppercase tracking-wide">{order.status}</p>
                    </div>
                  </div>
                  <p className="text-sm">{order.recipientName}</p>
                  <p className="text-sm text-zinc-600">
                    {order.addressLine1}, {order.city}, {order.state} {order.postalCode}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">Scheduled: {new Date(order.scheduledFor).toLocaleString()}</p>
                  <a
                    href={`/admin/orders/${order.id}`}
                    className="mt-3 inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 no-underline shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    View details
                  </a>

                  <form action={updateStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select
                      name="status"
                      defaultValue={order.status}
                      className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="assigned">assigned</option>
                      <option value="en_route">en_route</option>
                      <option value="delivered">delivered</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                    <button
                      className="rounded-lg border border-zinc-300 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
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
                        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-left text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                      >
                        Reopen as assigned (clears proof & last GPS — use if completed by mistake)
                      </button>
                    </form>
                  )}

                  <form action={assignDriverAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <select
                      name="driverId"
                      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 sm:flex-none sm:min-w-[10rem]"
                    >
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                      type="submit"
                    >
                      Assign driver
                    </button>
                  </form>
                </div>
              ))}
              {group.items.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">No orders yet.</p>}
            </div>
          </section>
        )})}
      </div>
      </div>
    </main>
  );
}
