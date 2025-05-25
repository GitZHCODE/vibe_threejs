import * as THREE from 'three';

// Configuration constants
const CONFIG = {
    GRID_SIZE: 100,
    POINT_SIZE: 0.03,
    CONTOUR_Z_OFFSET: 0.05,
    Z_SLICE_INCREMENT: 0.002,
    Z_SLICE_RANGE: [-1.0, 1.0],
    CONTOUR_ADD_INTERVAL: 100, // ms
    CONTOUR_THRESHOLD: 0.0,
    FIELD_SCALE: 20,
    INITIAL_PARAMS: {
        a1: 1.0, a2: 1.0, a3: 1.0,
        a4: 1.0, a5: 1.0, a6: 1.0
    }
};

/**
 * Class representing a minimal surface field visualization
 */
class MinimalSurfaceField {
    constructor(size = CONFIG.GRID_SIZE) {
        this.size = size;
        this.field = new Array(size * size).fill(0);
        this.stackedContours = [];
        this.contourZOffset = CONFIG.CONTOUR_Z_OFFSET;
        this.sliceZ = CONFIG.Z_SLICE_RANGE[0];
        
        // Initialize parameters
        Object.assign(this, CONFIG.INITIAL_PARAMS);
        
        // Setup materials
        this.pointMaterial = new THREE.PointsMaterial({
            size: CONFIG.POINT_SIZE,
            vertexColors: true
        });
    }

    /**
     * Initialize the field with zeros
     */
    initialize() {
        this.field.fill(0);
    }

    /**
     * Update field values based on minimal surface function
     */
    update() {
        const span = Math.PI;
        const step = (2.0 * span) / (this.size - 1);

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const x = -span + i * step;
                const y = -span + j * step;
                const z = this.sliceZ;

                const fResult = this.evaluateFieldFunction(x, y, z);
                this.field[i * this.size + j] = fResult;
            }
        }

        this.rescaleFieldToRange(-1, 1);
    }

    /**
     * Evaluate the minimal surface function at a point
     */
    evaluateFieldFunction(x, y, z) {
        return (this.a1 * Math.cos(1 * x) * Math.cos(2 * y) * Math.cos(3 * z)) +
               (this.a3 * Math.cos(2 * x) * Math.cos(1 * y) * Math.cos(3 * z)) +
               (this.a4 * Math.cos(2 * x) * Math.cos(3 * y) * Math.cos(1 * z)) +
               (this.a5 * Math.sin(3 * x) * Math.sin(1 * y) * Math.sin(2 * z)) +
               (this.a2 * Math.sin(1 * x) * Math.sin(3 * y) * Math.sin(2 * z)) +
               (this.a6 * Math.sin(3 * x) * Math.sin(2 * y) * Math.sin(1 * z));
    }

    /**
     * Rescale field values to target range
     */
    rescaleFieldToRange(targetMin = -1.0, targetMax = 1.0) {
        let min = Infinity;
        let max = -Infinity;

        // Find min and max
        for (let i = 0; i < this.field.length; i++) {
            min = Math.min(min, this.field[i]);
            max = Math.max(max, this.field[i]);
        }

        const range = Math.max(max - min, 1e-6);
        
        // Rescale values
        for (let i = 0; i < this.field.length; i++) {
            this.field[i] = this.lerp(targetMin, targetMax, (this.field[i] - min) / range);
        }
    }

    /**
     * Linear interpolation helper
     */
    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * Create visualization of field points
     */
    createVisualization() {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const value = this.field[i * this.size + j];
                
                // Position
                positions.push(
                    (i - this.size/2) * 0.5 * (CONFIG.FIELD_SCALE/this.size),  // x
                    0,                                                          // y
                    (j - this.size/2) * 0.5 * (CONFIG.FIELD_SCALE/this.size)   // z
                );

                // Color based on field value
                const color = new THREE.Color();
                if (value > 0) {
                    color.setRGB(value, 0, 0);  // Red for positive
                } else {
                    color.setRGB(0, 0, -value); // Blue for negative
                }
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        return new THREE.Points(geometry, this.pointMaterial);
    }

    /**
     * Create isocontours at given threshold
     */
    createContour(threshold = CONFIG.CONTOUR_THRESHOLD) {
        const vertices = [];
        const cellSize = 0.5 * (CONFIG.FIELD_SCALE/this.size);

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

                this.processCell(p, v, threshold, vertices);
            }
        }

        return this.createContourGeometry(vertices);
    }

    /**
     * Process a single cell for contour generation
     */
    processCell(p, v, threshold, vertices) {
        let idx = 0;
        if (v[0] > threshold) idx |= 1;
        if (v[1] > threshold) idx |= 2;
        if (v[2] > threshold) idx |= 4;
        if (v[3] > threshold) idx |= 8;

        const cases = [
            [], [[0,1]], [[1,2]], [[0,2]], [[2,3]], [[0,1],[2,3]],
            [[1,3]], [[0,3]], [[0,3]], [[1,3]], [[0,1],[2,3]],
            [[2,3]], [[0,2]], [[1,2]], [[0,1]], []
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
            const pa = this.interpolate(a[0], a[1], a[2], a[3], threshold);
            const pb = this.interpolate(b[0], b[1], b[2], b[3], threshold);
            vertices.push(pa[0], 0, pa[1], pb[0], 0, pb[1]);
        }
    }

    /**
     * Interpolate between two points based on threshold
     */
    interpolate(p1, p2, v1, v2, threshold) {
        const t = (threshold - v1) / (v2 - v1);
        return [
            p1[0] + t * (p2[0] - p1[0]),
            p1[1] + t * (p2[1] - p1[1])
        ];
    }

    /**
     * Create geometry for contour lines
     */
    createContourGeometry(vertices) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.LineBasicMaterial({ 
            color: 0x333333,
            linewidth: 2
        });
        return new THREE.LineSegments(geometry, material);
    }

    /**
     * Add current contour to stacked contours
     */
    addStackedContour(threshold = CONFIG.CONTOUR_THRESHOLD) {
        const contour = this.createContour(threshold);
        contour.position.y = this.stackedContours.length * this.contourZOffset;
        this.stackedContours.push(contour);
    }

    /**
     * Clear all stacked contours
     */
    clearStackedContours() {
        this.stackedContours = [];
    }

    /**
     * Draw all stacked contours to scene
     */
    drawStackedContours(scene) {
        for (const contour of this.stackedContours) {
            scene.add(contour);
        }
    }
}

