"use client";

import {
  type AddDeviceInput,
  type AddOpeningInput,
  type AddRoomInput,
  type ApplyHomeChangesInput,
  addDevice as addDeviceLocally,
  addOpening as addOpeningLocally,
  addRoom as addRoomLocally,
  applyHomeChanges as applyHomeChangesLocally,
  applyReportedState,
  type BindDeviceInput,
  bindDeviceToEndpoint as bindDeviceLocally,
  createDemoHome,
  type HomeDocument,
  homeDocumentSchema,
  type MoveDeviceInput,
  moveDevice as moveDeviceLocally,
  type RemoveDeviceInput,
  type RemoveFloorInput,
  type RemoveOpeningInput,
  type RemoveRoomInput,
  removeDevice as removeDeviceLocally,
  removeFloor as removeFloorLocally,
  removeOpening as removeOpeningLocally,
  removeRoom as removeRoomLocally,
  type SetDeviceStateInput,
  setDesiredDeviceState,
  type UnbindDeviceInput,
  type UpdateDeviceInput,
  type UpdateFloorDetailsInput,
  type UpdateHomeDetailsInput,
  type UpdateRoomInput,
  unbindDevice as unbindDeviceLocally,
  updateDevice as updateDeviceLocally,
  updateFloorDetails as updateFloorDetailsLocally,
  updateHomeDetails as updateHomeDetailsLocally,
  updateRoomGeometry as updateRoomLocally,
} from "@portego/home-model";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, PortegoApiError } from "../lib/api";

const cacheKey = "portego.cached-home.v1";

type AuthState = {
  loading: boolean;
  authenticated: boolean;
  csrfToken: string | null;
};

type ConnectionMode = "connecting" | "cloud" | "local";

function cacheHome(home: HomeDocument) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(home));
  } catch {
    // The in-memory home remains usable when storage is unavailable.
  }
}

function advancedSnapshot(home: HomeDocument, revision: number): HomeDocument {
  return homeDocumentSchema.parse({
    ...home,
    revision,
    updatedAt: new Date().toISOString(),
  });
}

