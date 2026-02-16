import {
  ARROW_LABEL_FONT_SIZE_TO_MIN_WIDTH_RATIO,
  ARROW_LABEL_WIDTH_FRACTION,
  BOUND_TEXT_PADDING,
  DEFAULT_FONT_SIZE,
  TEXT_ALIGN,
  VERTICAL_ALIGN,
  getFontString,
  isProdEnv,
  invariant,
} from "@excalidraw/common";

import { pointFrom, pointRotateRads, type Radians } from "@excalidraw/math";

import type { AppState } from "@excalidraw/excalidraw/types";

import type { ExtractSetType } from "@excalidraw/common/utility-types";

import {
  resetOriginalContainerCache,
  updateOriginalContainerCache,
} from "./containerCache";
import { LinearElementEditor } from "./linearElementEditor";

import { measureText } from "./textMeasurements";
import { wrapText } from "./textWrapping";
import {
  isBoundToContainer,
  isArrowElement,
  isTextElement,
} from "./typeChecks";

import { getCornerRadius } from "./utils";

import type { Scene } from "./Scene";

import type { MaybeTransformHandleType } from "./transformHandles";
import type {
  ElementsMap,
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawElementType,
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
  ExcalidrawTextElementWithContainer,
  NonDeletedExcalidrawElement,
} from "./types";

/** Text containers that carry `containerPadding` (i.e. not arrows). */
type PaddedTextContainer = Exclude<
  ExcalidrawTextContainer,
  ExcalidrawArrowElement
>;

export const redrawTextBoundingBox = (
  textElement: ExcalidrawTextElement,
  container: ExcalidrawElement | null,
  scene: Scene,
) => {
  const elementsMap = scene.getNonDeletedElementsMap();

  let maxWidth = undefined;

  if (!isProdEnv()) {
    invariant(
      !container || !isArrowElement(container) || textElement.angle === 0,
      "text element angle must be 0 if bound to arrow container",
    );
  }

  const boundTextUpdates = {
    x: textElement.x,
    y: textElement.y,
    text: textElement.text,
    width: textElement.width,
    height: textElement.height,
    angle: (container
      ? isArrowElement(container)
        ? 0
        : container.angle
      : textElement.angle) as Radians,
  };

  boundTextUpdates.text = textElement.text;

  if (container || !textElement.autoResize) {
    maxWidth = container
      ? getBoundTextMaxWidth(container, textElement)
      : textElement.width;
    boundTextUpdates.text = wrapText(
      textElement.originalText,
      getFontString(textElement),
      maxWidth,
    );
  }

  const metrics = measureText(
    boundTextUpdates.text,
    getFontString(textElement),
    textElement.lineHeight,
  );

  // Note: only update width for unwrapped text and bound texts (which always have autoResize set to true)
  if (textElement.autoResize) {
    boundTextUpdates.width = metrics.width;
  }
  boundTextUpdates.height = metrics.height;

  if (container) {
    const maxContainerHeight = getBoundTextMaxHeight(
      container,
      textElement as ExcalidrawTextElementWithContainer,
    );
    const maxContainerWidth = getBoundTextMaxWidth(container, textElement);

    if (!isArrowElement(container) && metrics.height > maxContainerHeight) {
      const nextHeight = computeContainerDimensionForBoundText(
        metrics.height,
        container.type,
        container,
        "y",
      );
      scene.mutateElement(container, { height: nextHeight });
      updateOriginalContainerCache(container.id, nextHeight);
    }

    if (metrics.width > maxContainerWidth) {
      const nextWidth = computeContainerDimensionForBoundText(
        metrics.width,
        container.type,
        container,
        "x",
      );
      scene.mutateElement(container, { width: nextWidth });
    }

    // Update containerPadding after any dimension changes
    if (!isArrowElement(container)) {
      const textContainer = container as PaddedTextContainer;
      const newPadding = computeContainerPadding(container);
      if (
        textContainer.containerPadding?.x !== newPadding.x ||
        textContainer.containerPadding?.y !== newPadding.y
      ) {
        scene.mutateElement(textContainer, {
          containerPadding: newPadding,
        });
      }
    }

    const updatedTextElement = {
      ...textElement,
      ...boundTextUpdates,
    } as ExcalidrawTextElementWithContainer;

    const { x, y } = computeBoundTextPosition(
      container,
      updatedTextElement,
      elementsMap,
    );

    boundTextUpdates.x = x;
    boundTextUpdates.y = y;
  }

  scene.mutateElement(textElement, boundTextUpdates);
};

