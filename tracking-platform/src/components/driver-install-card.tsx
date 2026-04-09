"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
}

export function DriverInstallCard() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const ios = useMemo(() => isIosSafari(), []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (hidden) return null;

  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">Install Driver App</p>
          {installEvent ? (
            <p className="mt-1 text-slate-700">
              Install this app on the home screen for one-tap launch and a cleaner driver workflow.
            </p>
          ) : ios ? (
            <p className="mt-1 text-slate-700">
              On iPhone Safari: tap Share, then tap &quot;Add to Home Screen&quot;.
            </p>
          ) : (
            <p className="mt-1 text-slate-700">
              If install is not shown, open in Chrome/Edge and use browser menu &quot;Install app&quot;.
            </p>
          )}
        </div>
        <button className="text-xs text-slate-500 underline" onClick={() => setHidden(true)} type="button">
          Dismiss
        </button>
      </div>
      {installEvent && (
        <button
          type="button"
          className="mt-3 rounded bg-slate-900 px-4 py-2 font-medium text-white"
          onClick={async () => {
            await installEvent.prompt();
            await installEvent.userChoice;
            setInstallEvent(null);
          }}
        >
          Install now
        </button>
      )}
    </div>
  );
}
