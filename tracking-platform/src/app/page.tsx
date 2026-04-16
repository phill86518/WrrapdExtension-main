import Link from "next/link";
import { WrrapdLogo } from "@/components/wrrapd-logo";
import { DEMO_CUSTOMER_TRACKING_TOKEN } from "@/lib/demo-orders";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto max-w-5xl px-6 py-14">
        <WrrapdLogo className="h-12 w-auto max-w-[200px] brightness-0 invert" />
        <h1 className="mt-4 text-4xl font-semibold">Delivery Command Platform</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          White-labeled tracking MVP running on a single Next.js app: admin command center,
          driver companion, and customer tracking page.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Link href="/admin" className="rounded-xl border border-slate-700 bg-slate-900 p-5 hover:bg-slate-800">
            <h2 className="text-xl font-medium">Phase 1: Command Center</h2>
            <p className="mt-2 text-sm text-slate-300">Manage active, scheduled, and past deliveries.</p>
          </Link>
          <Link href="/driver" className="rounded-xl border border-slate-700 bg-slate-900 p-5 hover:bg-slate-800">
            <h2 className="text-xl font-medium">Phase 2: Driver Companion</h2>
            <p className="mt-2 text-sm text-slate-300">Start deliveries, broadcast GPS, upload proof photos.</p>
          </Link>
          <Link
            href={`/track/${DEMO_CUSTOMER_TRACKING_TOKEN}`}
            className="rounded-xl border border-slate-700 bg-slate-900 p-5 hover:bg-slate-800"
          >
            <h2 className="text-xl font-medium">Phase 3: Customer Tracking</h2>
            <p className="mt-2 text-sm text-slate-300">Live status, ETA, map, and final proof photo.</p>
          </Link>
        </div>
        <div className="mt-8 rounded-lg border border-slate-700 bg-slate-900 p-5 text-sm text-slate-300">
          <p className="font-medium text-slate-100">Default credentials (change in production)</p>
          <p className="mt-1">Admin password: {process.env.APP_ADMIN_PASSWORD || "admin123"}</p>
          <p>Driver passcode: {process.env.APP_DRIVER_PASSWORD || "driver123"}</p>
        </div>
      </main>
    </div>
  );
}