export const handleBindTextResize = (
  container: NonDeletedExcalidrawElement,
  scene: Scene,
  transformHandleType: MaybeTransformHandleType,
  shouldMaintainAspectRatio = false,
) => {
  const elementsMap = scene.getNonDeletedElementsMap();
  const boundTextElementId = getBoundTextElementId(container);
  if (!boundTextElementId) {
    return;
  }
  resetOriginalContainerCache(container.id);
  const textElement = getBoundTextElement(container, elementsMap);
  if (textElement && textElement.text) {
    if (!container) {
      return;
    }

    let text = textElement.text;
    let nextHeight = textElement.height;
    let nextWidth = textElement.width;
    const maxWidth = getBoundTextMaxWidth(container, textElement);
    const maxHeight = getBoundTextMaxHeight(container, textElement);
    let containerHeight = container.height;
    if (
      shouldMaintainAspectRatio ||
      (transformHandleType !== "n" && transformHandleType !== "s")
    ) {
      if (text) {
        text = wrapText(
          textElement.originalText,
          getFontString(textElement),
          maxWidth,
        );
      }
      const metrics = measureText(
        text,
        getFontString(textElement),
        textElement.lineHeight,
      );
      nextHeight = metrics.height;
      nextWidth = metrics.width;
    }
    // increase height in case text element height exceeds
    if (nextHeight > maxHeight) {
      containerHeight = computeContainerDimensionForBoundText(
        nextHeight,
        container.type,
        container,
        "y",
      );

      const diff = containerHeight - container.height;
      // fix the y coord when resizing from ne/nw/n
      const updatedY =
        !isArrowElement(container) &&
        (transformHandleType === "ne" ||
          transformHandleType === "nw" ||
          transformHandleType === "n")
          ? container.y - diff
          : container.y;
      scene.mutateElement(container, {
        height: containerHeight,
        y: updatedY,
      });
    }

    scene.mutateElement(textElement, {
      text,
      width: nextWidth,
      height: nextHeight,
    });

    if (!isArrowElement(container)) {
      // Update containerPadding after any dimension changes
      const textContainer = container as PaddedTextContainer;
      const newPadding = computeContainerPadding(container);
      if (
        textContainer.containerPadding?.x !== newPadding.x ||
        textContainer.containerPadding?.y !== newPadding.y
      ) {
        scene.mutateElement(textContainer, {
          containerPadding: newPadding,
        });
      }
      scene.mutateElement(
        textElement,
        computeBoundTextPosition(container, textElement, elementsMap),
      );
    }
  }
};

export const computeBoundTextPosition = (
  container: ExcalidrawElement,
  boundTextElement: ExcalidrawTextElementWithContainer,
  elementsMap: ElementsMap,
) => {
  if (isArrowElement(container)) {
    return LinearElementEditor.getBoundTextElementPosition(
      container,
      boundTextElement,
      elementsMap,
    );
  }
  const containerCoords = getContainerCoords(container);
  const maxContainerHeight = getBoundTextMaxHeight(container, boundTextElement);
  const maxContainerWidth = getBoundTextMaxWidth(container, boundTextElement);

  let x;
  let y;
  if (boundTextElement.verticalAlign === VERTICAL_ALIGN.TOP) {
    y = containerCoords.y;
  } else if (boundTextElement.verticalAlign === VERTICAL_ALIGN.BOTTOM) {
    y = containerCoords.y + (maxContainerHeight - boundTextElement.height);
  } else {
    y =
      containerCoords.y +
      (maxContainerHeight / 2 - boundTextElement.height / 2);
  }
  if (boundTextElement.textAlign === TEXT_ALIGN.LEFT) {
    x = containerCoords.x;
  } else if (boundTextElement.textAlign === TEXT_ALIGN.RIGHT) {
    x = containerCoords.x + (maxContainerWidth - boundTextElement.width);
  } else {
    x =
      containerCoords.x + (maxContainerWidth / 2 - boundTextElement.width / 2);
  }
  const angle = (container.angle ?? 0) as Radians;

  if (angle !== 0) {
    const contentCenter = pointFrom(
      containerCoords.x + maxContainerWidth / 2,
      containerCoords.y + maxContainerHeight / 2,
    );
    const textCenter = pointFrom(
      x + boundTextElement.width / 2,
      y + boundTextElement.height / 2,
    );

    const [rx, ry] = pointRotateRads(textCenter, contentCenter, angle);

    return {
      x: rx - boundTextElement.width / 2,
      y: ry - boundTextElement.height / 2,
    };
  }

  return { x, y };
};

export const getBoundTextElementId = (container: ExcalidrawElement | null) => {
  return container?.boundElements?.length
    ? container?.boundElements?.find((ele) => ele.type === "text")?.id || null
    : null;
};

