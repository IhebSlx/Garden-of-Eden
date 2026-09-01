/**
 * Shared geometry, so a 120-agent fleet allocates three sphere geometries instead
 * of 120. Node kinds only ever come in three sizes (SPEC 6), and every sprite is a
 * unit quad, so there is nothing per-node to vary.
 */
import { SphereGeometry } from 'three';

const spheres = new Map<number, SphereGeometry>();

export function sphereGeometryFor(radius: number): SphereGeometry {
  const cached = spheres.get(radius);
  if (cached) return cached;
  const geometry = new SphereGeometry(radius, 32, 32);
  spheres.set(radius, geometry);
  return geometry;
}
