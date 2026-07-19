export function WrapstarHelpPanel() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Help</h2>
        <p className="mt-1 text-sm text-slate-600">Quick standards for wrapping shifts.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <p>
          <strong className="text-slate-900">Your role:</strong> gift wrapping only. Stage finished
          gifts for courier pickup — you do not deliver to recipients.
        </p>
        <p>
          <strong className="text-slate-900">Shift order:</strong> (1) Start shift, (2) print all
          custom/AI wrap papers for the day, (3) wrap each job in the assigned sequence only.
        </p>
        <p>
          <strong className="text-slate-900">Per order:</strong> Start video → wrap (unbox, wrap,
          ribbon/bow) → Finished wrapping (print driver QR on the original box) → End video.
        </p>
        <p>
          <strong className="text-slate-900">Support:</strong> email{" "}
          <a className="font-medium text-amber-800 underline" href="mailto:support@wrrapd.com">
            support@wrrapd.com
          </a>
          .
        </p>
      </div>
    </section>
  );
}
