import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { projectToScreen } from './projection';

function camera() {
	const cam = new PerspectiveCamera(60, 2, 0.1, 100);
	cam.position.set(0, 0, 10);
	cam.lookAt(0, 0, 0);
	cam.updateMatrixWorld();
	return cam;
}

describe('3D → 2D', () => {
	it('puts the look-at point in the middle', () => {
		const point = projectToScreen(new Vector3(0, 0, 0), camera(), 800, 400);
		expect(point.visible).toBe(true);
		expect(point.x).toBeCloseTo(400);
		expect(point.y).toBeCloseTo(200);
	});

	it('hides a point behind the camera', () => {
		expect(projectToScreen(new Vector3(0, 0, 20), camera(), 800, 400).visible).toBe(false);
	});

	it('hides a point off-screen, and allows the margin', () => {
		const cam = camera();
		expect(projectToScreen(new Vector3(40, 0, 0), cam, 800, 400).visible).toBe(false);
		const edge = projectToScreen(new Vector3(0, 5.9, 0), cam, 800, 400);
		expect(edge.visible).toBe(false);
		expect(projectToScreen(new Vector3(0, 5.9, 0), cam, 800, 400, 200).visible).toBe(true);
	});

	it('hides a point beyond the far plane', () => {
		expect(projectToScreen(new Vector3(0, 0, -200), camera(), 800, 400).visible).toBe(false);
	});
});
