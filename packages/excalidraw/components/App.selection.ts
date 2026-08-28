import {
  isFrameLikeElement,
  makeNextSelectedElementIds,
} from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../types";
import type App from "./App";

export class AppSelection {
  constructor(private readonly app: App) {}

  handlePointerDown = () => {};

  handlePointerUp = () => {};

  handlePointerMove = () => {};

  // handles group/frame collision detection and filtering throughout
  // pointerDown/Move/Up lifecycle.
  // when direct hit elements are preferred, like children of
  // previously selected frames, use preferredHitElements.
  public normalizeSelectionState = (
    prevState: AppState,
    selectedElementIds: AppState["selectedElementIds"],
    preferredHitElements: readonly NonDeletedExcalidrawElement[] = [],
  ) => {
    const elements = this.app.scene.getNonDeletedElements();
    const elementsMap = this.app.scene.getNonDeletedElementsMap();
    const candidates = Object.keys(selectedElementIds).reduce(
      (candidateElements: NonDeletedExcalidrawElement[], elementId) => {
        const element = elementsMap.get(elementId);
        if (element) {
          candidateElements.push(element);
        }
        return candidateElements;
      },
      [],
    );

    // early return if no candidates
    if (!candidates.length) {
      return {
        editingGroupId: null,
        selectedGroupIds: {},
        selectedElementIds: makeNextSelectedElementIds({}, prevState),
      };
    }

    // Track possible groupIds standalone elements and directly selected frames.
    const targetGroupIds = new Set<string>();
    const standaloneCandidateIds = new Set<string>();
    const selectedFrameIds = new Set<string>();

    for (const element of candidates) {
      const targetGroupId = this.getSelectableGroupId(
        element,
        prevState.editingGroupId,
      );

      if (targetGroupId) {
        targetGroupIds.add(targetGroupId);
      } else {
        standaloneCandidateIds.add(element.id);
      }

      if (isFrameLikeElement(element)) {
        selectedFrameIds.add(element.id);
      }
    }

    const hasFrameChildConflict = candidates.some(
      (element) => element.frameId && selectedFrameIds.has(element.frameId),
    );

    // if neither groups nor frames have been selected we can assume
    // that group projection or frame conflict resolution is not needed.
    if (
      !targetGroupIds.size &&
      !hasFrameChildConflict &&
      candidates.length === Object.keys(selectedElementIds).length
    ) {
      const nextSelectedElementIds = makeNextSelectedElementIds(
        selectedElementIds,
        prevState,
      );

      return {
        editingGroupId: prevState.editingGroupId,
        selectedGroupIds: {},
        selectedElementIds: nextSelectedElementIds,
      };
    }

    // array of all possible elements after group expansion
    const projectedCandidates: NonDeletedExcalidrawElement[] = [];
    const groups = new Map<string, string[]>();

    if (targetGroupIds.size) {
      for (const element of elements) {
        for (const groupId of element.groupIds) {
          const elementIds = groups.get(groupId);

          if (elementIds) {
            elementIds.push(element.id);
          } else {
            groups.set(groupId, [element.id]);
          }
        }

        if (
          standaloneCandidateIds.has(element.id) ||
          element.groupIds.some((groupId) => targetGroupIds.has(groupId))
        ) {
          projectedCandidates.push(element);
        }
      }
    } else {
      projectedCandidates.push(...candidates);
    }

    const nextSelectedCandidateIds = new Set<string>();

    // find all possible frames from the projected candidates
    for (const element of projectedCandidates) {
      nextSelectedCandidateIds.add(element.id);
      if (isFrameLikeElement(element)) {
        selectedFrameIds.add(element.id);
      }
    }

    const hasProjectedFrameChildConflict = projectedCandidates.some(
      (element) => element.frameId && selectedFrameIds.has(element.frameId),
    );

    // at this point if frame conflicts don't exist we can skip straight to group selection
    if (!hasProjectedFrameChildConflict) {
      return this.finalizeGroupSelection(
        prevState,
        nextSelectedCandidateIds,
        standaloneCandidateIds,
        targetGroupIds,
        groups,
      );
    }

    const preferredHitElementIds = new Set(
      preferredHitElements.map((element) => element.id),
    );
    const frameConflictIds = new Set<string>();

    for (const element of preferredHitElements) {
      if (
        nextSelectedCandidateIds.has(element.id) &&
        element.frameId &&
        selectedFrameIds.has(element.frameId) &&
        !preferredHitElementIds.has(element.frameId)
      ) {
        frameConflictIds.add(element.frameId);
      }
    }

    // remove violating frames from selection
    for (const frameConflictId of frameConflictIds) {
      nextSelectedCandidateIds.delete(frameConflictId);
      selectedFrameIds.delete(frameConflictId);
    }

    // filter frame child collisions. Group atomicity is handled during
    // finalization using the groups chosen from the original candidates.
    for (const element of projectedCandidates) {
      if (element.frameId && selectedFrameIds.has(element.frameId)) {
        nextSelectedCandidateIds.delete(element.id);
      }
    }

    return this.finalizeGroupSelection(
      prevState,
      nextSelectedCandidateIds,
      standaloneCandidateIds,
      targetGroupIds,
      groups,
    );
  };

  private finalizeGroupSelection(
    prevState: AppState,
    selectableElementIds: ReadonlySet<string>,
    standaloneCandidateIds: ReadonlySet<string>,
    targetGroupIds: ReadonlySet<string>,
    groups: ReadonlyMap<string, readonly string[]>,
  ) {
    const normalizedSelectedElementIds: Record<string, true> = {};
    const selectedGroupIds: AppState["selectedGroupIds"] = {};

    for (const elementId of standaloneCandidateIds) {
      if (selectableElementIds.has(elementId)) {
        normalizedSelectedElementIds[elementId] = true;
      }
    }

    for (const groupId of targetGroupIds) {
      const memberIds = groups.get(groupId);

      // A chosen group remains atomic only if every exhaustively indexed member
      // survived frame collision filtering.
      if (
        memberIds &&
        memberIds.every((elementId) => selectableElementIds.has(elementId))
      ) {
        selectedGroupIds[groupId] = memberIds.length > 1;
        for (const elementId of memberIds) {
          normalizedSelectedElementIds[elementId] = true;
        }
      }
    }

    const nextSelectedElementIds = makeNextSelectedElementIds(
      normalizedSelectedElementIds,
      prevState,
    );

    return {
      editingGroupId: Object.keys(nextSelectedElementIds).length
        ? prevState.editingGroupId
        : null,
      selectedGroupIds,
      selectedElementIds: nextSelectedElementIds,
    };
  }

  // ref in https://github.com/excalidraw/excalidraw/pull/11234#issuecomment-4387654451
  // could live in either selection.ts or groups.ts and could be reused in other areas?
  private getSelectableGroupId(
    element: NonDeletedExcalidrawElement,
    editingGroupId: AppState["editingGroupId"],
  ): string | null {
    if (!element.groupIds.length) {
      return null;
    }

    const editingGroupIndex = editingGroupId
      ? element.groupIds.indexOf(editingGroupId)
      : -1;

    // element is directly selectable inside the editing group
    if (editingGroupIndex === 0) {
      return null;
    }

    return editingGroupIndex > 0
      ? element.groupIds[editingGroupIndex - 1]
      : element.groupIds[element.groupIds.length - 1];
  }
}
