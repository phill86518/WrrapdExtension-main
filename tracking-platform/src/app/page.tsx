import Link from "next/link";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { DEMO_CUSTOMER_TRACKING_TOKEN } from "@/lib/demo-orders";
import { chromeWebStoreUrl, supportEmailDisplay, supportMailto } from "@/lib/site";

export default function Home() {
  const storeUrl = chromeWebStoreUrl();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <WrrapdLogo className="h-10 w-auto max-w-[180px] brightness-0 invert" />
          <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm text-slate-300">
            <a className="hover:text-white" href={supportMailto()}>
              {supportEmailDisplay()}
            </a>
            <Link href="/platform" className="text-slate-500 hover:text-slate-300">
              Team
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16 md:py-24">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400/90">Amazon gifting</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Wrap smarter. Ship calmer. Track every Wrrapd delivery.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-300">
          The Wrrapd Chrome extension works on Amazon checkout to elevate your gifting flow. Your orders connect to
          live routing and proof-of-delivery on our GCP-backed platform.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          {storeUrl ? (
            <a
              href={storeUrl}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-slate-950 shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-400"
            >
              Get the Chrome extension
            </a>
          ) : (
            <a
              href={supportMailto()}
              className="inline-flex flex-col items-center justify-center rounded-xl border border-slate-600 bg-slate-900/80 px-6 py-3.5 text-center text-base font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Chrome extension
              <span className="mt-0.5 text-xs font-normal text-slate-500">Email us for the Web Store link</span>
            </a>
          )}
          <Link
            href={`/track/${DEMO_CUSTOMER_TRACKING_TOKEN}`}
            className="inline-flex items-center justify-center rounded-xl border border-slate-600 bg-slate-900/80 px-6 py-3.5 text-base font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
          >
            Sample tracking page
          </Link>
        </div>

        <section className="mt-20 grid gap-10 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">1 · Install</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Add Wrrapd from the Chrome Web Store. The extension only requests access to Amazon and Wrrapd APIs.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">2 · Shop Amazon</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Use Amazon.com as usual. Wrrapd assists during checkout and gift options so your wrap experience stays
              consistent.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-semibold text-white">3 · Track delivery</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Recipients and senders get secure tracking links. Combined deliveries and date choices are handled on
              this same site.
            </p>
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950 p-8 md:p-10">
          <h2 className="text-xl font-semibold text-white">Same stack as production</h2>
          <p className="mt-3 max-w-3xl text-slate-400">
            Payments and AI features use <span className="text-slate-300">api.wrrapd.com</span> on your GCP VM.
            Checkout pages use <span className="text-slate-300">pay.wrrapd.com</span>. This app powers driver tools,
            admin, and customer tracking on Cloud Run — point <span className="text-slate-300">wrrapd.com</span> here
            when you are ready for one branded home.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-10 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} Wrrapd</p>
        <p className="mt-2">
          <a href={supportMailto()} className="text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline">
            Contact
          </a>
        </p>
      </footer>
    </div>
  );
}
