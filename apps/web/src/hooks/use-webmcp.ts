"use client";

import { useEffect, useRef, useState } from "react";
import { registerPortegoTools, type WebMcpActions, type WebMcpStatus } from "../lib/webmcp";

export function useWebMcp(
  actions: WebMcpActions,
  onActivity: (message: string) => void,
): WebMcpStatus {
  const [status, setStatus] = useState<WebMcpStatus>("registering");
  const actionsRef = useRef(actions);
  const activityRef = useRef(onActivity);
  actionsRef.current = actions;
  activityRef.current = onActivity;

  useEffect(() => {
    let disposed = false;
    let unregister: () => void = () => undefined;
    const lifecycleController = new AbortController();

    void registerPortegoTools(
      document.modelContext,
      {
        getHome: () => actionsRef.current.getHome(),
        updateHomeDetails: (input) => actionsRef.current.updateHomeDetails(input),
        updateFloorDetails: (input) => actionsRef.current.updateFloorDetails(input),
        removeFloor: (input) => actionsRef.current.removeFloor(input),
        addRoom: (input) => actionsRef.current.addRoom(input),
        updateRoom: (input) => actionsRef.current.updateRoom(input),
        removeRoom: (input) => actionsRef.current.removeRoom(input),
        addFixture: (input) => actionsRef.current.addFixture(input),
        moveFixture: (input) => actionsRef.current.moveFixture(input),
        updateFixture: (input) => actionsRef.current.updateFixture(input),
        removeFixture: (input) => actionsRef.current.removeFixture(input),
        bindFixture: (input) => actionsRef.current.bindFixture(input),
        unbindFixture: (input) => actionsRef.current.unbindFixture(input),
        addOpening: (input) => actionsRef.current.addOpening(input),
        removeOpening: (input) => actionsRef.current.removeOpening(input),
        applyChanges: (input) => actionsRef.current.applyChanges(input),
        undo: () => actionsRef.current.undo(),
        redo: () => actionsRef.current.redo(),
        setFixtureState: (input) => actionsRef.current.setFixtureState(input),
        reset: () => actionsRef.current.reset(),
      },
      (message) => activityRef.current(message),
      lifecycleController.signal,
    ).then((result) => {
      unregister = result.unregister;
      if (!disposed) {
        setStatus(result.status);
      } else {
        unregister();
      }
    });

    return () => {
      disposed = true;
      lifecycleController.abort();
      unregister();
    };
  }, []);

  return status;
}
