import * as THREE from 'three';

// Model georeference parameters
export const MODEL_ORIGIN = [121.49676, 31.24319];
export const MODEL_ALTITUDE = 0;
export const MODEL_ROTATE = [Math.PI / 2, 0, 0];

const CONFIG = {
    NUM_CIRCLES: 8,
    BASE_RADIUS: 5.0,
    RING_RADIUS: 10.0,
    FIELD_SIZE: 200,
    FIELD_UNIT_SIZE: 80, // physical size of the field in world units
    MAX_THRESHOLD: 2.0,
    CONTOUR_Y_OFFSET: 0.35,
    CONTOUR_ADD_INTERVAL: 4, // ms
};

class SDFGrid {
    constructor(size = CONFIG.FIELD_SIZE) {
        this.size = size;
        this.field = new Array(size * size).fill(Infinity);
        this.material = new THREE.PointsMaterial({
            size: 0.03,
            vertexColors: true
        });
        this.circles = [];
    }

    // Initialize the grid with empty field
    initialize() {
        this.field.fill(Infinity);
        this.circles = [];
    }

    // Set the circles for the current frame
    setCircles(circles) {
        this.circles = circles;
        this.updateField();
    }

    // Update the field based on current circle positions
    updateField() {
        this.field.fill(Infinity);
        const scale = CONFIG.FIELD_UNIT_SIZE / this.size;
        for (const circle of this.circles) {
            for (let i = 0; i < this.size; i++) {
                for (let j = 0; j < this.size; j++) {
                    const x = (i - this.size/2) * 0.5 * scale;
                    const z = (j - this.size/2) * 0.5 * scale;
                    const distance = Math.sqrt(
                        Math.pow(x - circle.x, 2) + 
                        Math.pow(z - circle.y, 2)
                    ) - circle.radius;
                    const index = i * this.size + j;
                    this.field[index] = Math.min(this.field[index], distance);
                }
            }
        }
    }

    // Add a bifurcating pattern
    addBifurcatingPattern(level, maxLevel, centerX, centerY, radius, angle, spread) {
        if (level >= maxLevel) return;
        this.addCircle(centerX, centerY, radius);
        const newRadius = radius * 0.7;
        const offset = radius * 1.5;
        const leftAngle = angle - spread;
        const leftX = centerX + Math.cos(leftAngle) * offset;
        const leftY = centerY + Math.sin(leftAngle) * offset;
        this.addBifurcatingPattern(level + 1, maxLevel, leftX, leftY, newRadius, leftAngle, spread * 0.8);
        const rightAngle = angle + spread;
        const rightX = centerX + Math.cos(rightAngle) * offset;
        const rightY = centerY + Math.sin(rightAngle) * offset;
        this.addBifurcatingPattern(level + 1, maxLevel, rightX, rightY, newRadius, rightAngle, spread * 0.8);
    }

    // Union operation between two fields
    static union(field1, field2) {
        return field1.map((value, index) => Math.min(value, field2[index]));
    }