/**
 * Setup function for the sketch
 */
export function setup(scene, camera) {
    const field = new MinimalSurfaceField();
    field.initialize();
    field.update();

    const points = field.createVisualization();
    scene.add(points);

    return { 
        field, 
        points, 
        scene, 
        lastContourTime: 0 
    };
}

/**
 * Update function for the sketch
 */
export function update(objects) {
    const { field, points, scene, lastContourTime } = objects;
    const currentTime = performance.now();
    
    // Update Z-slice position
    field.sliceZ += CONFIG.Z_SLICE_INCREMENT;
    if (field.sliceZ > CONFIG.Z_SLICE_RANGE[1]) {
        field.sliceZ = CONFIG.Z_SLICE_RANGE[0];
        // Clear all contours when we start a new cycle
        for (const contour of field.stackedContours) {
            scene.remove(contour);
        }
        field.clearStackedContours();
        objects.lastContourTime = currentTime;
    }
    
    // Update field and visualization
    field.update();
    updatePointColors(points, field);

    // Add contour to stack at intervals
    if (currentTime - lastContourTime > CONFIG.CONTOUR_ADD_INTERVAL) {
        field.addStackedContour();
        field.drawStackedContours(scene);
        objects.lastContourTime = currentTime;
    }
}

/**
 * Update point cloud colors based on field values
 */
function updatePointColors(points, field) {
    const colors = points.geometry.attributes.color.array;
    for (let i = 0; i < field.size; i++) {
        for (let j = 0; j < field.size; j++) {
            const value = field.field[i * field.size + j];
            const colorIndex = (i * field.size + j) * 3;
            
            if (value > 0) {
                colors[colorIndex] = value;     // R
                colors[colorIndex + 1] = 0;     // G
                colors[colorIndex + 2] = 0;     // B
            } else {
                colors[colorIndex] = 0;         // R
                colors[colorIndex + 1] = 0;     // G
                colors[colorIndex + 2] = -value; // B
            }
        }
    }
    points.geometry.attributes.color.needsUpdate = true;
} 