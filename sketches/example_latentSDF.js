import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';

// SDF Generator for polygons
class SDFGenerator {
    constructor(size = 64) {
        this.size = size;
        this.scale = 10; // World space scale
    }

    // Generate SDF for a polygon defined by points
    generatePolygonSDF(points) {
        const field = new Array(this.size * this.size);
        
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const x = ((i - this.size/2) / this.size) * this.scale;
                const z = ((j - this.size/2) / this.size) * this.scale;
                
                const distance = this.pointToPolygonDistance(x, z, points);
                field[i * this.size + j] = distance;
            }
        }
        
        return field;
    }

    // Calculate signed distance from point to polygon
    pointToPolygonDistance(px, pz, points) {
        if (points.length < 3) return Infinity;
        
        let minDist = Infinity;
        let inside = false;
        
        // Check each edge
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            const p1 = points[i];
            const p2 = points[j];
            
            // Distance to edge
            const edgeDist = this.pointToLineDistance(px, pz, p1.x, p1.z, p2.x, p2.z);
            minDist = Math.min(minDist, edgeDist);
            
            // Ray casting for inside test
            if (((p1.z > pz) !== (p2.z > pz)) &&
                (px < (p2.x - p1.x) * (pz - p1.z) / (p2.z - p1.z) + p1.x)) {
                inside = !inside;
            }
        }
        
        return inside ? -minDist : minDist;
    }

    // Distance from point to line segment
    pointToLineDistance(px, pz, x1, z1, x2, z2) {
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length2 = dx * dx + dz * dz;
        
        if (length2 === 0) {
            return Math.sqrt((px - x1) * (px - x1) + (pz - z1) * (pz - z1));
        }
        
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / length2));
        const projX = x1 + t * dx;
        const projZ = z1 + t * dz;
        
        return Math.sqrt((px - projX) * (px - projX) + (pz - projZ) * (pz - projZ));
    }    // Normalize SDF field using sigmoid with clipping
    normalizeSDF(field, steepness = 1) {
        return field.map(value => {
            // Clip extreme values to prevent overflow
            const clippedValue = Math.max(-5, Math.min(5, value * steepness));
            return 1 / (1 + Math.exp(clippedValue));
        });
    }

    // Create SDF visualization as a grid of points
    createSDFVisualization(field, position = { x: 0, z: 0 }, scale = 1) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                const value = field[i * this.size + j];
                
                // Position
                const x = ((i - this.size/2) / this.size) * this.scale * scale + position.x;
                const z = ((j - this.size/2) / this.size) * this.scale * scale + position.z;
                positions.push(x, 0.1, z);

                // Color based on field value (red for positive, blue for negative)
                const color = new THREE.Color();
                if (value > 0) {
                    color.setRGB(Math.min(value * 2, 1), 0, 0);  // Red for positive
                } else {
                    color.setRGB(0, 0, Math.min(-value * 2, 1)); // Blue for negative
                }
                colors.push(color.r, color.g, color.b);
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true
        });
        
        return new THREE.Points(geometry, material);
    }

    // Create boundary constraint visualization (square)
    createBoundaryVisualization(position = { x: 0, z: 0 }, scale = 1) {
        const size = this.scale * scale;
        const halfSize = size / 2;
        
        const geometry = new THREE.BufferGeometry();
        const vertices = [
            // Square boundary
            position.x - halfSize, 0.05, position.z - halfSize,
            position.x + halfSize, 0.05, position.z - halfSize,
            
            position.x + halfSize, 0.05, position.z - halfSize,
            position.x + halfSize, 0.05, position.z + halfSize,
            
            position.x + halfSize, 0.05, position.z + halfSize,
            position.x - halfSize, 0.05, position.z + halfSize,
            
            position.x - halfSize, 0.05, position.z + halfSize,
            position.x - halfSize, 0.05, position.z - halfSize
        ];
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.LineBasicMaterial({ color: 0xff9900, linewidth: 3 });
        return new THREE.LineSegments(geometry, material);
    }

}

// Auto-decoder model
class AutoDecoder {
    constructor(latentDim = 2, sdfSize = 64) {
        this.latentDim = latentDim;
        this.sdfSize = sdfSize;
        this.decoder = null;
        this.latentCodes = null;
        this.optimizer = tf.train.adam(0.001);
    }

