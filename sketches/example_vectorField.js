/* vector_field.js
   Draws and animates a swirling vector field for use with the main.js viewer.
   Author: ChatGPT – June 2025
*/
import * as THREE from 'three';

// ---------- configuration ---------------------------------------------------
const GRID_SIZE   = 8;   // half-width of the square grid (world units)
const STEP        = 2;   // distance between sample points
const BASE_LEN    = 1;   // base arrow length
const COLOR       = 0x1565C0;      // arrow colour
const HEAD_RATIO  = 0.25;          // headLength  = HEAD_RATIO * totalLength
const HEAD_WIDTH  = 0.15;          // headWidth   = HEAD_WIDTH  * totalLength
// ---------------------------------------------------------------------------

/**
 * Simple swirling vector field:
 *   F(x,z,t) = R(t) · [-z, 0, x]          (rotation around y-axis)
 * where R(t) is a 2-D rotation matrix that slowly spins the field.
 */
function fieldVector(x, z, t) {
    // Rotate field basis over time so the arrows keep moving
    const c = Math.cos(t);
    const s = Math.sin(t);
    const vx = -z * c - x * s;
    const vz =  x * c - z * s;
    return new THREE.Vector3(vx, 0, vz);
}

// ---------------------------------------------------------------------------
// Public API expected by main.js
// ---------------------------------------------------------------------------

/** Create the arrows and add them to the scene. */
export function setup(scene /*, camera */) {
    const group  = new THREE.Group();
    const arrows = [];

    for (let x = -GRID_SIZE; x <= GRID_SIZE; x += STEP) {
        for (let z = -GRID_SIZE; z <= GRID_SIZE; z += STEP) {
            const origin = new THREE.Vector3(x, 0, z);
            const v      = fieldVector(x, z, 0);
            const dir    = v.clone().normalize();

            const arrow  = new THREE.ArrowHelper(
                dir,
                origin,
                BASE_LEN,
                COLOR,
                BASE_LEN * HEAD_RATIO,
                BASE_LEN * HEAD_WIDTH
            );

            // Stash the static origin so we can recalc each frame
            arrow.userData.origin = origin.clone();

            arrows.push(arrow);
            group.add(arrow);
        }
    }

    scene.add(group);

    // Return anything we need later in update()
    return { arrows };
}

/** Update arrow directions & lengths every frame. */
export function update({ arrows }) {
    const t = Date.now() * 0.001;           // seconds

    arrows.forEach(arrow => {
        const { x, z } = arrow.userData.origin;
        const v        = fieldVector(x, z, t);
        const len      = BASE_LEN * (0.5 + 0.1 * v.length());  // vary length a bit
        const dir      = v.normalize();

        arrow.setDirection(dir);
        arrow.setLength(len, len * HEAD_RATIO, len * HEAD_WIDTH);
    });
}
