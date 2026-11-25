import { Vector3, type Camera } from 'three';

export interface ScreenPoint {
	x: number;
	y: number;
	visible: boolean;
}

const scratch = new Vector3();

/**
 * A world point → CSS pixels in a width × height viewport. Not visible when
 * it is behind the camera, beyond its far plane, or outside the viewport
 * (with a margin, so a badge slides off the edge instead of popping).
 */
export function projectToScreen(
	point: Vector3,
	camera: Camera,
	width: number,
	height: number,
	margin = 0
): ScreenPoint {
	scratch.copy(point).project(camera);
	const x = (scratch.x * 0.5 + 0.5) * width;
	const y = (-scratch.y * 0.5 + 0.5) * height;
	// z outside -1..1: behind the camera (or past far)
	const inDepth = scratch.z >= -1 && scratch.z <= 1;
	const inView = x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
	return { x, y, visible: inDepth && inView };
}
