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

    // track all expandable groups and directly selected frames from initial candidates
    const targetGroupIds = new Set<string>();
    const selectedFrameIds = new Set<string>();

    for (const element of candidates) {
      const targetGroupId = this.getSelectableGroupId(
        element,
        prevState.editingGroupId,
      );

      if (targetGroupId) {
        targetGroupIds.add(targetGroupId);
      }

      if (isFrameLikeElement(element)) {
        selectedFrameIds.add(element.id);
      }
    }

    const hasFrameChildConflict = candidates.some(
      (element) => element.frameId && selectedFrameIds.has(element.frameId),
    );

    // if neither groups nor frames have been selected we can assume
    // that group projection or frame conflict resolution is needed.
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
          selectedElementIds[element.id] ||
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

    for (const frameConflictId of frameConflictIds) {
      nextSelectedCandidateIds.delete(frameConflictId);
      selectedFrameIds.delete(frameConflictId);
    }

    const excludedGroupIds = new Set<string>();

    // filter frame child collision and possible excluded groups
    for (const element of projectedCandidates) {
      if (element.frameId && selectedFrameIds.has(element.frameId)) {
        nextSelectedCandidateIds.delete(element.id);
      }
      if (!nextSelectedCandidateIds.has(element.id)) {
        const excludedGroupId = this.getSelectableGroupId(
          element,
          prevState.editingGroupId,
        );

        if (excludedGroupId) {
          excludedGroupIds.add(excludedGroupId);
        }
      }
    }

    const normalizedSelectedElementIds: Record<string, true> = {};
    const selectedGroupIds: AppState["selectedGroupIds"] = {};

    // of the possible elements, check to ensure they aren't members
    // of the excluded groups, and compile selectedGroupIds
    for (const element of projectedCandidates) {
      if (
        nextSelectedCandidateIds.has(element.id) &&
        !element.groupIds.some((groupId) => excludedGroupIds.has(groupId))
      ) {
        normalizedSelectedElementIds[element.id] = true;

        const selectedGroupId = this.getSelectableGroupId(
          element,
          prevState.editingGroupId,
        );

        if (selectedGroupId) {
          selectedGroupIds[selectedGroupId] = true;
        }
      }
    }

    // expand groups that remain selected, post frame/group handling
    // to ensure member count of any selectedGroupId is > 1
    // carry over from selectGroupsForSelectedElements.
    const groupMemberCounts = new Map<string, number>();

    for (const selectedGroupId of Object.keys(selectedGroupIds)) {
      const elementIds = groups.get(selectedGroupId) ?? [];

      for (const elementId of elementIds) {
        const element = elementsMap.get(elementId);
        const firstSelectedGroupId = element?.groupIds.find(
          (groupId) => selectedGroupIds[groupId],
        );

        if (element && firstSelectedGroupId === selectedGroupId) {
          normalizedSelectedElementIds[element.id] = true;
          groupMemberCounts.set(
            selectedGroupId,
            (groupMemberCounts.get(selectedGroupId) ?? 0) + 1,
          );
        }
      }
    }

    for (const selectedGroupId of Object.keys(selectedGroupIds)) {
      if (groupMemberCounts.get(selectedGroupId) === 1) {
        selectedGroupIds[selectedGroupId] = false;
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
  };

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
