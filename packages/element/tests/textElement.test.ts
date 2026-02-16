import { getLineHeight } from "@excalidraw/common";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import {
  FONT_FAMILY,
  TEXT_ALIGN,
  VERTICAL_ALIGN,
  ROUNDNESS,
} from "@excalidraw/common";

import {
  computeContainerDimensionForBoundText,
  computeContainerPadding,
  getContainerCoords,
  getContainerPadding,
  getBoundTextMaxWidth,
  getBoundTextMaxHeight,
  computeBoundTextPosition,
} from "../src/textElement";
import { detectLineHeight, getLineHeightInPx } from "../src/textMeasurements";

import type { ExcalidrawTextElementWithContainer } from "../src/types";

describe("Test measureText", () => {
  describe("Test getContainerCoords", () => {
    const params = { width: 200, height: 100, x: 10, y: 20 };

    it("should compute coords correctly when ellipse", () => {
      const element = API.createElement({
        type: "ellipse",
        ...params,
      });
      // padding.x = 5 + (200/2) * (1 - sqrt(2)/2) ≈ 34.289
      // padding.y = 5 + (100/2) * (1 - sqrt(2)/2) ≈ 19.644
      expect(getContainerCoords(element)).toEqual({
        x: 10 + 5 + (200 / 2) * (1 - Math.sqrt(2) / 2),
        y: 20 + 5 + (100 / 2) * (1 - Math.sqrt(2) / 2),
      });
    });

    it("should compute coords correctly when rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        ...params,
      });
      expect(getContainerCoords(element)).toEqual({
        x: 15,
        y: 25,
      });
    });

    it("should compute coords correctly when diamond", () => {
      const element = API.createElement({
        type: "diamond",
        ...params,
      });
      // padding.x = 5 + 200/4 = 55, padding.y = 5 + 100/4 = 30
      expect(getContainerCoords(element)).toEqual({
        x: 65,
        y: 50,
      });
    });

    it("should compute coords correctly when rounded rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        ...params,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // min(200, 100) = 100, adaptive radius for 100 < 128 → 100 * 0.25 = 25
      // padding.x = max(25, 5) = 25
      expect(getContainerCoords(element)).toEqual({
        x: 35,
        y: 25,
      });
    });

    it("should compute coords correctly when large rounded rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        width: 400,
        height: 300,
        x: 10,
        y: 20,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // min(400, 300) = 300 > 128 → adaptive radius = 32
      // padding.x = max(32, 5) = 32
      expect(getContainerCoords(element)).toEqual({
        x: 42,
        y: 25,
      });
    });
  });

  describe("Test getContainerPadding", () => {
    it("should return BOUND_TEXT_PADDING for sharp rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        width: 200,
        height: 100,
        roundness: null,
      });
      expect(getContainerPadding(element)).toEqual({ x: 5, y: 5 });
    });

    it("should return corner radius for rounded rectangle when larger than BOUND_TEXT_PADDING", () => {
      const element = API.createElement({
        type: "rectangle",
        width: 400,
        height: 300,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // min(400, 300) = 300 > 128 → adaptive radius = 32
      expect(getContainerPadding(element)).toEqual({ x: 32, y: 5 });
    });

    it("should return BOUND_TEXT_PADDING for very small rounded rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        width: 16,
        height: 12,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // min(16, 12) = 12 < 128 → proportional radius = 12 * 0.25 = 3
      // max(3, 5) = 5
      expect(getContainerPadding(element)).toEqual({ x: 5, y: 5 });
    });

    it("should return correct padding for ellipse", () => {
      const element = API.createElement({
        type: "ellipse",
        width: 200,
        height: 100,
      });
      expect(getContainerPadding(element)).toEqual({
        x: 5 + (200 / 2) * (1 - Math.sqrt(2) / 2),
        y: 5 + (100 / 2) * (1 - Math.sqrt(2) / 2),
      });
    });

    it("should return correct padding for diamond", () => {
      const element = API.createElement({
        type: "diamond",
        width: 200,
        height: 100,
      });
      expect(getContainerPadding(element)).toEqual({
        x: 5 + 200 / 4,
        y: 5 + 100 / 4,
      });
    });

    it("should fall back to BOUND_TEXT_PADDING for old drawings without containerPadding", () => {
      const element = API.createElement({
        type: "rectangle",
        width: 400,
        height: 300,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // Simulate an old drawing by removing containerPadding
      const oldElement = { ...element, containerPadding: undefined };
      expect(getContainerPadding(oldElement)).toEqual({ x: 5, y: 5 });
    });

    it("computeContainerPadding should always return adaptive value for rectangles", () => {
      const element = API.createElement({
        type: "rectangle",
        width: 400,
        height: 300,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // Simulate an old drawing by removing containerPadding
      const oldElement = { ...element, containerPadding: undefined };
      // computeContainerPadding ignores containerPadding and always computes
      expect(computeContainerPadding(oldElement)).toEqual({ x: 32, y: 5 });
    });
  });

  describe("Test computeContainerDimensionForBoundText", () => {
    const params = {
      width: 178,
      height: 194,
    };

    it("should compute container height correctly for rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        ...params,
      });
      expect(computeContainerDimensionForBoundText(150, element.type)).toEqual(
        160,
      );
    });

    it("should compute container height correctly for ellipse", () => {
      const element = API.createElement({
        type: "ellipse",
        ...params,
      });
      expect(computeContainerDimensionForBoundText(150, element.type)).toEqual(
        226,
      );
    });

    it("should compute container height correctly for diamond", () => {
      const element = API.createElement({
        type: "diamond",
        ...params,
      });
      expect(computeContainerDimensionForBoundText(150, element.type)).toEqual(
        320,
      );
    });

    it("should compute container width correctly for rounded rectangle", () => {
      const element = API.createElement({
        type: "rectangle",
        ...params,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // min(178, 194) = 178 > 128 → adaptive radius = 32
      // padding.x = max(32, 5) = 32
      // dimension = 150 + 32 * 2 = 214
      expect(
        computeContainerDimensionForBoundText(
          150,
          element.type,
          element,
          "x",
        ),
      ).toEqual(214);
    });

    it("should compute container height correctly for rectangle with container and y axis", () => {
      const element = API.createElement({
        type: "rectangle",
        ...params,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // Height always uses BOUND_TEXT_PADDING regardless of roundness
      // dimension = 150 + 5 * 2 = 160
      expect(
        computeContainerDimensionForBoundText(
          150,
          element.type,
          element,
          "y",
        ),
      ).toEqual(160);
    });
  });

  describe("Test getBoundTextMaxWidth", () => {
    const params = {
      width: 178,
      height: 194,
    };

    it("should return max width when container is rectangle", () => {
      const container = API.createElement({ type: "rectangle", ...params });
      expect(getBoundTextMaxWidth(container, null)).toBe(168);
    });

    it("should return max width when container is ellipse", () => {
      const container = API.createElement({ type: "ellipse", ...params });
      expect(getBoundTextMaxWidth(container, null)).toBe(116);
    });

    it("should return max width when container is diamond", () => {
      const container = API.createElement({ type: "diamond", ...params });
      expect(getBoundTextMaxWidth(container, null)).toBe(79);
    });

    it("should return max width when container is rounded rectangle", () => {
      const container = API.createElement({
        type: "rectangle",
        ...params,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // min(178, 194) = 178 > 128 → adaptive radius = 32
      // padding.x = max(32, 5) = 32
      // maxWidth = 178 - 32 * 2 = 114
      expect(getBoundTextMaxWidth(container, null)).toBe(114);
    });

    it("should return max width when container is small rounded rectangle", () => {
      const container = API.createElement({
        type: "rectangle",
        width: 80,
        height: 60,
        roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
      });
      // min(80, 60) = 60 < 128 → proportional radius = 60 * 0.25 = 15
      // padding.x = max(15, 5) = 15
      // maxWidth = 80 - 15 * 2 = 50
      expect(getBoundTextMaxWidth(container, null)).toBe(50);
    });
  });

  describe("Test getBoundTextMaxHeight", () => {
    const params = {
      width: 178,
      height: 194,
      id: '"container-id',
    };

    const boundTextElement = API.createElement({
      type: "text",
      id: "text-id",
      x: 560.51171875,
      y: 202.033203125,
      width: 154,
      height: 175,
      fontSize: 20,
      fontFamily: 1,
      text: "Excalidraw is a\nvirtual \nopensource \nwhiteboard for \nsketching \nhand-drawn like\ndiagrams",
      textAlign: "center",
      verticalAlign: "middle",
      containerId: params.id,
    }) as ExcalidrawTextElementWithContainer;

    it("should return max height when container is rectangle", () => {
      const container = API.createElement({ type: "rectangle", ...params });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(184);
    });

    it("should return max height when container is ellipse", () => {
      const container = API.createElement({ type: "ellipse", ...params });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(127);
    });

    it("should return max height when container is diamond", () => {
      const container = API.createElement({ type: "diamond", ...params });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(87);
    });

    it("should return max height when container is arrow", () => {
      const container = API.createElement({
        type: "arrow",
        ...params,
      });
      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(194);
    });

    it("should return max height when container is arrow and height is less than threshold", () => {
      const container = API.createElement({
        type: "arrow",
        ...params,
        height: 70,
        boundElements: [{ type: "text", id: "text-id" }],
      });

      expect(getBoundTextMaxHeight(container, boundTextElement)).toBe(
        boundTextElement.height,
      );
    });
  });
});

const textElement = API.createElement({
  type: "text",
  text: "Excalidraw is a\nvirtual \nopensource \nwhiteboard for \nsketching \nhand-drawn like\ndiagrams",
  fontSize: 20,
  fontFamily: 1,
  height: 175,
});

describe("Test detectLineHeight", () => {
  it("should return correct line height", () => {
    expect(detectLineHeight(textElement)).toBe(1.25);
  });
});

describe("Test getLineHeightInPx", () => {
  it("should return correct line height", () => {
    expect(
      getLineHeightInPx(textElement.fontSize, textElement.lineHeight),
    ).toBe(25);
  });
});

describe("Test getDefaultLineHeight", () => {
  it("should return line height using default font family when not passed", () => {
    //@ts-ignore
    expect(getLineHeight()).toBe(1.25);
  });

  it("should return line height using default font family for unknown font", () => {
    const UNKNOWN_FONT = 5;
    expect(getLineHeight(UNKNOWN_FONT)).toBe(1.25);
  });

  it("should return correct line height", () => {
    expect(getLineHeight(FONT_FAMILY.Cascadia)).toBe(1.2);
  });
});

describe("Test computeBoundTextPosition", () => {
  const createMockElementsMap = () => new Map();

  // Helper function to create rectangle test case with 90-degree rotation
  const createRotatedRectangleTestCase = (
    textAlign: string,
    verticalAlign: string,
  ) => {
    const container = API.createElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      angle: (Math.PI / 2) as any, // 90 degrees
    });

    const boundTextElement = API.createElement({
      type: "text",
      width: 80,
      height: 40,
      text: "hello darkness my old friend",
      textAlign: textAlign as any,
      verticalAlign: verticalAlign as any,
      containerId: container.id,
    }) as ExcalidrawTextElementWithContainer;

    const elementsMap = createMockElementsMap();

    return { container, boundTextElement, elementsMap };
  };

  describe("90-degree rotation with all alignment combinations", () => {
    // Test all 9 combinations of horizontal (left, center, right) and vertical (top, middle, bottom) alignment

    it("should position text with LEFT + TOP alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(TEXT_ALIGN.LEFT, VERTICAL_ALIGN.TOP);

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(185, 1);
      expect(result.y).toBeCloseTo(75, 1);
    });

    it("should position text with LEFT + MIDDLE alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(TEXT_ALIGN.LEFT, VERTICAL_ALIGN.MIDDLE);

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(160, 1);
      expect(result.y).toBeCloseTo(75, 1);
    });

    it("should position text with LEFT + BOTTOM alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(TEXT_ALIGN.LEFT, VERTICAL_ALIGN.BOTTOM);

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(135, 1);
      expect(result.y).toBeCloseTo(75, 1);
    });

    it("should position text with CENTER + TOP alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(TEXT_ALIGN.CENTER, VERTICAL_ALIGN.TOP);

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(185, 1);
      expect(result.y).toBeCloseTo(130, 1);
    });

    it("should position text with CENTER + MIDDLE alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(
          TEXT_ALIGN.CENTER,
          VERTICAL_ALIGN.MIDDLE,
        );

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(160, 1);
      expect(result.y).toBeCloseTo(130, 1);
    });

    it("should position text with CENTER + BOTTOM alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(
          TEXT_ALIGN.CENTER,
          VERTICAL_ALIGN.BOTTOM,
        );

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(135, 1);
      expect(result.y).toBeCloseTo(130, 1);
    });

    it("should position text with RIGHT + TOP alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(TEXT_ALIGN.RIGHT, VERTICAL_ALIGN.TOP);

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(185, 1);
      expect(result.y).toBeCloseTo(185, 1);
    });

    it("should position text with RIGHT + MIDDLE alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(TEXT_ALIGN.RIGHT, VERTICAL_ALIGN.MIDDLE);

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(160, 1);
      expect(result.y).toBeCloseTo(185, 1);
    });

    it("should position text with RIGHT + BOTTOM alignment at 90-degree rotation", () => {
      const { container, boundTextElement, elementsMap } =
        createRotatedRectangleTestCase(TEXT_ALIGN.RIGHT, VERTICAL_ALIGN.BOTTOM);

      const result = computeBoundTextPosition(
        container,
        boundTextElement,
        elementsMap,
      );

      expect(result.x).toBeCloseTo(135, 1);
      expect(result.y).toBeCloseTo(185, 1);
    });
  });
});
