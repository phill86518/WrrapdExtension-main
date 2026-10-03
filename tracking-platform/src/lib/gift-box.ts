import type { OrderLineItem } from "./types";

export type Inches = { l: number; w: number; h: number };

export type GiftBoxSource = "package" | "product" | "category";

export type GiftBoxEstimate = {
  needsBox: boolean;
  /** Empty when no box and no measured package. */
  boxSize: string;
  source: GiftBoxSource;
  /** Normalized measurement when the retailer listed one. */
  measured?: string;
};

/** Folded apparel uses one standard shirt box, not the garment's body measurements. */
export const SHIRT_BOX = "Shirt box 14 x 10 x 3 in";

/** Common gift cartons, longest side first. */
const BOXES: Inches[] = [
  { l: 6, w: 4, h: 2 },
  { l: 8, w: 6, h: 3 },
  { l: 9, w: 6, h: 4 },
  { l: 10, w: 8, h: 4 },
  { l: 12, w: 9, h: 3 },
  { l: 12, w: 9, h: 4 },
  { l: 12, w: 9, h: 6 },
  { l: 14, w: 10, h: 4 },
  { l: 14, w: 10, h: 6 },
  { l: 16, w: 12, h: 4 },
  { l: 16, w: 12, h: 6 },
  { l: 18, w: 12, h: 6 },
  { l: 18, w: 14, h: 8 },
  { l: 20, w: 14, h: 6 },
  { l: 20, w: 16, h: 8 },
  { l: 24, w: 18, h: 6 },
  { l: 24, w: 18, h: 8 },
  { l: 24, w: 18, h: 12 },
];

