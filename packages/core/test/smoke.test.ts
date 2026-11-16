import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index";

describe("core", () => {
  it("exports a version", () => {
    expect(VERSION).toMatch(/\d+\.\d+\.\d+/);
  });
});
