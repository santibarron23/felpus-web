import { describe, it, expect } from "vitest";
import { placeFromNominatimAddress, photonToPlace } from "./osmMap";

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
