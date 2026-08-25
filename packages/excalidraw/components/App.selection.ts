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

    // track all expanded groups from initial candidates
    const targetGroupIds = new Set<string>();
    for (const element of candidates) {
      const targetGroupId = this.getSelectableGroupId(
        element,
        prevState.editingGroupId,
      );

      if (targetGroupId) {
        targetGroupIds.add(targetGroupId);
      }
    }

    // iterate in order, expanding all possible grouped elements
    const projectedCandidates = targetGroupIds.size
      ? elements.filter(
          (element) =>
            selectedElementIds[element.id] ||
            element.groupIds.some((groupId) => targetGroupIds.has(groupId)),
        )
      : candidates;

    const nextSelectedCandidateIds = new Set<string>();
    const selectedFrameIds = new Set<string>();

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

    if (Object.keys(selectedGroupIds).length) {
      for (const element of elements) {
        const selectedGroupId = element.groupIds.find(
          (groupId) => selectedGroupIds[groupId],
        );

        if (selectedGroupId) {
          normalizedSelectedElementIds[element.id] = true;
          groupMemberCounts.set(
            selectedGroupId,
            (groupMemberCounts.get(selectedGroupId) ?? 0) + 1,
          );
        }
      }

      for (const selectedGroupId of Object.keys(selectedGroupIds)) {
        if (groupMemberCounts.get(selectedGroupId) === 1) {
          selectedGroupIds[selectedGroupId] = false;
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
  };

  // ref in https://github.com/excalidraw/excalidraw/pull/11234#issuecomment-4387654451
  // temp for now as it could live in either selection.ts or groups.ts and could be reused in other areas?
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
