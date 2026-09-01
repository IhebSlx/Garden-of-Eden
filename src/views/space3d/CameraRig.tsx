/**
 * SPEC 5.4 3D navigation: orbit (drag), pan (right-drag / Shift-drag / two fingers),
 * zoom (wheel / pinch), inertia glide, near-full vertical orbit, wide zoom range,
 * and auto-rotate only after 6 s of idle - suppressed under reduced motion.
 *
 * Implemented directly rather than with OrbitControls so the prototype's tuned
 * feel (0.92 inertia decay, ±8% wheel step, 0.06 camera easing) is exact.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import {
  AUTO_ROTATE_IDLE_MS,
  AUTO_ROTATE_SPEED,
  CAMERA_3D,
  ORBIT_INERTIA_DECAY,
} from '../../ui/constants.js';

export type CameraGoal = {
  target: Vector3;
  radius: number;
};

type Props = {
  /** Set by the focus effect; the rig eases towards it every frame. */
  goalRef: { current: CameraGoal };
  onPointerActivity: () => void;
  reducedMotion: boolean;
  /** Written every frame so distance-based fades can read the live camera radius. */
  radiusRef: { current: number };
};

export function CameraRig({ goalRef, onPointerActivity, reducedMotion, radiusRef }: Props): null {
  const { camera, gl } = useThree();

  const state = useRef<{
    theta: number;
    phi: number;
    radius: number;
    target: Vector3;
    velocityTheta: number;
    velocityPhi: number;
    lastInput: number;
  }>({
    theta: CAMERA_3D.theta,
    phi: CAMERA_3D.phi,
    radius: CAMERA_3D.radius,
    target: new Vector3(...CAMERA_3D.target),
    velocityTheta: 0,
    velocityPhi: 0,
    lastInput: 0,
  });

  const pointers = useRef(new Map<number, { x: number; y: number; button: number }>());
  const pinchDistance = useRef(0);

  useEffect(() => {
    const element = gl.domElement;

    const pan = (dx: number, dy: number): void => {
      const scale = state.current.radius * CAMERA_3D.panFactor;
      const right = new Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new Vector3().setFromMatrixColumn(camera.matrix, 1);
      const offset = right.multiplyScalar(-dx * scale).add(up.multiplyScalar(dy * scale));
      state.current.target.add(offset);
      goalRef.current.target.add(offset);
    };

    const onContextMenu = (event: Event): void => event.preventDefault();

    const onPointerDown = (event: PointerEvent): void => {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
      if (pointers.current.size === 1) {
        state.current.velocityTheta = 0;
        state.current.velocityPhi = 0;
      }
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        if (a && b) pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
      }
      element.setPointerCapture(event.pointerId);
      onPointerActivity();
    };

    const onPointerMove = (event: PointerEvent): void => {
      const pointer = pointers.current.get(event.pointerId);
      if (!pointer) return;

      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      state.current.lastInput = performance.now();

      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        if (a && b) {
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > 0 && pinchDistance.current > 0) {
            goalRef.current.radius = clampRadius(
              (goalRef.current.radius * pinchDistance.current) / distance,
            );
            pinchDistance.current = distance;
          }
        }
        pan(dx * 0.5, dy * 0.5);
        return;
      }

      // Right-drag or Shift-drag pans; a plain drag orbits.
      if (pointer.button === 2 || event.shiftKey) {
        pan(dx, dy);
        return;
      }

      state.current.velocityTheta = -dx * CAMERA_3D.orbitX;
      state.current.velocityPhi = -dy * CAMERA_3D.orbitY;
      state.current.theta += state.current.velocityTheta;
      state.current.phi = clampPhi(state.current.phi + state.current.velocityPhi);
    };

    const endPointer = (event: PointerEvent): void => {
      pointers.current.delete(event.pointerId);
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      goalRef.current.radius = clampRadius(
        goalRef.current.radius * (1 + Math.sign(event.deltaY) * CAMERA_3D.wheelStep),
      );
      state.current.lastInput = performance.now();
    };

    element.addEventListener('contextmenu', onContextMenu);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', endPointer);
    element.addEventListener('pointercancel', endPointer);
    element.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      element.removeEventListener('contextmenu', onContextMenu);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', endPointer);
      element.removeEventListener('pointercancel', endPointer);
      element.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl, goalRef, onPointerActivity]);

  useFrame(() => {
    const rig = state.current;

    if (pointers.current.size === 0) {
      // Inertia glide (SPEC 6: 0.92 decay per frame).
      if (rig.velocityTheta !== 0) {
        rig.theta += rig.velocityTheta;
        rig.velocityTheta *= ORBIT_INERTIA_DECAY;
        if (Math.abs(rig.velocityTheta) < 1e-5) rig.velocityTheta = 0;
      }
      if (rig.velocityPhi !== 0) {
        rig.phi = clampPhi(rig.phi + rig.velocityPhi);
        rig.velocityPhi *= ORBIT_INERTIA_DECAY;
        if (Math.abs(rig.velocityPhi) < 1e-5) rig.velocityPhi = 0;
      }
      // SPEC 5.4: auto-rotate only after 6 s idle, and never under reduced motion.
      if (!reducedMotion && performance.now() - rig.lastInput > AUTO_ROTATE_IDLE_MS) {
        rig.theta += AUTO_ROTATE_SPEED;
      }
    }

    rig.radius += (goalRef.current.radius - rig.radius) * CAMERA_3D.ease;
    radiusRef.current = rig.radius;
    rig.target.lerp(goalRef.current.target, CAMERA_3D.ease);

    camera.position.set(
      rig.target.x + rig.radius * Math.sin(rig.phi) * Math.sin(rig.theta),
      rig.target.y + rig.radius * Math.cos(rig.phi),
      rig.target.z + rig.radius * Math.sin(rig.phi) * Math.cos(rig.theta),
    );
    camera.lookAt(rig.target);
  });

  return null;
}

function clampPhi(phi: number): number {
  return Math.min(CAMERA_3D.phiMax, Math.max(CAMERA_3D.phiMin, phi));
}

function clampRadius(radius: number): number {
  return Math.min(CAMERA_3D.radiusMax, Math.max(CAMERA_3D.radiusMin, radius));
}
