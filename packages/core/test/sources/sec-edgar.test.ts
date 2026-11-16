import { describe, expect, it } from "vitest";
import { createSecFormDAdapter, parseFormDTitle } from "../../src/sources/sec-edgar";
import { DAY_AGO, fixtureCtx } from "../helpers";

const def = {
  id: "sec-form-d",
  kind: "sec_form_d" as const,
  name: "SEC EDGAR Form D",
  count: 100,
  quality: 70,
  enabled: true,
};

describe("sec form d adapter", () => {
  it("parses filing titles", () => {
    expect(parseFormDTitle("D - Vaultline, Inc. (0002100001) (Filer)")).toEqual({
      form: "D",
      company: "Vaultline, Inc.",
      cik: "0002100001",
    });
  });

  it("keeps operating companies, skips funds and amendments", async () => {
    const items = await createSecFormDAdapter(def, fixtureCtx()).fetch(DAY_AGO);
    expect(items.map((i) => i.extra?.company)).toEqual(["Vaultline, Inc.", "Brightloop Labs Inc."]);
    expect(items[0]!.title).toBe("Vaultline, Inc. files Form D for a private funding round");
  });

  it("skips without a contact email (EDGAR requires one)", async () => {
    expect(
      await createSecFormDAdapter(def, fixtureCtx({ contactEmail: undefined })).fetch(DAY_AGO),
    ).toEqual([]);
  });
});
