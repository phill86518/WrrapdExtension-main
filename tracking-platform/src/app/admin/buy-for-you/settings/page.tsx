import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminSession } from "@/lib/auth";
import { etTime, fetchBuyConfig, fetchWorkflows, usd } from "@/lib/buy-for-you-admin";
import { restoreWorkflowAction, saveConfigAction, saveWorkflowAction } from "../actions";

export const dynamic = "force-dynamic";

const input = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm";
const btn = "rounded-lg bg-[#1a2744] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f172a]";
const card = "rounded-2xl border border-[#1a2744]/25 bg-white p-5 shadow-sm";

export default async function BuySettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  if (!session) redirect("/admin?next=/admin/buy-for-you/settings");
  const sp = searchParams ? await searchParams : {};
  const msg = typeof sp.msg === "string" ? sp.msg : "";
  const err = typeof sp.err === "string" ? sp.err : "";

  let cfgData: Awaited<ReturnType<typeof fetchBuyConfig>> | null = null;
  let wfData: Awaited<ReturnType<typeof fetchWorkflows>> | null = null;
  let loadError = "";
  try {
    [cfgData, wfData] = await Promise.all([fetchBuyConfig(), fetchWorkflows()]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not reach the pay server";
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/buy-for-you" className="text-sm text-blue-800 underline">
          ← We buy it
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-[#0f172a]">We buy it — settings & workflows</h1>
      </div>
      {msg ? <p className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-800">{msg}</p> : null}
      {err ? <p className="rounded-lg bg-rose-50 p-3 font-semibold text-rose-800">{err}</p> : null}
      {loadError ? <p className="font-semibold text-rose-700">{loadError}</p> : null}

      {cfgData ? (
        <form action={saveConfigAction} className={`${card} space-y-4`}>
          <h2 className="text-lg font-bold text-[#0f172a]">Settings</h2>
          <p className="text-sm text-slate-600">
            Off hides wrrapd.com/buy. Test opens it only with ?preview=CODE. Live opens it for everyone. Terms version{" "}
            {cfgData.termsVersion}; returns are fixed at {cfgData.config.returnWindowDays} days.
            {cfgData.config.updatedAt ? ` Last saved ${etTime(cfgData.config.updatedAt)} by ${cfgData.config.updatedBy || "?"}.` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs">
              Mode
              <select name="mode" defaultValue={cfgData.config.mode} className={input}>
                <option value="off">Off</option>
                <option value="test">Test (preview code)</option>
                <option value="live">Live</option>
              </select>
            </label>
            <label className="text-xs">
              Preview code
              <input name="previewCode" defaultValue={cfgData.config.previewCode} className={input} />
            </label>
            <label className="text-xs">
              Links per order
              <input name="maxLinks" type="number" min={1} max={5} defaultValue={cfgData.config.maxLinks} className={input} />
            </label>
            <label className="text-xs">
              Purchase Limit per order (items) $ — now {usd(cfgData.config.merchandiseCapCents)}
              <input name="merchandiseCap" defaultValue={(cfgData.config.merchandiseCapCents / 100).toFixed(2)} className={input} />
            </label>
            <label className="text-xs">
              Limit per item $ — now {usd(cfgData.config.perItemCapCents)}
              <input name="perItemCap" defaultValue={(cfgData.config.perItemCapCents / 100).toFixed(2)} className={input} />
            </label>
            <label className="text-xs">
              Minutes to answer a desk quote
              <input name="quoteWaitMinutes" type="number" min={5} max={240} defaultValue={cfgData.config.quoteWaitMinutes} className={input} />
            </label>
            <label className="text-xs">
              Place pool every (hours, Eastern clock)
              <select name="placeIntervalHours" defaultValue={String(cfgData.config.placeIntervalHours ?? 1)} className={input}>
                <option value="1">Every hour (top of the hour)</option>
                <option value="2">Every 2 hours (even hours)</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="placeOnThreshold" defaultChecked={cfgData.config.placeOnThreshold !== false} /> Place a retailer pool as soon as
            pooled merchandise hits free shipping (do not wait for the hour)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allowElectronics" defaultChecked={cfgData.config.allowElectronics} /> Allow electronics (shopper must accept the
            warranty sentence)
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="text-sm">
              <legend className="text-xs font-bold uppercase tracking-wide text-slate-600">Retailers shoppers can use</legend>
              {cfgData.retailers.map((r) => (
                <label key={r.id} className="mr-4 inline-flex items-center gap-1">
                  <input type="checkbox" name="allowedRetailers" value={r.id} defaultChecked={cfgData!.config.allowedRetailers.includes(r.id)} /> {r.name}
                </label>
              ))}
            </fieldset>
            <fieldset className="text-sm">
              <legend className="text-xs font-bold uppercase tracking-wide text-slate-600">Robot quotes (needs browser + signed-in profile)</legend>
              {cfgData.retailers.map((r) => (
                <label key={r.id} className="mr-4 inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="automatedQuoteRetailers"
                    value={r.id}
                    defaultChecked={cfgData!.config.automatedQuoteRetailers.includes(r.id)}
                  />{" "}
                  {r.name}
                  <span className={r.runner.ready ? "text-emerald-700" : "text-slate-400"}>{r.runner.ready ? "●" : "○"}</span>
                </label>
              ))}
            </fieldset>
          </div>
          <label className="block text-xs">
            Quote alert emails
            <input name="teamAlertEmails" defaultValue={cfgData.config.teamAlertEmails.join(", ")} className={input} />
          </label>
          <button className={btn}>Save settings</button>
        </form>
      ) : null}

      {wfData ? (
        <section className={`${card} space-y-4`}>
          <div>
            <h2 className="text-lg font-bold text-[#0f172a]">Retailer workflows</h2>
            <p className="text-sm text-slate-600">
              Each retailer has a saved set of steps the robot replays to reach the cost page. When a store changes its layout, Grok repairs the
              failing step and saves a new version. Every version is kept here and can be restored.
            </p>
          </div>
          {wfData.workflows.map((w) => (
            <details key={w.retailer} className="rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm">
                <b>{w.name}</b> · v{w.current.version} ({w.current.source}
                {w.current.verified ? ", verified" : ", unverified"}) · {w.current.successCount} ok / {w.current.failCount} failed
                {w.current.lastFailure ? ` · last failure step ${w.current.lastFailure.step ?? "?"}: ${w.current.lastFailure.reason}` : ""}
              </summary>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <form action={saveWorkflowAction} className="space-y-2">
                  <input type="hidden" name="retailer" value={w.retailer} />
                  <textarea
                    name="steps"
                    rows={14}
                    defaultValue={JSON.stringify(w.current.steps || [], null, 2)}
                    className={`${input} font-mono text-xs`}
                  />
                  <p className="text-xs text-slate-500">
                    Actions: {wfData!.actions.join(", ")}. Purposes: {wfData!.purposes.join(", ")}.
                  </p>
                  <input name="note" placeholder="What changed" className={input} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="verified" /> Verified by a person
                  </label>
                  <button className={btn}>Save as new version</button>
                </form>
                <div className="space-y-3 text-xs">
                  <div>
                    <p className="font-bold uppercase tracking-wide text-slate-600">History</p>
                    {w.history.length ? (
                      [...w.history].reverse().map((h) => (
                        <form key={h.version} action={restoreWorkflowAction} className="flex items-center justify-between gap-2 border-t border-slate-100 py-1">
                          <input type="hidden" name="retailer" value={w.retailer} />
                          <input type="hidden" name="version" value={h.version} />
                          <span>
                            v{h.version} · {h.source} · {h.stepCount} steps · {h.successCount}/{h.failCount} · {etTime(h.savedAt)} {h.savedBy}
                            {h.note ? ` · ${h.note}` : ""}
                          </span>
                          <button className="rounded border border-slate-300 px-2 py-0.5">Restore</button>
                        </form>
                      ))
                    ) : (
                      <p className="text-slate-500">No older versions.</p>
                    )}
                  </div>
                  <div>
                    <p className="font-bold uppercase tracking-wide text-slate-600">Recent runs</p>
                    {w.runs.length ? (
                      w.runs.map((r, i) => (
                        <p key={`${r.at}-${i}`} className={r.ok ? "" : "text-rose-700"}>
                          {etTime(r.at)} · v{r.version} · {r.ok ? "ok" : `failed step ${r.step ?? "?"}: ${r.reason || ""}`}
                          {r.healed ? " · healed" : ""}
                          {r.batchId ? (
                            <>
                              {" "}
                              ·{" "}
                              <Link href={`/admin/buy-for-you/${r.batchId}`} className="text-blue-800 underline">
                                {r.batchId}
                              </Link>
                            </>
                          ) : null}
                        </p>
                      ))
                    ) : (
                      <p className="text-slate-500">No robot runs yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}