export const getBoundTextElement = (
  element: ExcalidrawElement | null,
  elementsMap: ElementsMap,
) => {
  if (!element) {
    return null;
  }
  const boundTextElementId = getBoundTextElementId(element);

  if (boundTextElementId) {
    return (elementsMap.get(boundTextElementId) ||
      null) as ExcalidrawTextElementWithContainer | null;
  }
  return null;
};

export const getContainerElement = (
  element: ExcalidrawTextElement | null,
  elementsMap: ElementsMap,
): ExcalidrawTextContainer | null => {
  if (!element) {
    return null;
  }
  if (element.containerId) {
    return (elementsMap.get(element.containerId) ||
      null) as ExcalidrawTextContainer | null;
  }
  return null;
};

export const getContainerCenter = (
  container: ExcalidrawElement,
  appState: AppState,
  elementsMap: ElementsMap,
) => {
  if (!isArrowElement(container)) {
    return {
      x: container.x + container.width / 2,
      y: container.y + container.height / 2,
    };
  }
  const points = LinearElementEditor.getPointsGlobalCoordinates(
    container,
    elementsMap,
  );
  if (points.length % 2 === 1) {
    const index = Math.floor(container.points.length / 2);
    const midPoint = LinearElementEditor.getPointGlobalCoordinates(
      container,
      container.points[index],
      elementsMap,
    );
    return { x: midPoint[0], y: midPoint[1] };
  }
  const index = container.points.length / 2 - 1;
  let midSegmentMidpoint = LinearElementEditor.getEditorMidPoints(
    container,
    elementsMap,
    appState,
  )[index];
  if (!midSegmentMidpoint) {
    midSegmentMidpoint = LinearElementEditor.getSegmentMidPoint(
      container,
      index + 1,
    );
  }
  return { x: midSegmentMidpoint[0], y: midSegmentMidpoint[1] };
};

/**
 * Computes the padding for bound text inside a container based on its
 * current dimensions and roundness. Always returns the adaptive value.
 * Use this when setting containerPadding on the element.
 */
export const computeContainerPadding = (
  container: ExcalidrawElement,
): { x: number; y: number } => {
  if (container.type === "ellipse") {
    // The derivation is explained in https://github.com/excalidraw/excalidraw/pull/6172
    return {
      x: BOUND_TEXT_PADDING + (container.width / 2) * (1 - Math.sqrt(2) / 2),
      y: BOUND_TEXT_PADDING + (container.height / 2) * (1 - Math.sqrt(2) / 2),
    };
  }
  if (container.type === "diamond") {
    // The derivation is explained in https://github.com/excalidraw/excalidraw/pull/6265
    return {
      x: BOUND_TEXT_PADDING + container.width / 4,
      y: BOUND_TEXT_PADDING + container.height / 4,
    };
  }
  if (container.type === "rectangle") {
    return {
      x: Math.max(
        getCornerRadius(Math.min(container.width, container.height), container),
        BOUND_TEXT_PADDING,
      ),
      y: BOUND_TEXT_PADDING,
    };
  }
  return { x: BOUND_TEXT_PADDING, y: BOUND_TEXT_PADDING };
};

/**
 * Returns the padding for bound text inside a container.
 * For new elements (those with containerPadding set), returns the stored value.
 * For old drawings (without containerPadding), falls back to BOUND_TEXT_PADDING
 * to preserve backward compatibility.
 */
export const getContainerPadding = (
  container: ExcalidrawElement,
): { x: number; y: number } => {
  if ("containerPadding" in container && container.containerPadding) {
    return container.containerPadding;
  }
  return { x: BOUND_TEXT_PADDING, y: BOUND_TEXT_PADDING };
};

export const getContainerCoords = (container: NonDeletedExcalidrawElement) => {
  const padding = getContainerPadding(container);
  return {
    x: container.x + padding.x,
    y: container.y + padding.y,
  };
};

export const getTextElementAngle = (
  textElement: ExcalidrawTextElement,
  container: ExcalidrawTextContainer | null,
) => {
  if (isArrowElement(container)) {
    return 0;
  }
  if (!container) {
    return textElement.angle;
  }
  return container.angle;
};

export const getBoundTextElementPosition = (
  container: ExcalidrawElement,
  boundTextElement: ExcalidrawTextElementWithContainer,
  elementsMap: ElementsMap,
) => {
  if (isArrowElement(container)) {
    return LinearElementEditor.getBoundTextElementPosition(
      container,
      boundTextElement,
      elementsMap,
    );
  }
};

