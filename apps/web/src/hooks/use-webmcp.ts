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
        addRoom: (input) => actionsRef.current.addRoom(input),
        addFixture: (input) => actionsRef.current.addFixture(input),
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
