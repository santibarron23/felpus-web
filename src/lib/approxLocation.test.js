import { describe, it, expect, vi, beforeEach } from "vitest";
import { getApproxLocation, resetApproxLocationCache } from "./approxLocation";
import { approxLocationFromHeaders } from "../app/api/geo/route";

describe("approxLocationFromHeaders", () => {
  it("lee la ubicación aproximada que agrega Vercel", () => {
    const h = new Headers({ "x-vercel-ip-latitude": "-24.7859", "x-vercel-ip-longitude": "-65.4117" });
    expect(approxLocationFromHeaders(h)).toEqual({ lat: -24.7859, lng: -65.4117 });
  });
  it("sin headers (local) o con valores inválidos, no inventa nada", () => {
    expect(approxLocationFromHeaders(new Headers())).toBeNull();
    expect(approxLocationFromHeaders(new Headers({ "x-vercel-ip-latitude": "abc", "x-vercel-ip-longitude": "1" }))).toBeNull();
    expect(approxLocationFromHeaders(new Headers({ "x-vercel-ip-latitude": "0", "x-vercel-ip-longitude": "0" }))).toBeNull();
    expect(approxLocationFromHeaders(new Headers({ "x-vercel-ip-latitude": "95", "x-vercel-ip-longitude": "1" }))).toBeNull();
  });
});

describe("getApproxLocation", () => {
  beforeEach(() => resetApproxLocationCache());
  it("pide /api/geo una sola vez por visita", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ lat: -24.78, lng: -65.41 }) }));
    expect(await getApproxLocation(f)).toEqual({ lat: -24.78, lng: -65.41 });
    expect(await getApproxLocation(f)).toEqual({ lat: -24.78, lng: -65.41 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("si no hay dato o falla la red, devuelve null", async () => {
    expect(await getApproxLocation(async () => ({ ok: true, json: async () => ({ lat: null, lng: null }) }))).toBeNull();
    resetApproxLocationCache();
    expect(await getApproxLocation(async () => { throw new Error("offline"); })).toBeNull();
  });
});
