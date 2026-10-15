import { describe, expect, it } from "vitest";
import { guessCategory, parseReceiptText } from "../lib/receipt";

describe("parseReceiptText", () => {
  it("understands common line formats", () => {
    const { items, skipped } = parseReceiptText(
      [
        "Chicken Wings 2 x 190",
        "Oktober Sausage Pizza x2 390",
        "2x Big Weekend 270",
        "Linguine Vongole 1 350",
        "Caesar Royale 320",
        "Bitburger Pint 500 ml 189",
        "Katherine Hills Cabernet, 3, 890",
        "- Margherita Pizza ฿360",
        "Seafood Arrabbiata 1,290.50",
        "",
        "Thank you!",
      ].join("\n"),
    );
    expect(items.map((i) => [i.name, i.qty, i.price])).toEqual([
      ["Chicken Wings", "2", "190"],
      ["Oktober Sausage Pizza", "2", "390"],
      ["Big Weekend", "2", "270"],
      ["Linguine Vongole", "1", "350"],
      ["Caesar Royale", "1", "320"],
      ["Bitburger Pint 500 ml", "1", "189"],
      ["Katherine Hills Cabernet", "3", "890"],
      ["Margherita Pizza", "1", "360"],
      ["Seafood Arrabbiata", "1", "1290.5"],
    ]);
    expect(skipped).toEqual(["Thank you!"]);
  });

  it("merges repeated lines (like Still Water 3 + 7 + 2)", () => {
    const { items } = parseReceiptText("Still Water 3 30\nStill Water 7 30\nStill Water 2 30");
    expect(items).toEqual([{ name: "Still Water", category: "water", qty: "12", price: "30" }]);
  });

  it("divides line totals by qty when asked", () => {
    const { items } = parseReceiptText("Chicken Wings 2 380\nWine 3 2670", { lineTotals: true });
    expect(items.map((i) => i.price)).toEqual(["190", "890"]);
  });
});

describe("guessCategory", () => {
  it("sorts items into categories", () => {
    expect(guessCategory("Still Water")).toBe("water");
    expect(guessCategory("น้ำเปล่า")).toBe("water");
    expect(guessCategory("Bitburger Pint 500 ml")).toBe("alcohol");
    expect(guessCategory("Katherine Hills Cabernet Sauvignon (bottle)")).toBe("alcohol");
    expect(guessCategory("เบียร์สิงห์")).toBe("alcohol");
    expect(guessCategory("Wild Honey Fresh Lemonade")).toBe("drinks");
    expect(guessCategory("ชาไทย")).toBe("drinks");
    expect(guessCategory("Beef Lasagna")).toBe("food");
  });
});