export const shouldAllowVerticalAlign = (
  selectedElements: NonDeletedExcalidrawElement[],
  elementsMap: ElementsMap,
) => {
  return selectedElements.some((element) => {
    if (isBoundToContainer(element)) {
      const container = getContainerElement(element, elementsMap);
      if (isArrowElement(container)) {
        return false;
      }
      return true;
    }
    return false;
  });
};

export const suppportsHorizontalAlign = (
  selectedElements: NonDeletedExcalidrawElement[],
  elementsMap: ElementsMap,
) => {
  return selectedElements.some((element) => {
    if (isBoundToContainer(element)) {
      const container = getContainerElement(element, elementsMap);
      if (isArrowElement(container)) {
        return false;
      }
      return true;
    }

    return isTextElement(element);
  });
};

const VALID_CONTAINER_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
]);

export const isValidTextContainer = (element: {
  type: ExcalidrawElementType;
}) => VALID_CONTAINER_TYPES.has(element.type);

export const computeContainerDimensionForBoundText = (
  dimension: number,
  containerType: ExtractSetType<typeof VALID_CONTAINER_TYPES>,
  container?: ExcalidrawElement,
  axis: "x" | "y" = "y",
) => {
  dimension = Math.ceil(dimension);
  const padding = BOUND_TEXT_PADDING * 2;

  if (containerType === "ellipse") {
    return Math.round(((dimension + padding) / Math.sqrt(2)) * 2);
  }
  if (containerType === "arrow") {
    return dimension + padding * 8;
  }
  if (containerType === "diamond") {
    return 2 * (dimension + padding);
  }
  if (containerType === "rectangle" && container && axis === "x") {
    const horizontalPadding = getContainerPadding(container).x;
    return dimension + horizontalPadding * 2;
  }
  return dimension + padding;
};

export const getBoundTextMaxWidth = (
  container: ExcalidrawElement,
  boundTextElement: ExcalidrawTextElement | null,
) => {
  const { width } = container;
  if (isArrowElement(container)) {
    const minWidth =
      (boundTextElement?.fontSize ?? DEFAULT_FONT_SIZE) *
      ARROW_LABEL_FONT_SIZE_TO_MIN_WIDTH_RATIO;
    return Math.max(ARROW_LABEL_WIDTH_FRACTION * width, minWidth);
  }
  if (container.type === "ellipse") {
    // The width of the largest rectangle inscribed inside an ellipse is
    // Math.round((ellipse.width / 2) * Math.sqrt(2)) which is derived from
    // equation of an ellipse -https://github.com/excalidraw/excalidraw/pull/6172
    return Math.round((width / 2) * Math.sqrt(2)) - BOUND_TEXT_PADDING * 2;
  }
  if (container.type === "diamond") {
    // The width of the largest rectangle inscribed inside a rhombus is
    // Math.round(width / 2) - https://github.com/excalidraw/excalidraw/pull/6265
    return Math.round(width / 2) - BOUND_TEXT_PADDING * 2;
  }

  if (container.type === "rectangle") {
    return width - getContainerPadding(container).x * 2;
  }
  return width - BOUND_TEXT_PADDING * 2;
};

export const getBoundTextMaxHeight = (
  container: ExcalidrawElement,
  boundTextElement: ExcalidrawTextElementWithContainer,
) => {
  const { height } = container;
  if (isArrowElement(container)) {
    const containerHeight = height - BOUND_TEXT_PADDING * 8 * 2;
    if (containerHeight <= 0) {
      return boundTextElement.height;
    }
    return height;
  }
  if (container.type === "ellipse") {
    // The height of the largest rectangle inscribed inside an ellipse is
    // Math.round((ellipse.height / 2) * Math.sqrt(2)) which is derived from
    // equation of an ellipse - https://github.com/excalidraw/excalidraw/pull/6172
    return Math.round((height / 2) * Math.sqrt(2)) - BOUND_TEXT_PADDING * 2;
  }
  if (container.type === "diamond") {
    // The height of the largest rectangle inscribed inside a rhombus is
    // Math.round(height / 2) - https://github.com/excalidraw/excalidraw/pull/6265
    return Math.round(height / 2) - BOUND_TEXT_PADDING * 2;
  }
  return height - BOUND_TEXT_PADDING * 2;
};

/** retrieves text from text elements and concatenates to a single string */
export const getTextFromElements = (
  elements: readonly ExcalidrawElement[],
  separator = "\n\n",
) => {
  const text = elements
    .reduce((acc: string[], element) => {
      if (isTextElement(element)) {
        acc.push(element.text);
      }
      return acc;
    }, [])
    .join(separator);
  return text;
};
