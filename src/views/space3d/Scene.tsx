/**
 * SPEC 9 Phase 2 - the 3D space, rendering the SAME store the 2D board renders
 * (SPEC 2.1). Focus, selection, filter and search all carry across the switch
 * because they live in the shared ui store, not in either view.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { FogExp2, Vector3 } from 'three';
import { AgentSphere } from './AgentSphere.js';
import { Wire3d } from './Wire3d.js';
import { Ground } from './Ground.js';
import { Satellites } from './Satellites.js';
import { Burst3d } from './Burst3d.js';
import { CameraRig } from './CameraRig.js';
import { PostEffects, shouldUsePostEffects } from './effects/PostEffects.js';
import type { CameraGoal } from './CameraRig.js';
import { boundingSphere, fitDistance, layoutInstances3d } from '../../layout/layout3d.js';
import type { Point3 } from '../../layout/layout3d.js';
import { layoutInstances } from '../../layout/treeLayout.js';
import { buildFleetIndex, instances as deriveInstances, parentIdsOf } from '../../model/selectors.js';
import { deriveWires } from '../../model/wires.js';
import { computeVisibility } from '../../model/visibility.js';
import { selectActiveFleet, useFleetStore } from '../../store/fleetStore.js';
import { useUiStore } from '../../store/uiStore.js';
import { CAMERA_3D, CAMERA_FOV_3D, FOCUS_CAMERA_3D, MORPH_MS, MORPH_PLANE_Y, MORPH_SPAN } from '../../ui/constants.js';
import { usePrefersReducedMotion } from '../../ui/usePrefersReducedMotion.js';
import { useContextLoss } from './useContextLoss.js';
import { detectWebgl } from './webgl.js';

function Fleet3d(): React.JSX.Element | null {
  const aspect = useThree((state) => state.size.width / Math.max(state.size.height, 1));
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
  const morphRef = useRef(useUiStore.getState().view === '2d' ? 1 : 0);
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

    // SPEC 8.2: where each node lands once the fleet has flattened onto the board.
    const board = layoutInstances(instanceList);
    const scale = MORPH_SPAN / Math.max(board.width, 1);
    const flat = new Map<string, Point3>();
    for (const [key, point] of board.positions) {
      flat.set(key, {
        x: (point.x - board.width / 2) * scale,
        y: MORPH_PLANE_Y,
        z: (point.y - board.height / 2) * scale,
      });
    }
    const visibility = computeVisibility(
      fleet,
      instanceList,
      wireList,
      focusId,
      statusFilter,
    );
    const agentsById = new Map(fleet.agents.map((a) => [a.id, a]));
    return { index, instanceList, wireList, layout, flat, visibility, agentsById };
  }, [fleet, focusId, statusFilter]);

  // SPEC 5.2: focusing frames the subtree; leaving focus returns to the full fleet.
  // Both are the same operation - frame a bounding sphere - so both are solved from
  // the lens. The full-fleet case used to jump to a fixed pose that never measured
  // the fleet, which cropped it as soon as the fleet outgrew the demo data.
  useEffect(() => {
    if (!model) return;

    const keys = focusId === null ? model.layout.positions.keys() : model.visibility.litInstanceKeys;
    const sphere = boundingSphere(keys, model.layout.positions);
    if (!sphere) {
      goalRef.current.target.set(...CAMERA_3D.target);
      goalRef.current.radius = CAMERA_3D.radius;
      return;
    }

    goalRef.current.target.set(sphere.centre.x, sphere.centre.y, sphere.centre.z);
    goalRef.current.radius = Math.min(
      FOCUS_CAMERA_3D.max,
      Math.max(
        FOCUS_CAMERA_3D.min,
        fitDistance(sphere.radius, CAMERA_FOV_3D, FOCUS_CAMERA_3D.margin, aspect),
      ),
    );
  }, [focusId, model, aspect]);

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
        morphRef={morphRef}
      />
      <MorphDriver morphRef={morphRef} />
      {/* SPEC 8.9 */}
      <PostEffects enabled={shouldUsePostEffects(reducedMotion)} />

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
              flatPosition={model.flat.get(instance.key) ?? position}
              morphRef={morphRef}
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
            morphRef={morphRef}
          />
        );
      })}
    </>
  );
}

/**
 * Drives SPEC 8.2 morph progress: 0 is the full radial 3D scene, 1 is the fleet
 * flattened onto the 2D layout with the camera overhead.
 */
function MorphDriver({ morphRef }: { morphRef: { current: number } }): null {
  const morph = useUiStore((s) => s.morph);
  const view = useUiStore((s) => s.view);

  useFrame(() => {
    if (morph === null) {
      morphRef.current = view === '2d' ? 1 : 0;
      return;
    }
    const t = Math.min(1, Math.max(0, (performance.now() - morph.at) / MORPH_MS));
    // Ease in and out so the flight starts and lands gently.
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    morphRef.current = morph.to === '2d' ? eased : 1 - eased;
  });

  return null;
}

/** Reports a lost WebGL context up to the DOM overlay (it can only be read inside the Canvas). */
function ContextLossWatch({ onChange }: { onChange: (lost: boolean) => void }): null {
  const lost = useContextLoss();
  useEffect(() => onChange(lost), [lost, onChange]);
  return null;
}

/** Stable per-instance phase so In-progress halos do not pulse in lockstep. */
function hashPhase(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 62831;
  return hash / 10000;
}

export function Scene(): React.JSX.Element {
  const fog = useMemo(() => new FogExp2(0x05060f, 0.0011), []);
  const [contextLost, setContextLost] = useState(false);
  // Asked once, before the canvas exists: a context that cannot be created throws
  // asynchronously and would otherwise hang the Suspense fallback for ever.
  const [webgl] = useState(detectWebgl);

  if (webgl === 'unavailable') {
    return (
      <div className="scene3d" data-testid="scene3d">
        <div className="webgl-missing" role="status" data-testid="webgl-unavailable">
          <h2>The 3D view needs hardware acceleration</h2>
          <p>
            This browser could not create a WebGL context, so the 3D space cannot be drawn. The
            2D board has the same fleet and every feature — nothing is missing from it.
          </p>
          <p>The usual causes, in the order worth checking:</p>
          <ul>
            <li>
              Hardware acceleration is switched off. In Chrome or Edge open
              <b> Settings → System</b> and turn on <b>&ldquo;Use graphics acceleration when
              available&rdquo;</b>, then restart the browser.
            </li>
            <li>A remote desktop or virtual session, which often has no GPU to offer.</li>
            <li>A graphics driver that has just crashed — a restart usually clears it.</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="scene3d" data-testid="scene3d">
      <Canvas
        camera={{ fov: CAMERA_FOV_3D, near: 0.1, far: 4000, position: [0, 120, 300] }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        onCreated={({ scene, gl }) => {
          scene.fog = fog;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <Fleet3d />
        <ContextLossWatch onChange={setContextLost} />
      </Canvas>

      {contextLost && (
        <div className="context-lost" role="status" data-testid="context-lost">
          The 3D view lost its graphics context - usually a graphics driver switching or the
          machine waking from sleep. It will come back on its own in a moment; the 2D board still
          works in the meantime.
        </div>
      )}
    </div>
  );
}
