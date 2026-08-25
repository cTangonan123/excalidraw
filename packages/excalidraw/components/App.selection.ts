import {
  isFrameLikeElement,
  selectGroupsForSelectedElements,
} from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../types";
import type App from "./App";

export class AppSelection {
  constructor(private readonly app: App) {}

  handlePointerDown = () => {};

  handlePointerUp = () => {};

  handlePointerMove = () => {};

  public normalizeSelectionState = (
    prevState: AppState,
    selectedElementIds: AppState["selectedElementIds"],
    preferredHitElement?: NonDeletedExcalidrawElement,
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
    // NOTE: extract as a method or function
    const targetGroupIds = new Set<string>();
    for (const element of candidates) {
      if (!element.groupIds.length) {
        continue;
      }

      const editingGroupIndex = prevState.editingGroupId
        ? element.groupIds.indexOf(prevState.editingGroupId)
        : -1;

      // element is immediately selectable
      if (editingGroupIndex === 0) {
        continue;
      }

      const targetGroupId =
        editingGroupIndex > 0
          ? element.groupIds[editingGroupIndex - 1]
          : element.groupIds[element.groupIds.length - 1];
      targetGroupIds.add(targetGroupId);
    }

    // iterate in order, expanding all possible grouped elements
    const projectedCandidates = targetGroupIds.size
      ? elements.filter(
          (element) =>
            selectedElementIds[element.id] ||
            element.groupIds.some((groupId) => targetGroupIds.has(groupId)),
        )
      : candidates;

    let frameConflictId: string | null;
    if (
      preferredHitElement &&
      selectedElementIds[preferredHitElement.id] &&
      preferredHitElement.frameId &&
      selectedElementIds[preferredHitElement.frameId]
    ) {
      frameConflictId = preferredHitElement.frameId;
    } else {
      frameConflictId = null;
    }

    const nextSelectedCandidateIds = new Set<string>();
    const selectedFrameIds = new Set<string>();

    // find all possible frames from the projected candidates
    for (const element of projectedCandidates) {
      nextSelectedCandidateIds.add(element.id);
      if (isFrameLikeElement(element)) {
        selectedFrameIds.add(element.id);
      }
    }

    // remove conflicting frame if it exists
    if (frameConflictId) {
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
        const editingGroupIndex = prevState.editingGroupId
          ? element.groupIds.indexOf(prevState.editingGroupId)
          : -1;

        if (editingGroupIndex === 0) {
          continue;
        }

        const excludedGroupIndex =
          editingGroupIndex > 0
            ? editingGroupIndex - 1
            : element.groupIds.length - 1;
        const excludedGroupId = element.groupIds[excludedGroupIndex];
        if (excludedGroupId) {
          excludedGroupIds.add(excludedGroupId);
        }
      }
    }

    const normalizedSelectedElementIds = projectedCandidates.reduce<
      Record<string, true>
    >((selectedElementIds, element) => {
      if (
        nextSelectedCandidateIds.has(element.id) &&
        !element.groupIds.some((groupId) => excludedGroupIds.has(groupId))
      ) {
        selectedElementIds[element.id] = true;
      }

      return selectedElementIds;
    }, {});

    const nextSelectionState = selectGroupsForSelectedElements(
      {
        editingGroupId: prevState.editingGroupId,
        selectedElementIds: normalizedSelectedElementIds,
      },
      elements,
      prevState,
      this.app,
    );

    return nextSelectionState;
  };
}