export function usePortegoHome(auth: AuthState) {
  const [home, setHome] = useState<HomeDocument>(() => createDemoHome());
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [localReady, setLocalReady] = useState(false);
  const [needsHomeImport, setNeedsHomeImport] = useState(false);
  const homeRef = useRef(home);
  const remoteHomeRef = useRef(false);
  const localUndoRef = useRef<HomeDocument[]>([]);
  const localRedoRef = useRef<HomeDocument[]>([]);

  const updateHome = useCallback((next: HomeDocument, persistLocally = true) => {
    homeRef.current = next;
    setHome(next);
    if (persistLocally) cacheHome(next);
    return next;
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) updateHome(homeDocumentSchema.parse(JSON.parse(cached)));
    } catch {
      localStorage.removeItem(cacheKey);
    } finally {
      setLocalReady(true);
    }
  }, [updateHome]);

  useEffect(() => {
    if (auth.loading || !localReady) return;
    if (!auth.authenticated) {
      if (remoteHomeRef.current) {
        try {
          const cached = localStorage.getItem(cacheKey);
          updateHome(
            cached ? homeDocumentSchema.parse(JSON.parse(cached)) : createDemoHome(),
            false,
          );
        } catch {
          updateHome(createDemoHome(), false);
        }
      }
      remoteHomeRef.current = false;
      setNeedsHomeImport(false);
      setConnectionMode("local");
      return;
    }
    let active = true;
    void apiRequest<HomeDocument>("/api/home", { cache: "no-store" })
      .then((next) => {
        if (!active) return;
        remoteHomeRef.current = true;
        setNeedsHomeImport(false);
        setConnectionMode("cloud");
        setHistory({ canUndo: false, canRedo: false });
        updateHome(homeDocumentSchema.parse(next), false);
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError instanceof PortegoApiError && requestError.status === 404) {
          remoteHomeRef.current = false;
          setNeedsHomeImport(true);
          setConnectionMode("local");
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Could not load the home.");
        setConnectionMode("local");
      });
    return () => {
      active = false;
    };
  }, [auth.authenticated, auth.loading, localReady, updateHome]);

  const commit = useCallback(
    async (change: (current: HomeDocument) => HomeDocument) => {
      const before = structuredClone(homeRef.current);
      const proposed = change(before);
      let accepted = proposed;
      if (auth.authenticated && remoteHomeRef.current) {
        try {
          accepted = await apiRequest<HomeDocument>("/api/home", {
            method: "PUT",
            csrfToken: auth.csrfToken,
            body: JSON.stringify({ baseRevision: before.revision, home: proposed }),
          });
          setConnectionMode("cloud");
        } catch (requestError) {
          setError(
            requestError instanceof Error ? requestError.message : "Could not save the home.",
          );
          throw requestError;
        }
      } else {
        setConnectionMode("local");
      }
      localUndoRef.current.push(before);
      localRedoRef.current = [];
      setHistory({ canUndo: true, canRedo: false });
      setError(null);
      return updateHome(
        homeDocumentSchema.parse(accepted),
        !(auth.authenticated && remoteHomeRef.current),
      );
    },
    [auth.authenticated, auth.csrfToken, updateHome],
  );

  const importCurrentHome = useCallback(async () => {
    const next = await apiRequest<HomeDocument>("/api/home/import", {
      method: "POST",
      csrfToken: auth.csrfToken,
      body: JSON.stringify(homeRef.current),
    });
    remoteHomeRef.current = true;
    localStorage.removeItem(cacheKey);
    setNeedsHomeImport(false);
    setConnectionMode("cloud");
    setHistory({ canUndo: false, canRedo: false });
    return updateHome(homeDocumentSchema.parse(next), false);
  }, [auth.csrfToken, updateHome]);

  const startEmptyHome = useCallback(async () => {
    const next = await apiRequest<HomeDocument>("/api/home", {
      method: "POST",
      csrfToken: auth.csrfToken,
    });
    remoteHomeRef.current = true;
    localStorage.removeItem(cacheKey);
    setNeedsHomeImport(false);
    setConnectionMode("cloud");
    setHistory({ canUndo: false, canRedo: false });
    return updateHome(homeDocumentSchema.parse(next), false);
  }, [auth.csrfToken, updateHome]);

  const resolveRoomId = useCallback((input: { roomId?: string; roomLabel?: string }) => {
    return (
      input.roomId ??
      homeRef.current.rooms.find(
        (room) => room.label.toLowerCase() === input.roomLabel?.toLowerCase(),
      )?.id
    );
  }, []);

  const resolveDeviceId = useCallback((input: { deviceId?: string; deviceLabel?: string }) => {
    return (
      input.deviceId ??
      homeRef.current.devices.find(
        (device) => device.label.toLowerCase() === input.deviceLabel?.toLowerCase(),
      )?.id
    );
  }, []);

  const updateHomeDetails = useCallback(
    (input: UpdateHomeDetailsInput) =>
      commit((current) => updateHomeDetailsLocally(current, input)),
    [commit],
  );
  const updateFloorDetails = useCallback(
    (input: UpdateFloorDetailsInput) =>
      commit((current) => updateFloorDetailsLocally(current, input)),
    [commit],
  );
  const removeFloor = useCallback(
    (input: RemoveFloorInput) => commit((current) => removeFloorLocally(current, input)),
    [commit],
  );
  const addRoom = useCallback(
    (input: AddRoomInput) => commit((current) => addRoomLocally(current, input)),
    [commit],
  );
  const addDevice = useCallback(
    (input: AddDeviceInput) => commit((current) => addDeviceLocally(current, input)),
    [commit],
  );
  const updateRoom = useCallback(
    (input: UpdateRoomInput) => {
      const roomId = resolveRoomId(input);
      if (!roomId) throw new Error("Room not found.");
      return commit((current) => updateRoomLocally(current, { ...input, roomId }));
    },
    [commit, resolveRoomId],
  );
  const removeRoom = useCallback(
    (input: RemoveRoomInput) => {
      const roomId = resolveRoomId(input);
      if (!roomId) throw new Error("Room not found.");
      return commit((current) => removeRoomLocally(current, { roomId }));
    },
    [commit, resolveRoomId],
  );
  const moveDevice = useCallback(
    (input: MoveDeviceInput) => {
      const deviceId = resolveDeviceId(input);
      if (!deviceId) throw new Error("Device not found.");
      return commit((current) => moveDeviceLocally(current, { ...input, deviceId }));
    },
    [commit, resolveDeviceId],
  );
  const updateDevice = useCallback(
    (input: UpdateDeviceInput) => {
      const deviceId = resolveDeviceId(input);
      if (!deviceId) throw new Error("Device not found.");
      return commit((current) => updateDeviceLocally(current, { ...input, deviceId }));
    },
    [commit, resolveDeviceId],
  );
  const removeDevice = useCallback(
    (input: RemoveDeviceInput) => {
      const deviceId = resolveDeviceId(input);
      if (!deviceId) throw new Error("Device not found.");
      return commit((current) => removeDeviceLocally(current, { deviceId }));
    },
    [commit, resolveDeviceId],
  );
  const bindDevice = useCallback(
    (input: BindDeviceInput) => commit((current) => bindDeviceLocally(current, input)),
    [commit],
  );
  const unbindDevice = useCallback(
    (input: UnbindDeviceInput) => {
      const deviceId = resolveDeviceId(input);
      if (!deviceId) throw new Error("Device not found.");
      return commit((current) => unbindDeviceLocally(current, { deviceId }));
    },
    [commit, resolveDeviceId],
  );
  const addOpening = useCallback(
    (input: AddOpeningInput) => commit((current) => addOpeningLocally(current, input)),
    [commit],
  );
  const removeOpening = useCallback(
    (input: RemoveOpeningInput) => {
      const openingId =
        input.openingId ??
        homeRef.current.openings.find(
          (opening) => opening.label?.toLowerCase() === input.label?.toLowerCase(),
        )?.id;
      if (!openingId) throw new Error("Opening not found.");
      return commit((current) => removeOpeningLocally(current, { openingId }));
    },
    [commit],
  );
  const applyChanges = useCallback(
    (input: ApplyHomeChangesInput) => commit((current) => applyHomeChangesLocally(current, input)),
    [commit],
  );
  const setDeviceState = useCallback(
    (input: SetDeviceStateInput) =>
      commit((current) => {
        const desired = setDesiredDeviceState(current, input);
        return applyReportedState(desired.home, desired.endpoint.id, desired.requestedState);
      }),
    [commit],
  );

  const undo = useCallback(async () => {
    const previous = localUndoRef.current.pop();
    if (!previous) throw new Error("There is nothing to undo.");
    const current = structuredClone(homeRef.current);
    const next = advancedSnapshot(previous, current.revision + 1);
    let accepted = next;
    if (auth.authenticated && remoteHomeRef.current) {
      accepted = await apiRequest<HomeDocument>("/api/home", {
        method: "PUT",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({ baseRevision: current.revision, home: next }),
      });
    }
    localRedoRef.current.push(current);
    setHistory({ canUndo: localUndoRef.current.length > 0, canRedo: true });
    return updateHome(homeDocumentSchema.parse(accepted), !remoteHomeRef.current);
  }, [auth.authenticated, auth.csrfToken, updateHome]);

  const redo = useCallback(async () => {
    const following = localRedoRef.current.pop();
    if (!following) throw new Error("There is nothing to redo.");
    const current = structuredClone(homeRef.current);
    const next = advancedSnapshot(following, current.revision + 1);
    let accepted = next;
    if (auth.authenticated && remoteHomeRef.current) {
      accepted = await apiRequest<HomeDocument>("/api/home", {
        method: "PUT",
        csrfToken: auth.csrfToken,
        body: JSON.stringify({ baseRevision: current.revision, home: next }),
      });
    }
    localUndoRef.current.push(current);
    setHistory({ canUndo: true, canRedo: localRedoRef.current.length > 0 });
    return updateHome(homeDocumentSchema.parse(accepted), !remoteHomeRef.current);
  }, [auth.authenticated, auth.csrfToken, updateHome]);

  const reset = useCallback(
    () =>
      commit((current) => {
        const empty = createDemoHome(current.name);
        return homeDocumentSchema.parse({
          ...empty,
          id: current.id,
          endpoints: current.endpoints,
          bindings: [],
          gateway: current.gateway,
          revision: current.revision + 1,
        });
      }),
    [commit],
  );

  return {
    home,
    connectionMode,
    error,
    history,
    needsHomeImport,
    getHome: () => homeRef.current,
    importCurrentHome,
    startEmptyHome,
    updateHomeDetails,
    updateFloorDetails,
    removeFloor,
    addRoom,
    addDevice,
    updateRoom,
    removeRoom,
    moveDevice,
    updateDevice,
    removeDevice,
    bindDevice,
    unbindDevice,
    addOpening,
    removeOpening,
    applyChanges,
    undo,
    redo,
    setDeviceState,
    reset,
  };
}
