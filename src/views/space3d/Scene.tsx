/**
 * SPEC 9 Phase 2 - the 3D space, rendering the SAME store the 2D board renders
 * (SPEC 2.1). Focus, selection, filter and search all carry across the switch
 * because they live in the shared ui store, not in either view.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { FogExp2, Vector3 } from 'three';
import { AgentSphere } from './AgentSphere.js';
import { Wire3d } from './Wire3d.js';
import { Ground } from './Ground.js';
import { Satellites } from './Satellites.js';
import { Burst3d } from './Burst3d.js';
import { CameraRig } from './CameraRig.js';
import type { CameraGoal } from './CameraRig.js';
import { boundingSphere, layoutInstances3d } from '../../layout/layout3d.js';
import { buildFleetIndex, instances as deriveInstances, parentIdsOf } from '../../model/selectors.js';
import { deriveWires } from '../../model/wires.js';
import { computeVisibility } from '../../model/visibility.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { CAMERA_3D, FOCUS_CAMERA_3D } from '../../ui/constants.js';
import { usePrefersReducedMotion } from '../../ui/usePrefersReducedMotion.js';

function Fleet3d(): React.JSX.Element | null {
  const fleet = useFleetStore(selectActiveFleet);
  const focusId = useUiStore((s) => s.focusId);
  const selectedId = useUiStore((s) => s.selectedId);
  const statusFilter = useUiStore((s) => s.statusFilter);
  const showDetails = useUiStore((s) => s.showDetails);
  const activate = useUiStore((s) => s.activate);
  const clearFocus = useUiStore((s) => s.clearFocus);
  const reducedMotion = usePrefersReducedMotion();

  const cameraRadiusRef = useRef(CAMERA_3D.radius);
  const goalRef = useRef<CameraGoal>({
    target: new Vector3(...CAMERA_3D.target),
    radius: CAMERA_3D.radius,
  });
  const lastInput = useRef(0);
  const onPointerActivity = useCallback(() => {
    lastInput.current = performance.now();
  }, []);

  const model = useMemo(() => {
    if (!fleet) return null;
    const index = buildFleetIndex(fleet);
    const instanceList = deriveInstances(fleet, index);
    const wireList = deriveWires(fleet, instanceList);
    const layout = layoutInstances3d(instanceList);
    const visibility = computeVisibility(fleet, instanceList, wireList, focusId, statusFilter);
    const agentsById = new Map(fleet.agents.map((a) => [a.id, a]));
    return { index, instanceList, wireList, layout, visibility, agentsById };
  }, [fleet, focusId, statusFilter]);

  // SPEC 5.2: focusing frames the subtree; leaving focus returns to the full fleet.
  useEffect(() => {
    if (!model) return;
    if (focusId === null) {
      goalRef.current.target.set(...CAMERA_3D.target);
      goalRef.current.radius = CAMERA_3D.radius;
      return;
    }
    const sphere = boundingSphere(model.visibility.litInstanceKeys, model.layout.positions);
    if (!sphere) return;
    goalRef.current.target.set(sphere.centre.x, sphere.centre.y, sphere.centre.z);
    goalRef.current.radius = Math.min(
      FOCUS_CAMERA_3D.max,
      Math.max(FOCUS_CAMERA_3D.min, sphere.radius * FOCUS_CAMERA_3D.factor + FOCUS_CAMERA_3D.offset),
    );
  }, [focusId, model]);

  if (!fleet || !model) return null;

  const rootKey = model.instanceList.find((i) => i.parentKey === null)?.key;
  const rootPosition = rootKey === undefined ? undefined : model.layout.positions.get(rootKey);

  return (
    <>
      <CameraRig
        goalRef={goalRef}
        onPointerActivity={onPointerActivity}
        reducedMotion={reducedMotion}
        radiusRef={cameraRadiusRef}
      />

      <ambientLight color={0x1c2440} intensity={0.9} />
      <hemisphereLight color={0x4a5a9a} groundColor={0x0a0d1c} intensity={0.85} />
      <directionalLight color={0xbcccff} intensity={0.95} position={[1.4, 2, 1.2]} />

      <Ground />

      {/*
        The wireframe shell that marks the orchestrator in the prototype.
        DEVIATION: the prototype spins it continuously. SPEC 2.5 bans ambient
        motion that carries no meaning, so it is rendered static.
      */}
      {rootPosition && (
        <mesh position={[rootPosition.x, rootPosition.y, rootPosition.z]}>
          <icosahedronGeometry args={[19, 1]} />
          <meshBasicMaterial color={0x8b5cf6} wireframe transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}

      {/* Clicking empty space leaves focus, exactly as in 2D (SPEC 5.2). */}
      <mesh
        position={[0, 0, 0]}
        onClick={() => {
          if (useUiStore.getState().focusId !== null) clearFocus();
        }}
      >
        <sphereGeometry args={[1400, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} side={2} depthWrite={false} />
      </mesh>

      {model.instanceList.map((instance) => {
        const agent = model.agentsById.get(instance.agentId);
        const position = model.layout.positions.get(instance.key);
        if (!agent || !position) return null;
        return (
          <group key={instance.key}>
            <AgentSphere
              agent={agent}
              instanceKey={instance.key}
              depth={instance.depth}
              position={position}
              sharedCount={parentIdsOf(fleet, instance.agentId, model.index).length}
              lit={model.visibility.litInstanceKeys.has(instance.key)}
              selected={selectedId === instance.agentId}
              cameraRadiusRef={cameraRadiusRef}
              phase={hashPhase(instance.key)}
              onActivate={activate}
              reducedMotion={reducedMotion}
            />
            {showDetails && (
              <Satellites
                fleet={fleet}
                agent={agent}
                position={position}
                cameraRadiusRef={cameraRadiusRef}
                lit={model.visibility.litInstanceKeys.has(instance.key)}
              />
            )}
            {selectedId === instance.agentId && (
              <Burst3d position={position} kind={agent.kind} reducedMotion={reducedMotion} />
            )}
          </group>
        );
      })}

      {model.wireList.map((wire) => {
        const from = model.layout.positions.get(wire.fromKey);
        const to = model.layout.positions.get(wire.toKey);
        if (!from || !to) return null;
        return (
          <Wire3d
            key={wire.id}
            wire={wire}
            from={from}
            to={to}
            lit={model.visibility.litWireIds.has(wire.id)}
            focused={model.visibility.focusedWireIds.has(wire.id)}
          />
        );
      })}
    </>
  );
}

/** Stable per-instance phase so In-progress halos do not pulse in lockstep. */
function hashPhase(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 62831;
  return hash / 10000;
}

export function Scene(): React.JSX.Element {
  const fog = useMemo(() => new FogExp2(0x05060f, 0.0011), []);

  return (
    <div className="scene3d" data-testid="scene3d">
      <Canvas
        camera={{ fov: 55, near: 0.1, far: 4000, position: [0, 120, 300] }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        onCreated={({ scene, gl }) => {
          scene.fog = fog;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Fleet3d />
      </Canvas>
    </div>
  );
}
