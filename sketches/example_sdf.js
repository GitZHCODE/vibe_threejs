import * as THREE from 'three';

class SDFGrid {
    constructor(size = 200) {
        this.size = size;
        this.field = new Array(size * size).fill(Infinity);
        this.points = [];
        this.material = new THREE.PointsMaterial({
            size: 0.03,
            vertexColors: true
        });
    }

    // Initialize the grid with empty field
    initialize() {
        this.field.fill(Infinity);
    }

    // Add a circle to the field
    addCircle(centerX, centerY, radius) {
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const x = (i - this.size/2) * 0.5 * (20/this.size);
                const z = (j - this.size/2) * 0.5 * (20/this.size);
                const distance = Math.sqrt(
                    Math.pow(x - centerX, 2) + 
                    Math.pow(z - centerY, 2)
                ) - radius;
                
                // Union operation: take the minimum distance
                const index = i * this.size + j;
                this.field[index] = Math.min(this.field[index], distance);
            }
        }
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

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const value = this.field[i * this.size + j];
                
                // Position
                positions.push(
                    (i - this.size/2) * 0.5 * (20/this.size),  // x
                    0,                         // y
                    (j - this.size/2) * 0.5 * (20/this.size)   // z
                );

                // Color based on field value
                // Map the value to a color (red for positive, blue for negative)
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
        
        return new THREE.Points(geometry, this.material);
    }

    // Proper marching squares contour extraction (complete lookup table) at any threshold
    createContour(threshold = 0, color = 0x000000) {
        const vertices = [];
        const cellSize = 0.5 * (20/this.size);
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
                    vertices.push(pa[0], 0, pa[1], pb[0], 0, pb[1]);
                }
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
        return new THREE.LineSegments(geometry, material);
    }

    // Update field values
    updateField(newField) {
        this.field = newField;
    }
}

// Example sketch - SDF Grid Visualization
export function setup(scene, camera) {
    // Create and initialize SDF grid
    const sdfGrid = new SDFGrid(200);
    sdfGrid.initialize();

    // Radial layout of circles
    const numCircles = 12;
    const radiusLayout = 3.5;
    const circleRadius = 1.2;
    for (let k = 0; k < numCircles; k++) {
        const angle = (k / numCircles) * Math.PI * 2;
        const cx = Math.cos(angle) * radiusLayout;
        const cy = Math.sin(angle) * radiusLayout;
        sdfGrid.addCircle(cx, cy, circleRadius);
    }

    const points = sdfGrid.createVisualization();
    scene.add(points);

    // Draw stacked contours with gradient
    const numContours = 16;
    const maxThreshold = 3.0;
    for (let i = 0; i < numContours; i++) {
        const t = (i / (numContours - 1)) * maxThreshold;
        // Gradient from black to white
        const gray = Math.round(255 * (i / (numContours - 1)));
        const color = (gray << 16) | (gray << 8) | gray;
        const contour = sdfGrid.createContour(t, color);
        scene.add(contour);
    }

    // Return objects for animation
    return { sdfGrid, points };
}

export function update(objects) {
    // We can add animation here later
    // For now, the visualization is static
} 