function formatInches(d: Inches): string {
  const n = (v: number) => {
    const rounded = Math.round(v * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };
  return `${n(d.l)} x ${n(d.w)} x ${n(d.h)} in`;
}

/** Pull L x W x H from a retailer dimension line. Centimeters and millimeters become inches. */
export function parseDimensionText(raw: string | undefined): Inches | null {
  const text = String(raw || "")
    .replace(/×/g, "x")
    .replace(/[“”″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(?:"|in(?:ch|ches)?)?\s*[lL]?\s*x\s*(\d+(?:\.\d+)?)\s*(?:"|in(?:ch|ches)?)?\s*[wW]?\s*x\s*(\d+(?:\.\d+)?)\s*(?:"|in(?:ch|ches)?|cm|centimeters?|mm|millimeters?)?/i,
  );
  if (!match) return null;
  let a = Number(match[1]);
  let b = Number(match[2]);
  let c = Number(match[3]);
  const unit = (match[4] || "").toLowerCase();
  const tail = text.slice(match.index || 0).toLowerCase();
  const cm = unit.startsWith("cm") || unit.startsWith("cent") || /\bcm\b|centimeter/.test(tail);
  const mm = unit.startsWith("mm") || unit.startsWith("mill") || /\bmm\b|millimeter/.test(tail);
  if (cm) {
    a /= 2.54;
    b /= 2.54;
    c /= 2.54;
  } else if (mm) {
    a /= 25.4;
    b /= 25.4;
    c /= 25.4;
  }
  if (![a, b, c].every((n) => Number.isFinite(n) && n > 0 && n < 80)) return null;
  const [l, w, h] = [a, b, c].sort((x, y) => y - x);
  return { l: l!, w: w!, h: h! };
}

function snapBox(item: Inches): string {
  const need = { l: item.l + 1, w: item.w + 1, h: item.h + 0.5 };
  for (const box of BOXES) {
    if (box.l + 0.05 >= need.l && box.w + 0.05 >= need.w && box.h + 0.05 >= need.h) {
      return formatInches(box);
    }
  }
  return `Custom ${Math.ceil(need.l)} x ${Math.ceil(need.w)} x ${Math.ceil(need.h)} in`;
}

function classify(title: string, category: string): { needsBox: boolean; fallback: Inches } {
  const text = `${category} ${title}`.toLowerCase();
  if (/\b(bouquet|flowers)\b/.test(text)) return { needsBox: false, fallback: { l: 0, w: 0, h: 0 } };
  if (/\b(ring|earring|necklace|bracelet|jewelry|jewellery)\b/.test(text)) {
    return { needsBox: true, fallback: { l: 6, w: 4, h: 2 } };
  }
  if (/\bwatch\b/.test(text)) return { needsBox: true, fallback: { l: 8, w: 6, h: 3 } };
  if (/\b(book|paperback|hardcover|novel|manga)\b/.test(text)) {
    return { needsBox: false, fallback: { l: 10, w: 8, h: 2 } };
  }
  if (isClothingText(text)) {
    return { needsBox: true, fallback: { l: 14, w: 10, h: 3 } };
  }
  if (/\b(shoe|sneaker|boot|sandal)\b/.test(text)) return { needsBox: true, fallback: { l: 14, w: 10, h: 6 } };
  if (/\b(lego|board game|jigsaw|puzzle|boxed set)\b/.test(text)) {
    return { needsBox: false, fallback: { l: 12, w: 9, h: 4 } };
  }
  if (/\b(mug|tumbler|glass|cup)\b/.test(text)) return { needsBox: true, fallback: { l: 8, w: 6, h: 5 } };
  if (/\b(plush|stuffed|teddy)\b/.test(text)) return { needsBox: true, fallback: { l: 12, w: 10, h: 6 } };
  if (/\b(headphone|earbud|earbuds|speaker|tablet|kindle)\b/.test(text)) {
    return { needsBox: false, fallback: { l: 10, w: 8, h: 4 } };
  }
  if (/\b(makeup|lipstick|skincare|perfume|cologne|cosmetic|lotion|fragrance)\b/.test(text)) {
    return { needsBox: true, fallback: { l: 8, w: 6, h: 3 } };
  }
  if (/\b(laptop|monitor|printer)\b/.test(text)) return { needsBox: false, fallback: { l: 18, w: 12, h: 4 } };
  if (/\b(toy|doll|action figure|game)\b/.test(text)) return { needsBox: true, fallback: { l: 12, w: 9, h: 4 } };
  return { needsBox: true, fallback: { l: 12, w: 9, h: 4 } };
}

function isClothingText(text: string): boolean {
  return /\b(shirt|dress|hoodie|sweater|jacket|pants|jeans|apparel|clothing|sock|socks|pajama|pajamas|blouse|skirt|t-shirt|tee)\b/.test(
    text,
  );
}

/** Occasion paper name for inventory and the morning sheet. */
export function wrappingPaperName(line: { wrappingOption?: string; occasion?: string }): string {
  const opt = (line.wrappingOption || "").toLowerCase();
  if (opt === "ai" || opt === "upload") return "Custom printed wrap";
  const occasion = (line.occasion || "").trim();
  if (!occasion) return "Standard wrapping paper";
  return `${occasion.charAt(0).toUpperCase()}${occasion.slice(1)} wrapping paper`;
}

export function estimateGiftBox(input: {
  title?: string;
  category?: string;
  packageDimensions?: string;
  productDimensions?: string;
  flowers?: boolean;
}): GiftBoxEstimate {
  if (input.flowers) return { needsBox: false, boxSize: "", source: "category" };
  const text = `${input.category || ""} ${input.title || ""}`.toLowerCase();
  if (isClothingText(text)) {
    return { needsBox: true, boxSize: SHIRT_BOX, source: "category" };
  }
  const kind = classify(input.title || "", input.category || "");
  const pkg = parseDimensionText(input.packageDimensions);
  const prod = parseDimensionText(input.productDimensions);
  const measured = pkg || prod;
  if (measured) {
    const measuredLabel = formatInches(measured);
    return {
      needsBox: kind.needsBox,
      boxSize: kind.needsBox ? snapBox(measured) : measuredLabel,
      source: pkg ? "package" : "product",
      measured: measuredLabel,
    };
  }
  if (kind.fallback.l <= 0) return { needsBox: false, boxSize: "", source: "category" };
  const guessed = `${formatInches(kind.fallback)} estimate`;
  return {
    needsBox: kind.needsBox,
    boxSize: kind.needsBox ? guessed : "",
    source: "category",
  };
}

export function giftBoxForLine(
  line: Pick<OrderLineItem, "title" | "itemCategory" | "packageDimensions" | "productDimensions" | "flowers">,
): GiftBoxEstimate {
  return estimateGiftBox({
    title: line.title,
    category: line.itemCategory,
    packageDimensions: line.packageDimensions,
    productDimensions: line.productDimensions,
    flowers: line.flowers,
  });
}
