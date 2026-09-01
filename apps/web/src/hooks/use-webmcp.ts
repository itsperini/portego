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
        addDevice: (input) => actionsRef.current.addDevice(input),
        moveDevice: (input) => actionsRef.current.moveDevice(input),
        updateDevice: (input) => actionsRef.current.updateDevice(input),
        removeDevice: (input) => actionsRef.current.removeDevice(input),
        bindDevice: (input) => actionsRef.current.bindDevice(input),
        unbindDevice: (input) => actionsRef.current.unbindDevice(input),
        addOpening: (input) => actionsRef.current.addOpening(input),
        removeOpening: (input) => actionsRef.current.removeOpening(input),
        applyChanges: (input) => actionsRef.current.applyChanges(input),
        undo: () => actionsRef.current.undo(),
        redo: () => actionsRef.current.redo(),
        setDeviceState: (input) => actionsRef.current.setDeviceState(input),
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
