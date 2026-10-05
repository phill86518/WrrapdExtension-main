export function WrapstarHelpPanel() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Help</h2>
        <p className="mt-1 text-sm text-slate-600">How a wrap shift runs.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <p>
          <strong className="text-slate-900">Morning email:</strong> by 8am you get a code for each
          gift, whether it is a custom wrap (and the file to print), and whether it needs a box.
        </p>
        <p>
          <strong className="text-slate-900">Clock:</strong> tap Start shift when you begin and End
          shift when you finish. Pay is $30.00 per dozen finished wraps (prorated for fewer or more
          than a dozen), plus a $15.00 bonus upon every 100 wrapped boxes — clock time does not
          change it.
        </p>
        <p>
          <strong className="text-slate-900">Each gift:</strong> match it to the email, scan the code
          to open it, print custom paper if it asks, then tap Start camera. If it needs a box, pick
          the box up before you cut the paper. Wrap it, show the finished wrap, then tap Item fully
          gift-wrapped.
        </p>
        <p>
          <strong className="text-slate-900">The code again:</strong> print that same code and stick
          it on the outside of the original packaging. Do not tape the box yet. One code per gift.
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
