import { initEtsyRetailerBootstrap } from "../retailers/etsy/retailer-bootstrap.js";

if (typeof window !== "undefined") {
  window.__WRRAPD_ETSY_CONTENT_BUILD__ = "2026-05-02-scaffold";
  initEtsyRetailerBootstrap();
}