    // Create decoder model
    createDecoder() {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({ inputShape: [this.latentDim], units: 128, activation: 'relu' }),
                tf.layers.dense({ units: 256, activation: 'relu' }),
                tf.layers.dense({ units: 512, activation: 'relu' }),
                tf.layers.dense({ units: this.sdfSize * this.sdfSize, activation: 'sigmoid' })
            ]
        });
        return model;
    }    // Initialize for training
    async initialize(numShapes) {
        this.decoder = this.createDecoder();
        
        // Initialize learnable latent codes with smaller variance
        this.latentCodes = tf.variable(
            tf.randomNormal([numShapes, this.latentDim], 0, 1)
        );
        
        // Use a smaller learning rate
        this.optimizer = tf.train.adam(0.0001);
    }    // Training step for ALL shapes (like DeepSDF)
    async trainEpoch(sdfDataset) {
        let totalLoss = 0;
        let validUpdates = 0;
        
        // Train on each shape in the dataset
        for (let i = 0; i < sdfDataset.length; i++) {
            const loss = await this.trainStep(i, sdfDataset[i]);
            const lossValue = await loss.data();
            
            if (!isNaN(lossValue[0]) && isFinite(lossValue[0])) {
                totalLoss += lossValue[0];
                validUpdates++;
            }
            
            loss.dispose();
        }
        
        return validUpdates > 0 ? totalLoss / validUpdates : NaN;
    }    // Single training step for one shape
    async trainStep(shapeIndex, targetSDF) {
        return tf.tidy(() => {
            const f = () => {
                const z = this.latentCodes.slice([shapeIndex, 0], [1, this.latentDim]);
                const prediction = this.decoder.apply(z);
                const target = tf.tensor2d([targetSDF], [1, this.sdfSize * this.sdfSize]);
                const loss = tf.losses.meanSquaredError(target, prediction);
                
                return loss;
            };
            
            // Use tf.variableGrads without explicit varList - it will find all variables automatically
            const { value, grads } = tf.variableGrads(f);
            
            // Check for NaN gradients
            let hasNaN = false;
            Object.values(grads).forEach(grad => {
                if (grad && tf.any(tf.isNaN(grad)).dataSync()[0]) {
                    hasNaN = true;
                }
            });
            
            if (!hasNaN && !tf.any(tf.isNaN(value)).dataSync()[0]) {
                this.optimizer.applyGradients(grads);
            } else {
                console.warn('NaN detected in gradients or loss, skipping update');
            }
            
            return value;
        });
    }

    // Generate SDF from latent code
    generate(latentCode) {
        return tf.tidy(() => {
            const z = tf.tensor2d([latentCode], [1, this.latentDim]);
            const output = this.decoder.apply(z);
            return output.dataSync();
        });
    }

    // Get current latent codes
    getCurrentLatentCodes() {
        return this.latentCodes.arraySync();
    }
}