    // Create the visualization
    createVisualization() {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const scale = CONFIG.FIELD_UNIT_SIZE / this.size;
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const value = this.field[i * this.size + j];
                positions.push(
                    (i - this.size/2) * 0.5 * scale,
                    0,
                    (j - this.size/2) * 0.5 * scale
                );
                const color = new THREE.Color();
                if (value > 0) {
                    color.setRGB(value, 0, 0);
                } else {
                    color.setRGB(0, 0, -value);
                }
                colors.push(color.r, color.g, color.b);
            }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        return new THREE.Points(geometry, this.material);
    }

    // Modified createContour to include height parameter
    createContour(threshold = 0, y = 0, color = 0x000000) {
        const vertices = [];
        const cellSize = 0.5 * (CONFIG.FIELD_UNIT_SIZE / this.size);
        function interp(p1, p2, v1, v2) {
            const t = (threshold - v1) / (v2 - v1);
            return [
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ];
        }
        for (let i = 0; i < this.size - 1; i++) {
            for (let j = 0; j < this.size - 1; j++) {
                const x = (i - this.size/2) * cellSize;
                const z = (j - this.size/2) * cellSize;
                const p = [
                    [x, z],
                    [x + cellSize, z],
                    [x + cellSize, z + cellSize],
                    [x, z + cellSize]
                ];
                const v = [
                    this.field[i * this.size + j],
                    this.field[(i+1) * this.size + j],
                    this.field[(i+1) * this.size + (j+1)],
                    this.field[i * this.size + (j+1)]
                ];
                let idx = 0;
                if (v[0] > threshold) idx |= 1;
                if (v[1] > threshold) idx |= 2;
                if (v[2] > threshold) idx |= 4;
                if (v[3] > threshold) idx |= 8;
                const cases = [
                    [],
                    [[0,1]],
                    [[1,2]],
                    [[0,2]],
                    [[2,3]],
                    [[0,1],[2,3]],
                    [[1,3]],
                    [[0,3]],
                    [[0,3]],
                    [[1,3]],
                    [[0,1],[2,3]],
                    [[2,3]],
                    [[0,2]],
                    [[1,2]],
                    [[0,1]],
                    []
                ];
                const edgePoints = [
                    [p[0], p[3], v[0], v[3]],
                    [p[0], p[1], v[0], v[1]],
                    [p[1], p[2], v[1], v[2]],
                    [p[2], p[3], v[2], v[3]]
                ];
                for (const pair of cases[idx]) {
                    const a = edgePoints[pair[0]];
                    const b = edgePoints[pair[1]];
                    const pa = interp(a[0], a[1], a[2], a[3]);
                    const pb = interp(b[0], b[1], b[2], b[3]);
                    vertices.push(pa[0], y, pa[1], pb[0], y, pb[1]);
                }
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
        return new THREE.LineSegments(geometry, material);
    }
}

// Modified setup function to work with Mapbox
export function setup(scene, camera) {
    // Precompute ring layout positions
    const ringPositions = [];
    for (let i = 0; i < CONFIG.NUM_CIRCLES; i++) {
        const angle = (i / CONFIG.NUM_CIRCLES) * Math.PI * 2;
        ringPositions.push({
            x: Math.cos(angle) * CONFIG.RING_RADIUS,
            y: Math.sin(angle) * CONFIG.RING_RADIUS,
            angle
        });
    }

    const sdfGrid = new SDFGrid(CONFIG.FIELD_SIZE);
    sdfGrid.initialize();

    // Initial circles at base
    const circles = ringPositions.map(pos => ({ x: pos.x, y: pos.y, radius: CONFIG.BASE_RADIUS }));
    sdfGrid.setCircles(circles);

    const points = sdfGrid.createVisualization();
    scene.add(points);

    return {
        sdfGrid,
        points,
        ringPositions,
        stackedContours: [],
        lastContourTime: performance.now(),
        animationProgress: 0,
        scene
    };
}

export function update(objects, map) {
    const {
        sdfGrid,
        ringPositions,
        stackedContours,
        scene
    } = objects;

    // Animate blend factor (0 at base, 1 at middle, 0 at top)
    objects.animationProgress = (objects.animationProgress + 0.003) % 1;
    const t = objects.animationProgress;
    const blend = 1 - Math.abs(2 * t - 1);

    // Move circles for this blend
    const circles = ringPositions.map(pos => {
        const cx = pos.x * (1 - blend);
        const cy = pos.y * (1 - blend);
        return { x: cx, y: cy, radius: CONFIG.BASE_RADIUS };
    });
    sdfGrid.setCircles(circles);

    // Add a new contour to the stack at intervals
    const now = performance.now();
    if (now - objects.lastContourTime > CONFIG.CONTOUR_ADD_INTERVAL) {
        const threshold = blend * CONFIG.MAX_THRESHOLD;
        const gray = Math.round(255 * blend);
        const color = (gray << 16) | (gray << 8) | gray;
        const y = stackedContours.length * CONFIG.CONTOUR_Y_OFFSET;
        const contour = sdfGrid.createContour(threshold, y, color);
        stackedContours.push(contour);
        scene.add(contour);
        objects.lastContourTime = now;
    }

    // If animation cycle restarts, clear all stacked contours
    if (t < 0.01 && stackedContours.length > 0) {
        for (const contour of stackedContours) {
            scene.remove(contour);
        }
        stackedContours.length = 0;
    }
} 