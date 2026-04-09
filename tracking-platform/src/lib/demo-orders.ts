import type { Order } from "./types";
import { getNextThreeDemoScheduleInstants } from "./scheduling";

const nowIso = () => new Date().toISOString();

/** Sample tracking link on the marketing home page */
export const DEMO_CUSTOMER_TRACKING_TOKEN = "trk_demo_001";

const customers: Array<{
  customerName: string;
  customerPhone: string;
  recipientName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}> = [
  { customerName: "Avery Cole", customerPhone: "+19045550110", recipientName: "Casey Johnson", addressLine1: "8137 Broward Cove Rd", city: "Jacksonville", state: "FL", postalCode: "32218" },
  { customerName: "Blake Reed", customerPhone: "+19045550111", recipientName: "Drew Martinez", addressLine1: "4455 Atlantic Blvd", city: "Jacksonville", state: "FL", postalCode: "32207" },
  { customerName: "Cameron Diaz", customerPhone: "+19045550112", recipientName: "Emery Chen", addressLine1: "1200 San Jose Blvd", city: "Jacksonville", state: "FL", postalCode: "32217" },
  { customerName: "Dana Scott", customerPhone: "+19045550113", recipientName: "Finley Brooks", addressLine1: "88 Riverside Ave", city: "Jacksonville", state: "FL", postalCode: "32204" },
  { customerName: "Ellis Park", customerPhone: "+19045550114", recipientName: "Gray Adams", addressLine1: "2100 Monument Rd", city: "Jacksonville", state: "FL", postalCode: "32225" },
  { customerName: "Frankie Lane", customerPhone: "+19045550115", recipientName: "Harper Quinn", addressLine1: "340 Beach Blvd", city: "Jacksonville", state: "FL", postalCode: "32250" },
  { customerName: "George Kim", customerPhone: "+19045550116", recipientName: "Indigo Patel", addressLine1: "5011 Gate Pkwy", city: "Jacksonville", state: "FL", postalCode: "32256" },
  { customerName: "Hayden Fox", customerPhone: "+19045550117", recipientName: "Jules Rivera", addressLine1: "9700 Deer Lake Ct", city: "Jacksonville", state: "FL", postalCode: "32246" },
  { customerName: "Iris Moon", customerPhone: "+19045550118", recipientName: "Kai Thompson", addressLine1: "6331 Roosevelt Blvd", city: "Jacksonville", state: "FL", postalCode: "32244" },
  { customerName: "Jamie Cruz", customerPhone: "+19045550119", recipientName: "Logan White", addressLine1: "10200 Belle Rive Blvd", city: "Jacksonville", state: "FL", postalCode: "32256" },
  { customerName: "Kelly Ng", customerPhone: "+19045550120", recipientName: "Morgan Blake", addressLine1: "7801 Point Meadows Dr", city: "Jacksonville", state: "FL", postalCode: "32256" },
  { customerName: "Lou Martinez", customerPhone: "+19045550121", recipientName: "Noel Garcia", addressLine1: "4495 Roosevelt Blvd", city: "Jacksonville", state: "FL", postalCode: "32210" },
  { customerName: "Max Stone", customerPhone: "+19045550122", recipientName: "Oakley Price", addressLine1: "6735 103rd St", city: "Jacksonville", state: "FL", postalCode: "32210" },
  { customerName: "Nico Bell", customerPhone: "+19045550123", recipientName: "Parker Hill", addressLine1: "9375 Philips Hwy", city: "Jacksonville", state: "FL", postalCode: "32256" },
  { customerName: "Oakley West", customerPhone: "+19045550124", recipientName: "Quinn Foster", addressLine1: "11900 Atlantic Blvd", city: "Jacksonville", state: "FL", postalCode: "32225" },
  { customerName: "Peyton Rose", customerPhone: "+19045550125", recipientName: "Reese Cooper", addressLine1: "2000 Southside Blvd", city: "Jacksonville", state: "FL", postalCode: "32216" },
  { customerName: "Quinn Blake", customerPhone: "+19045550126", recipientName: "Sage Turner", addressLine1: "8500 Baymeadows Rd", city: "Jacksonville", state: "FL", postalCode: "32256" },
  { customerName: "Riley Shaw", customerPhone: "+19045550127", recipientName: "Tatum Ellis", addressLine1: "10915 Baymeadows Rd", city: "Jacksonville", state: "FL", postalCode: "32256" },
  { customerName: "Sloane Gray", customerPhone: "+19045550128", recipientName: "Urban Diaz", addressLine1: "13400 Beach Blvd", city: "Jacksonville", state: "FL", postalCode: "32224" },
  { customerName: "Taylor Voss", customerPhone: "+19045550129", recipientName: "Val Avery", addressLine1: "7050 Normandy Blvd", city: "Jacksonville", state: "FL", postalCode: "32205" },
];

/**
 * 20 demo stops split 5 / 7 / 8 across the next three NY-local demo evenings,
 * plus one historical delivered row for reporting. First demo order is en_route for the live board.
 */
export function buildDemoSeedOrders(): Order[] {
  const [d1, d2, d3] = getNextThreeDemoScheduleInstants();
  const slots: string[] = [
    d1, d1, d1, d1, d1,
    d2, d2, d2, d2, d2, d2, d2,
    d3, d3, d3, d3, d3, d3, d3, d3,
  ];

  const demo: Order[] = customers.map((c, i) => {
    const n = i + 1;
    const id = `ord-20${String(n).padStart(2, "0")}`;
    const isFirst = i === 0;
    return {
      id,
      ...c,
      scheduledFor: slots[i],
      driverId: "drv-1",
      driverName: "Roger",
      status: isFirst ? "en_route" : "scheduled",
      trackingToken: isFirst ? DEMO_CUSTOMER_TRACKING_TOKEN : `trk_demo_${String(n).padStart(3, "0")}`,
      etaMinutes: isFirst ? 42 : undefined,
      latestLocation: isFirst
        ? { lat: 30.35, lng: -81.65, updatedAt: nowIso() }
        : undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      sourceNote: "Test-phase planner date (production: Amazon delivery day + 1)",
    };
  });

  const past: Order = {
    id: "ord-0999",
    customerName: "Jamie Brown",
    customerPhone: "+19045550102",
    recipientName: "Sam Carter",
    addressLine1: "12 Riverwalk Ave",
    city: "Jacksonville",
    state: "FL",
    postalCode: "32202",
    scheduledFor: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    status: "delivered",
    driverId: "drv-1",
    driverName: "Roger",
    trackingToken: "trk_0999",
    proofPhotoUrl: "https://storage.googleapis.com/generativeai-downloads/images/scones.jpg",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sourceNote: "Historical sample",
  };

  return [...demo, past];
}