// Polygon drawing interface
class PolygonDrawer {
    constructor(scene, camera, renderer, sdfGenerator) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.sdfGenerator = sdfGenerator;
        this.isDrawing = false;
        this.currentPolygon = [];
        this.polygons = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.drawingPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        
        this.setupEventListeners();
        this.createUI();
        this.createBoundaryVisualization();
    }

    setupEventListeners() {
        this.renderer.domElement.addEventListener('click', (event) => {
            if (!this.isDrawing) return;
            
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersectPoint = new THREE.Vector3();
            this.raycaster.ray.intersectPlane(this.drawingPlane, intersectPoint);
            
            if (intersectPoint) {
                this.addPoint(intersectPoint.x, intersectPoint.z);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && this.isDrawing) {
                this.finishPolygon();
            }
            if (event.key === 'Escape') {
                this.cancelDrawing();
            }
        });
    }

    createUI() {
        const ui = document.createElement('div');
        ui.style.position = 'absolute';
        ui.style.top = '10px';
        ui.style.right = '10px';
        ui.style.background = 'rgba(0,0,0,0.8)';
        ui.style.color = 'white';
        ui.style.padding = '10px';
        ui.style.borderRadius = '5px';
        ui.style.fontFamily = 'Arial, sans-serif';
        ui.style.fontSize = '12px';
        ui.style.zIndex = '1000';
        
        const drawBtn = document.createElement('button');
        drawBtn.textContent = 'Draw Polygon';
        drawBtn.onclick = () => this.startDrawing();
        
        const trainBtn = document.createElement('button');
        trainBtn.textContent = 'Train Model';
        trainBtn.onclick = () => this.onTrainCallback && this.onTrainCallback();
        
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear All';
        clearBtn.onclick = () => this.clearAll();
        
        const status = document.createElement('div');
        status.id = 'drawing-status';
        status.innerHTML = `
            <div>Polygons: ${this.polygons.length}</div>
            <div>Click to add points, Enter to finish, Esc to cancel</div>
        `;
        
        ui.appendChild(drawBtn);
        ui.appendChild(trainBtn);
        ui.appendChild(clearBtn);
        ui.appendChild(status);
        
        document.body.appendChild(ui);
        this.statusDiv = status;
    }

    updateStatus() {
        if (this.statusDiv) {
            this.statusDiv.innerHTML = `
                <div>Polygons: ${this.polygons.length}</div>
                <div>Current points: ${this.currentPolygon.length}</div>
                <div>Click to add points, Enter to finish, Esc to cancel</div>
            `;
        }
    }    startDrawing() {
        this.isDrawing = true;
        this.currentPolygon = [];
        
        // Clear previous SDF when starting new drawing
        this.clearPreviousSDFVisualization();
        
        this.updateStatus();
    }

    addPoint(x, z) {
        this.currentPolygon.push({ x, z });
        
        // Visualize point
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(x, 0.1, z);
        sphere.userData.isDrawingPoint = true;
        this.scene.add(sphere);
        
        this.updateStatus();
    }    finishPolygon() {
        if (this.currentPolygon.length >= 3) {
            this.polygons.push([...this.currentPolygon]);
            
            // Generate and visualize SDF immediately
            this.generateAndShowSDF(this.currentPolygon, this.polygons.length - 1);
            
            // Clear the current polygon visualization
            this.clearCurrentPolygonVisualization();
        }
        this.isDrawing = false;
        this.currentPolygon = [];
        this.updateStatus();
    }

    generateAndShowSDF(points, index) {
        // Clear previous SDF visualization
        this.clearPreviousSDFVisualization();
        
        // Generate SDF for this polygon
        const sdf = this.sdfGenerator.generatePolygonSDF(points);
        
        // Create SDF visualization at the center
        const position = { x: 0, z: 0 };
        
        const sdfVis = this.sdfGenerator.createSDFVisualization(sdf, position, 0.8);
        sdfVis.userData.isCurrentSdf = true;
        this.scene.add(sdfVis);
        
        // Add boundary visualization for this SDF
        const boundary = this.sdfGenerator.createBoundaryVisualization(position, 0.8);
        boundary.userData.isCurrentSdfBoundary = true;
        this.scene.add(boundary);
        
        // Add label for this SDF
        const label = this.createSdfLabel(`SDF ${index + 1} - Press Draw Polygon for next`, position);
        label.userData.isCurrentSdfLabel = true;
        this.scene.add(label);
        
        console.log(`Generated SDF ${index + 1} for polygon with ${points.length} points`);
    }

    clearCurrentPolygonVisualization() {
        // Remove current polygon drawing points and lines
        const objectsToRemove = [];
        this.scene.traverse((child) => {
            if (child.userData.isDrawingPoint || child.userData.isPolygonLine) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => this.scene.remove(obj));
    }

    clearPreviousSDFVisualization() {
        // Remove previous SDF visualization
        const objectsToRemove = [];
        this.scene.traverse((child) => {
            if (child.userData.isCurrentSdf || 
                child.userData.isCurrentSdfBoundary ||
                child.userData.isCurrentSdfLabel) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => this.scene.remove(obj));
    }

    createSdfLabel(text, position) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = '24px Arial';
        context.fillStyle = 'black';
        context.fillText(text, 0, 24);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.set(position.x, 1, position.z - 6);
        sprite.scale.set(2, 1, 1);
        sprite.userData.isSdfLabel = true;
        
        return sprite;
    }

    createBoundaryVisualization() {
        // Create the main drawing boundary
        const boundary = this.sdfGenerator.createBoundaryVisualization({ x: 0, z: 0 }, 1);
        boundary.userData.isMainBoundary = true;
        this.scene.add(boundary);
        
        // Add label for drawing area
        const label = this.createSdfLabel('Drawing Area', { x: 0, z: 0 });
        label.position.y = 1;
        label.position.z = -6;
        this.scene.add(label);
    }    cancelDrawing() {
        this.isDrawing = false;
        this.currentPolygon = [];
        
        // Clear current drawing points
        this.clearCurrentPolygonVisualization();
        
        this.updateStatus();
    }clearAll() {
        this.polygons = [];
        this.isDrawing = false;
        this.currentPolygon = [];
        
        // Remove all drawing visualizations and SDF visualizations
        const objectsToRemove = [];
        this.scene.traverse((child) => {
            if (child.userData.isDrawingPoint || 
                child.userData.isPolygonLine ||
                child.userData.isCurrentSdf ||
                child.userData.isCurrentSdfBoundary ||
                child.userData.isCurrentSdfLabel) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => this.scene.remove(obj));
        
        this.updateStatus();
    }

    setTrainCallback(callback) {
        this.onTrainCallback = callback;
    }
}

// Latent space visualization
class LatentSpaceVisualizer {
    constructor(scene, autoDecoder, sdfGenerator) {
        this.scene = scene;
        this.autoDecoder = autoDecoder;
        this.sdfGenerator = sdfGenerator;
        this.gridSize = 10;
        this.gridRange = 2;
        this.visualizationObjects = [];
    }    // Create grid visualization of latent space
    async createLatentGrid(showContours = false) {
        this.clearVisualization();
        
        // Get current latent codes to understand the learned space
        const latentCodes = this.autoDecoder.getCurrentLatentCodes();
        console.log('Visualizing latent space with codes:', latentCodes);
        
        // Adjust grid range based on learned latent codes
        let minX = Math.min(...latentCodes.map(code => code[0]));
        let maxX = Math.max(...latentCodes.map(code => code[0]));
        let minY = Math.min(...latentCodes.map(code => code[1]));
        let maxY = Math.max(...latentCodes.map(code => code[1]));
        
        // Add some padding around the learned codes
        const padding = 1.0;
        minX -= padding;
        maxX += padding;
        minY -= padding;
        maxY += padding;
        
        console.log(`Latent space range: X[${minX.toFixed(3)}, ${maxX.toFixed(3)}], Y[${minY.toFixed(3)}, ${maxY.toFixed(3)}]`);
        
        const stepX = (maxX - minX) / (this.gridSize - 1);
        const stepY = (maxY - minY) / (this.gridSize - 1);
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const x = minX + i * stepX;
                const y = minY + j * stepY;
                
                // Generate SDF at this latent point
                const sdf = this.autoDecoder.generate([x, y]);
                
                // Debug: check if SDF values are varying
                const sdfMin = Math.min(...sdf);
                const sdfMax = Math.max(...sdf);
                const sdfMean = sdf.reduce((a, b) => a + b) / sdf.length;
                
                if (i === 0 && j === 0) {
                    console.log(`Sample SDF stats at (${x.toFixed(3)}, ${y.toFixed(3)}): min=${sdfMin.toFixed(3)}, max=${sdfMax.toFixed(3)}, mean=${sdfMean.toFixed(3)}`);
                }
                
                const contourPosition = new THREE.Vector3(
                    (i - this.gridSize/2) * 3,
                    0,
                    (j - this.gridSize/2) * 3
                );
                
                if (showContours) {
                    // Create contour visualization after training
                    const contour = this.createSDFContour(sdf, 0.5);
                    contour.position.copy(contourPosition);
                    contour.scale.setScalar(0.3);
                    
                    this.scene.add(contour);
                    this.visualizationObjects.push(contour);
                } else {
                    // Create SDF point visualization during training
                    const sdfVis = this.sdfGenerator.createSDFVisualization(sdf, { x: 0, z: 0 }, 0.3);
                    sdfVis.position.copy(contourPosition);
                    
                    this.scene.add(sdfVis);
                    this.visualizationObjects.push(sdfVis);
                }
                
                // Add coordinate label
                const label = this.createLabel(`(${x.toFixed(1)}, ${y.toFixed(1)})`);
                label.position.copy(contourPosition);
                label.position.y += 0.5;
                this.scene.add(label);
                this.visualizationObjects.push(label);
                
                // Mark learned latent code positions
                for (let k = 0; k < latentCodes.length; k++) {
                    const code = latentCodes[k];
                    if (Math.abs(code[0] - x) < stepX/2 && Math.abs(code[1] - y) < stepY/2) {
                        // This grid point is close to a learned latent code
                        const marker = this.createLatentMarker(k);
                        marker.position.copy(contourPosition);
                        marker.position.y += 1;
                        this.scene.add(marker);
                        this.visualizationObjects.push(marker);
                    }
                }
            }
        }
    }createSDFContour(sdfArray, threshold) {
        const vertices = [];
        const size = this.autoDecoder.sdfSize;
        const cellSize = 10 / size;
        
        // Linear interpolation for edge intersections
        function lerp(p1, p2, v1, v2, threshold) {
            if (Math.abs(v1 - v2) < 1e-6) return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
            const t = (threshold - v1) / (v2 - v1);
            return [
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ];
        }
        
        for (let i = 0; i < size - 1; i++) {
            for (let j = 0; j < size - 1; j++) {
                const x = (i - size/2) * cellSize;
                const z = (j - size/2) * cellSize;
                
                // Cell corners
                const corners = [
                    [x, z],                    // bottom-left
                    [x + cellSize, z],         // bottom-right  
                    [x + cellSize, z + cellSize], // top-right
                    [x, z + cellSize]          // top-left
                ];
                
                const values = [
                    sdfArray[i * size + j],           // bottom-left
                    sdfArray[(i + 1) * size + j],     // bottom-right
                    sdfArray[(i + 1) * size + (j + 1)], // top-right
                    sdfArray[i * size + (j + 1)]      // top-left
                ];
                
                // Marching squares configuration
                let config = 0;
                if (values[0] > threshold) config |= 1;  // bottom-left
                if (values[1] > threshold) config |= 2;  // bottom-right
                if (values[2] > threshold) config |= 4;  // top-right
                if (values[3] > threshold) config |= 8;  // top-left
                
                // Edge midpoints (for interpolation)
                const edges = [
                    [corners[0], corners[1], values[0], values[1]], // bottom edge
                    [corners[1], corners[2], values[1], values[2]], // right edge
                    [corners[2], corners[3], values[2], values[3]], // top edge
                    [corners[3], corners[0], values[3], values[0]]  // left edge
                ];
                
                // Marching squares lookup table
                const lines = [];
                switch (config) {
                    case 1:  lines.push([0, 3]); break;           // bottom-left corner
                    case 2:  lines.push([0, 1]); break;           // bottom-right corner
                    case 3:  lines.push([1, 3]); break;           // bottom edge
                    case 4:  lines.push([1, 2]); break;           // top-right corner
                    case 5:  lines.push([0, 1], [2, 3]); break;   // saddle case
                    case 6:  lines.push([0, 2]); break;           // right edge
                    case 7:  lines.push([2, 3]); break;           // top-right + bottom
                    case 8:  lines.push([2, 3]); break;           // top-left corner
                    case 9:  lines.push([0, 2]); break;           // left edge
                    case 10: lines.push([0, 3], [1, 2]); break;   // saddle case
                    case 11: lines.push([1, 2]); break;           // top-left + bottom
                    case 12: lines.push([1, 3]); break;           // top edge
                    case 13: lines.push([0, 1]); break;           // top-left + bottom-left
                    case 14: lines.push([0, 3]); break;           // top + bottom-right
                    // case 0 and 15: no lines (all inside or all outside)
                }
                
                // Generate line segments for this cell
                for (const line of lines) {
                    const p1 = lerp(edges[line[0]][0], edges[line[0]][1], edges[line[0]][2], edges[line[0]][3], threshold);
                    const p2 = lerp(edges[line[1]][0], edges[line[1]][1], edges[line[1]][2], edges[line[1]][3], threshold);
                    
                    vertices.push(p1[0], 0, p1[1], p2[0], 0, p2[1]);
                }
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });return new THREE.LineSegments(geometry, material);
    }

    createLabel(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = '20px Arial';
        context.fillStyle = 'white';
        context.fillText(text, 0, 20);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(1, 0.5, 1);
        
        return sprite;
    }

    createLatentMarker(shapeIndex) {
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: shapeIndex === 0 ? 0xff0000 : shapeIndex === 1 ? 0x00ff00 : 0x0000ff 
        });
        const sphere = new THREE.Mesh(geometry, material);
        return sphere;
    }

    clearVisualization() {
        this.visualizationObjects.forEach(obj => this.scene.remove(obj));
        this.visualizationObjects = [];
    }
}

