import { describe, it, expect, vi, afterEach } from "vitest";
import { placeFromNominatimAddress, photonToPlace, ubicarZona } from "./osmMap";

describe("placeFromNominatimAddress", () => {
  it("usa el barrio como zona y nunca calle/altura", () => {
    expect(placeFromNominatimAddress({ road: "Av. Bolivia", house_number: "5150", suburb: "Tres Cerritos", city: "Salta", state: "Salta" })).toEqual({
      zona: "Tres Cerritos",
      ciudad: "Salta",
      provincia: "Salta",
    });
  });
  it("sin barrio, la ciudad (o pueblo)", () => {
    expect(placeFromNominatimAddress({ town: "Cafayate", state: "Salta" })).toEqual({ zona: "Cafayate", ciudad: "Cafayate", provincia: "Salta" });
  });
});

describe("photonToPlace", () => {
  it("arma zona, detalle y coordenadas", () => {
    const p = photonToPlace({
      geometry: { coordinates: [-65.41, -24.75] },
      properties: { name: "Tres Cerritos", district: "Tres Cerritos", city: "Salta", state: "Salta", countrycode: "AR" },
    });
    expect(p).toMatchObject({ zona: "Tres Cerritos", ciudad: "Salta", provincia: "Salta", lat: -24.75, lng: -65.41, countrycode: "AR" });
    expect(p.label).toBe("Tres Cerritos — Salta, Salta");
  });
  it("una calle sin nombre de lugar usa la calle como zona", () => {
    const p = photonToPlace({ geometry: { coordinates: [-65.4, -24.78] }, properties: { street: "Pasaje Julio Outes", city: "Salta", state: "Salta", countrycode: "AR" } });
    expect(p.zona).toBe("Pasaje Julio Outes");
  });
});

describe("ubicarZona", () => {
  afterEach(() => vi.unstubAllGlobals());
  const photon = (features) => ({ features });
  const barrio = { properties: { name: "Tres Cerritos", city: "Salta", countrycode: "AR", osm_value: "neighbourhood" }, geometry: { coordinates: [-65.3926, -24.7684] } };

  it("usa Photon (con prioridad a lo cercano) antes que Nominatim", async () => {
    const urls = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      urls.push(String(url));
      return Response.json(photon([barrio]));
    }));
    expect(await ubicarZona("Tres Cerritos", { lat: -24.78, lng: -65.42 })).toEqual({ lat: -24.7684, lng: -65.3926 });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("photon.komoot.io");
    expect(urls[0]).toContain("lat=-24.78");
  });

  it("si Photon no encuentra nada en Argentina, prueba Nominatim", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) =>
      String(url).includes("photon") ? Response.json(photon([])) : Response.json([{ lat: "-24.1", lon: "-65.3" }])
    ));
    expect(await ubicarZona("Barrio Norte")).toEqual({ lat: -24.1, lng: -65.3 });
  });

  it("null si ninguno lo encuentra", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => (String(url).includes("photon") ? Response.json(photon([])) : Response.json([]))));
    expect(await ubicarZona("asdfgh")).toBeNull();
  });
});