// Main example setup
export function setup(scene, camera, renderer) {
    const sdfGenerator = new SDFGenerator(64);
    const autoDecoder = new AutoDecoder(2, 64);
    const polygonDrawer = new PolygonDrawer(scene, camera, renderer, sdfGenerator);
    const latentVisualizer = new LatentSpaceVisualizer(scene, autoDecoder, sdfGenerator);
    
    let isTraining = false;
    
    // Training function
    async function trainModel() {
        if (polygonDrawer.polygons.length === 0) {
            alert('Please draw some polygons first!');
            return;
        }
        
        if (isTraining) return;
        isTraining = true;
          console.log('Starting training...');
        
        // Clear input SDF visualization when training starts
        polygonDrawer.clearPreviousSDFVisualization();
        
        // Generate SDF dataset
        const sdfDataset = [];
        for (const polygon of polygonDrawer.polygons) {
            const sdf = sdfGenerator.generatePolygonSDF(polygon);
            const normalizedSDF = sdfGenerator.normalizeSDF(sdf);
            sdfDataset.push(normalizedSDF);
        }
          // Initialize auto-decoder
        await autoDecoder.initialize(sdfDataset.length);
        
        // Set TensorFlow.js to use less GPU memory
        tf.env().set('WEBGL_CPU_FORWARD', false);
        tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
        
        const epochs = 5000;  // Reduced from 5000
        const displayInterval = 500;  // Reduced from 500
        
        console.log('SDF dataset generated:', sdfDataset.length, 'shapes');
        console.log('SDF value range check:', 
            Math.min(...sdfDataset[0]), 'to', Math.max(...sdfDataset[0]));        for (let epoch = 0; epoch < epochs; epoch++) {
            console.log(`Training epoch ${epoch + 1}/${epochs}`);
            // Train on ALL shapes in this epoch (like DeepSDF)
            const avgLoss = await autoDecoder.trainEpoch(sdfDataset);
            
            if (epoch % displayInterval === 0 || epoch === epochs - 1) {
                console.log(`Epoch ${epoch}: Loss = ${avgLoss.toFixed(6)}`);
                
                // Log current latent codes to see how they're evolving
                const latentCodes = autoDecoder.getCurrentLatentCodes();
                console.log('Current latent codes:', latentCodes.map((code, i) => 
                    `Shape ${i}: [${code[0].toFixed(3)}, ${code[1].toFixed(3)}]`).join(', '));
                
                // Check if latent codes are too similar
                if (latentCodes.length > 1) {
                    const distances = [];
                    for (let i = 0; i < latentCodes.length; i++) {
                        for (let j = i + 1; j < latentCodes.length; j++) {
                            const dist = Math.sqrt(
                                Math.pow(latentCodes[i][0] - latentCodes[j][0], 2) + 
                                Math.pow(latentCodes[i][1] - latentCodes[j][1], 2)
                            );
                            distances.push(dist);
                        }
                    }
                    const avgDistance = distances.reduce((a, b) => a + b) / distances.length;
                    console.log(`Average distance between latent codes: ${avgDistance.toFixed(6)}`);
                    
                    if (avgDistance < 0.01) {
                        console.warn('Latent codes are converging to the same point!');
                    }
                }
                
                // Only update visualization if loss is valid
                if (!isNaN(avgLoss)) {
                    // Show SDF points during training (not contours)
                    await latentVisualizer.createLatentGrid(false);
                }
                
                // Force garbage collection and memory cleanup
                await tf.nextFrame();
                console.log('Memory info:', tf.memory());
            }
            
            // Stop training if loss becomes invalid
            if (isNaN(avgLoss)) {
                console.error('Training stopped due to NaN loss');
                break;
            }
            
            // Periodic memory cleanup
            if (epoch % 50 === 0) {
                await tf.nextFrame();
            }
        }
          console.log('Training completed!');
        isTraining = false;
        
        // Final visualization with contours
        await latentVisualizer.createLatentGrid(true);
    }
    
    polygonDrawer.setTrainCallback(trainModel);
    
    // Add coordinate system
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);
    
    // Add ground plane
    const planeGeometry = new THREE.PlaneGeometry(20, 20);
    const planeMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.3 
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);
    
    return { 
        sdfGenerator, 
        autoDecoder, 
        polygonDrawer, 
        latentVisualizer 
    };
}

export function update(objects, renderer) {
    // Animation updates can be added here if needed
}