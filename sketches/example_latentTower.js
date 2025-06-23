import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';

// Load AutoDecoder from the SDF example
class AutoDecoder {
    constructor(latentDim = 2, sdfSize = 64) {
        this.latentDim = latentDim;
        this.sdfSize = sdfSize;
        this.decoder = null;
        this.latentCodes = null;
        this.optimizer = tf.train.adam(0.001);
        this.trainingData = null;
    }    // Create decoder model
    createDecoder() {
        const model = tf.sequential({
            layers: [
                tf.layers.dense({ inputShape: [this.latentDim], units: 64, activation: 'relu' }),
                tf.layers.dense({ units: 128, activation: 'relu' }),
                tf.layers.dense({ units: this.sdfSize * this.sdfSize, activation: 'sigmoid' })
            ]
        });
        return model;
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
    }    // Load trained model and data using File System Access API
    static async loadTrainedData() {
        try {
            // First attempt: File System Access API to read from selected directory
            if (window.showDirectoryPicker) {
                try {
                    const result = await AutoDecoder.loadFromFileSystem();
                    if (result) return result;
                } catch (fsError) {
                    console.warn('File System Access API failed:', fsError);
                }
            }
            
            // Second attempt: Try loading from local data folder (when served via local server)
            try {
                const result = await AutoDecoder.loadFromLocalFolder();
                if (result) return result;
            } catch (localError) {
                console.warn('Failed to load from local data folder:', localError);
            }
            
            // Third attempt: Fallback to IndexedDB
            try {
                const result = await AutoDecoder.loadFromIndexedDB();
                if (result) return result;
            } catch (indexedDbError) {
                console.warn('Failed to load from IndexedDB:', indexedDbError);
            }
            
            console.log('No saved training data found in any location');
            return null;
            
        } catch (error) {
            console.error('Error loading trained data:', error);
            return null;
        }
    }

    // Load from File System Access API
    static async loadFromFileSystem() {
        const dirHandle = await window.showDirectoryPicker();
        
        // Load metadata
        const metadataFileHandle = await dirHandle.getFileHandle('latent-sdf-metadata.json');
        const metadataFile = await metadataFileHandle.getFile();
        const metadataText = await metadataFile.text();
        const metadata = JSON.parse(metadataText);
        
        // Create new AutoDecoder instance
        const autoDecoder = new AutoDecoder(metadata.latentDim, metadata.sdfSize);
        
        // Load model files
        const modelJsonHandle = await dirHandle.getFileHandle('latent-sdf-model.json');
        const modelJsonFile = await modelJsonHandle.getFile();
        const modelTopology = JSON.parse(await modelJsonFile.text());
        
        const weightsHandle = await dirHandle.getFileHandle('latent-sdf-model.weights.bin');
        const weightsFile = await weightsHandle.getFile();
        const weightData = await weightsFile.arrayBuffer();
        
        // Create model from artifacts
        const modelArtifacts = {
            modelTopology: modelTopology,
            weightData: weightData
        };
        
        autoDecoder.decoder = await tf.loadLayersModel(tf.io.fromMemory(modelArtifacts));
        
        // Recreate latent codes as TensorFlow variables
        autoDecoder.latentCodes = tf.variable(tf.tensor2d(metadata.latentCodes));
        autoDecoder.trainingData = metadata.trainingPolygons;
        
        console.log('Trained data loaded successfully from File System Access API');
        console.log('Loaded polygons:', metadata.trainingPolygons?.length || 0);
        console.log('Loaded latent codes:', metadata.latentCodes);
        
        return autoDecoder;
    }    // Load from local data folder
    static async loadFromLocalFolder() {
        // Load metadata
        const metadataResponse = await fetch('./data/latent-sdf-metadata.json');
        if (!metadataResponse.ok) throw new Error('Metadata not found');
        
        const metadata = await metadataResponse.json();
        
        // Create new AutoDecoder instance
        const autoDecoder = new AutoDecoder(metadata.latentDim, metadata.sdfSize);
        
        // Load the model from local folder using standard path
        const modelPath = './data/model.json';
        autoDecoder.decoder = await tf.loadLayersModel(modelPath);
        
        // Recreate latent codes as TensorFlow variables
        autoDecoder.latentCodes = tf.variable(tf.tensor2d(metadata.latentCodes));
        autoDecoder.trainingData = metadata.trainingPolygons;
        
        console.log('Trained data loaded successfully from local data folder');
        console.log('Loaded polygons:', metadata.trainingPolygons?.length || 0);
        console.log('Loaded latent codes:', metadata.latentCodes);
        
        return autoDecoder;
    }

    // Load from IndexedDB
    static async loadFromIndexedDB() {
        const metadataStr = localStorage.getItem('latent-sdf-metadata');
        if (!metadataStr) throw new Error('No metadata in localStorage');
        
        const metadata = JSON.parse(metadataStr);
        
        // Create new AutoDecoder instance
        const autoDecoder = new AutoDecoder(metadata.latentDim, metadata.sdfSize);
        
        // Load the model from IndexedDB
        autoDecoder.decoder = await tf.loadLayersModel('indexeddb://latent-sdf-model');
        
        // Recreate latent codes as TensorFlow variables
        autoDecoder.latentCodes = tf.variable(tf.tensor2d(metadata.latentCodes));
        autoDecoder.trainingData = metadata.trainingPolygons;
        
        console.log('Trained data loaded successfully from IndexedDB (fallback)');
        console.log('Loaded polygons:', metadata.trainingPolygons?.length || 0);
        console.log('Loaded latent codes:', metadata.latentCodes);
        
        return autoDecoder;
    }
}

// Latent Space Navigation
class LatentSpaceNavigator {
    constructor(scene, camera, renderer, autoDecoder) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.autoDecoder = autoDecoder;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isDrawingPath = false;
        this.pathPoints = [];
        this.pathVisualization = null;
        this.latentSpaceSize = 10;
        this.latentRange = 2;
        
        this.setupEventListeners();
        this.createLatentSpaceVisualization();
    }

    setupEventListeners() {
        this.renderer.domElement.addEventListener('click', (event) => {
            if (!this.isDrawingPath) return;
            
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            
            // Check intersection with latent space plane
            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersectPoint = new THREE.Vector3();
            
            if (this.raycaster.ray.intersectPlane(plane, intersectPoint)) {
                // Convert world position to latent coordinates
                const latentX = (intersectPoint.x / this.latentSpaceSize) * this.latentRange * 2;
                const latentY = (intersectPoint.z / this.latentSpaceSize) * this.latentRange * 2;
                
                this.addPathPoint(latentX, latentY, intersectPoint);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && this.isDrawingPath) {
                this.finishPath();
            }
            if (event.key === 'Escape') {
                this.cancelPath();
            }
        });
    }    createLatentSpaceVisualization() {
        // Get current latent codes to understand the learned space
        const latentCodes = this.autoDecoder.getCurrentLatentCodes();
        
        // Adjust range based on learned latent codes
        let minX = Math.min(...latentCodes.map(code => code[0]));
        let maxX = Math.max(...latentCodes.map(code => code[0]));
        let minY = Math.min(...latentCodes.map(code => code[1]));
        let maxY = Math.max(...latentCodes.map(code => code[1]));
        
        const padding = 1.0;
        this.latentRange = Math.max(
            Math.abs(minX - padding), Math.abs(maxX + padding),
            Math.abs(minY - padding), Math.abs(maxY + padding)
        );
          // Create grid of SDF visualizations
        const gridSize = 6; // Reduced for better visibility
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const latentX = ((i - gridSize/2) / gridSize) * this.latentRange * 2;
                const latentY = ((j - gridSize/2) / gridSize) * this.latentRange * 2;
                
                const sdf = this.autoDecoder.generate([latentX, latentY]);
                
                const worldX = (i - gridSize/2) * (this.latentSpaceSize / gridSize);
                const worldZ = (j - gridSize/2) * (this.latentSpaceSize / gridSize);
                
                // Create contour lines only
                const contour = this.createSDFContour(sdf, 0.5);
                contour.position.set(worldX, 0.01, worldZ);
                contour.scale.setScalar(0.3);
                contour.userData.isLatentVisualization = true;
                this.scene.add(contour);
                
                // Add coordinate labels
                const label = this.createLabel(`(${latentX.toFixed(1)}, ${latentY.toFixed(1)})`);
                label.position.set(worldX, 0.4, worldZ);
                label.userData.isLatentVisualization = true;
                this.scene.add(label);
            }
        }
          // Mark learned latent code positions
        for (let k = 0; k < latentCodes.length; k++) {
            const code = latentCodes[k];
            
            // Use the same coordinate transformation as the grid
            const gridX = (code[0] - minX) / (maxX - minX) * (gridSize - 1);
            const gridZ = (code[1] - minY) / (maxY - minY) * (gridSize - 1);
            
            const worldX = (gridX - gridSize/2) * (this.latentSpaceSize / gridSize);
            const worldZ = (gridZ - gridSize/2) * (this.latentSpaceSize / gridSize);
            
            const marker = this.createLatentMarker(k);
            marker.position.set(worldX, 0.6, worldZ);
            marker.userData.isLatentVisualization = true;
            this.scene.add(marker);
            
            // Add text label for training data
            const trainingLabel = this.createLabel(`Training ${k + 1}`);
            trainingLabel.position.set(worldX, 0.8, worldZ);
            trainingLabel.userData.isLatentVisualization = true;
            this.scene.add(trainingLabel);
        }
        
        // Create boundary
        const boundaryGeometry = new THREE.PlaneGeometry(this.latentSpaceSize, this.latentSpaceSize);
        const boundaryMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x444444, 
            transparent: true, 
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        const boundary = new THREE.Mesh(boundaryGeometry, boundaryMaterial);
        boundary.rotation.x = -Math.PI / 2;
        boundary.position.y = -0.01;
        boundary.userData.isLatentVisualization = true;
        this.scene.add(boundary);
    }    // Create SDF field visualization as colored points (consistent with example_sdf.js)
    createSDFFieldVisualization(sdfData, scale) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        const size = Math.sqrt(sdfData.length);
        
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const value = sdfData[i * size + j];
                
                // Position
                const x = ((i - size/2) / size) * 2.0 * scale;
                const z = ((j - size/2) / size) * 2.0 * scale;
                positions.push(x, 0.1, z); 

                // Color based on SDF value (consistent with latentSDF coloring)
                const color = new THREE.Color();
                if (value > 0.5) {
                    // Inside shape - blue to green
                    const intensity = Math.min((value - 0.5) * 4, 1);
                    color.setRGB(0, intensity, 1 - intensity * 0.5);
                } else {
                    // Outside shape - red to yellow
                    const intensity = Math.min(value * 2, 1);
                    color.setRGB(1, intensity, 0);
                }
                colors.push(color.r, color.g, color.b);
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.03,
            vertexColors: true
        });
        
        return new THREE.Points(geometry, material);
    }createSDFContour(sdfData, threshold) {
        // Use marching squares algorithm for proper contour extraction
        const vertices = [];
        const size = Math.sqrt(sdfData.length);
        const cellSize = 2.0 / size; // Normalize to -1 to 1 range
        
        // Improved linear interpolation for edge intersections
        function lerp(p1, p2, v1, v2, threshold) {
            if (Math.abs(v1 - v2) < 1e-10) {
                return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
            }
            const t = Math.max(0, Math.min(1, (threshold - v1) / (v2 - v1)));
            return [
                p1[0] + t * (p2[0] - p1[0]),
                p1[1] + t * (p2[1] - p1[1])
            ];
        }
        
        // Process each cell in the grid
        for (let i = 0; i < size - 1; i++) {
            for (let j = 0; j < size - 1; j++) {
                const x = (i - size/2) * cellSize;
                const z = (j - size/2) * cellSize;
                
                // Cell corners in counter-clockwise order
                const corners = [
                    [x, z],                      // 0: bottom-left
                    [x + cellSize, z],           // 1: bottom-right  
                    [x + cellSize, z + cellSize], // 2: top-right
                    [x, z + cellSize]            // 3: top-left
                ];
                
                // Sample values at corners
                const values = [
                    sdfData[i * size + j],           // 0: bottom-left
                    sdfData[(i + 1) * size + j],     // 1: bottom-right
                    sdfData[(i + 1) * size + (j + 1)], // 2: top-right
                    sdfData[i * size + (j + 1)]      // 3: top-left
                ];
                
                // Create configuration bitmask
                let config = 0;
                if (values[0] > threshold) config |= 1;  // bit 0
                if (values[1] > threshold) config |= 2;  // bit 1
                if (values[2] > threshold) config |= 4;  // bit 2
                if (values[3] > threshold) config |= 8;  // bit 3
                
                // Skip empty cells
                if (config === 0 || config === 15) continue;
                
                // Cell edges with their endpoints and values
                const edges = [
                    { p1: corners[0], p2: corners[1], v1: values[0], v2: values[1] }, // bottom edge
                    { p1: corners[1], p2: corners[2], v1: values[1], v2: values[2] }, // right edge
                    { p1: corners[2], p2: corners[3], v1: values[2], v2: values[3] }, // top edge
                    { p1: corners[3], p2: corners[0], v1: values[3], v2: values[0] }  // left edge
                ];
                
                // Marching squares lookup table for line segments
                const lineConfigs = {
                    1:  [[0, 3]],           // bottom-left corner
                    2:  [[0, 1]],           // bottom-right corner
                    3:  [[1, 3]],           // bottom edge
                    4:  [[1, 2]],           // top-right corner
                    5:  [[0, 1], [2, 3]],   // saddle case (two separate lines)
                    6:  [[0, 2]],           // right edge
                    7:  [[2, 3]],           // top-right + bottom
                    8:  [[2, 3]],           // top-left corner
                    9:  [[0, 2]],           // left edge
                    10: [[0, 3], [1, 2]],   // saddle case (two separate lines)
                    11: [[1, 2]],           // top-left + bottom
                    12: [[1, 3]],           // top edge
                    13: [[0, 1]],           // top-left + bottom-left
                    14: [[0, 3]]            // top + bottom-right
                };
                
                const lines = lineConfigs[config] || [];
                
                // Generate line segments for this cell
                for (const line of lines) {
                    const edge1 = edges[line[0]];
                    const edge2 = edges[line[1]];
                    
                    // Calculate intersection points using linear interpolation
                    const p1 = lerp(edge1.p1, edge1.p2, edge1.v1, edge1.v2, threshold);
                    const p2 = lerp(edge2.p1, edge2.p2, edge2.v1, edge2.v2, threshold);
                    
                    // Add line segment (convert to 3D coordinates)
                    vertices.push(p1[0], 0, p1[1], p2[0], 0, p2[1]);
                }
            }
        }
        
        // Create geometry from vertices
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00ff00, 
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });
        
        return new THREE.LineSegments(geometry, material);
    }

    createLabel(text) {
        const spriteMaterial = new THREE.SpriteMaterial({ 
            color: 0xffffff, 
            depthTest: false 
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = '24px Arial';
        context.fillStyle = 'rgba(255, 255, 255, 1)';
        context.fillText(text, 0, 24);
        
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        
        spriteMaterial.map = texture;
        spriteMaterial.sizeAttenuation = true;
        sprite.scale.set(1, 0.5, 1);
        
        return sprite;
    }    createLatentMarker(index) {
        const geometry = new THREE.SphereGeometry(0.1, 8,8);
        const material = new THREE.MeshBasicMaterial({ 
            color: index === 0 ? 0xff0000 : index === 1 ? 0x00ff00 : 0x0000ff 
        });
        const sphere = new THREE.Mesh(geometry, material);
        return sphere;
    }

    startDrawingPath() {
        this.isDrawingPath = true;
        this.pathPoints = [];
        this.clearPathVisualization();
    }

    addPathPoint(latentX, latentY, worldPos) {
        this.pathPoints.push({ latent: [latentX, latentY], world: worldPos.clone() });
        
        // Visualize point
        const geometry = new THREE.SphereGeometry(0.1, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(worldPos);
        sphere.position.y = 0.1;
        sphere.userData.isPathPoint = true;
        this.scene.add(sphere);
        
        this.updatePathVisualization();
    }

    updatePathVisualization() {
        this.clearPathVisualization();
        
        if (this.pathPoints.length < 2) return;
        
        const curve = new THREE.CatmullRomCurve3(
            this.pathPoints.map(p => p.world.clone().add(new THREE.Vector3(0, 0.1, 0)))
        );
        const points = curve.getPoints(50);
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const line = new THREE.Line(geometry, material);
        line.userData.isPathVisualization = true;
        this.scene.add(line);
        
        this.pathVisualization = line;
    }

    clearPathVisualization() {
        if (this.pathVisualization) {
            this.scene.remove(this.pathVisualization);
            this.pathVisualization.geometry.dispose();
            this.pathVisualization.material.dispose();
            this.pathVisualization = null;
        }
        
        // Remove existing path points
        const pathPoints = this.scene.children.filter(child => child.userData.isPathPoint);
        for (const point of pathPoints) {
            this.scene.remove(point);
        }
    }

    finishPath() {
        this.isDrawingPath = false;
        
        // Snap to grid
        const gridSize = 0.1;
        for (const p of this.pathPoints) {
            p.latent[0] = Math.round(p.latent[0] / gridSize) * gridSize;
            p.latent[1] = Math.round(p.latent[1] / gridSize) * gridSize;
        }
        
        this.updatePathVisualization();
    }

    cancelPath() {
        this.isDrawingPath = false;
        this.clearPathVisualization();
    }    getPathPoints() {
        return this.pathPoints.map(p => p.latent);
    }
    
    clearLatentSpaceVisualization() {
        // Remove all latent space visualization objects
        const objectsToRemove = [];
        this.scene.traverse((child) => {
            if (child.userData.isLatentVisualization) {
                objectsToRemove.push(child);
            }
        });
        objectsToRemove.forEach(obj => this.scene.remove(obj));
    }
}

// Tower Builder
class TowerBuilder {
    constructor(scene, autoDecoder) {
        this.scene = scene;
        this.autoDecoder = autoDecoder;
        this.tower = null;
    }

    // Interpolate between points in path
    interpolatePath(pathPoints, floorCount) {
        if (pathPoints.length < 2) return pathPoints;
        
        const interpolatedPoints = [];
        const segmentCount = floorCount - 1;
        
        for (let i = 0; i < segmentCount; i++) {
            const t = i / segmentCount;
            
            // Find which segment we're in
            const segmentLength = 1 / (pathPoints.length - 1);
            const segmentIndex = Math.floor(t / segmentLength);
            const localT = (t % segmentLength) / segmentLength;
            
            if (segmentIndex >= pathPoints.length - 1) {
                interpolatedPoints.push(pathPoints[pathPoints.length - 1]);
            } else {
                const p1 = pathPoints[segmentIndex];
                const p2 = pathPoints[segmentIndex + 1];
                
                const interpolated = [
                    p1[0] + (p2[0] - p1[0]) * localT,
                    p1[1] + (p2[1] - p1[1]) * localT
                ];
                interpolatedPoints.push(interpolated);
            }
        }
        
        // Add the last point
        interpolatedPoints.push(pathPoints[pathPoints.length - 1]);
        
        return interpolatedPoints;
    }

    // Generate contour from SDF
    generateContour(sdf, threshold = 0.5) {
        const contourPoints = [];
        const size = this.autoDecoder.sdfSize;
        const cellSize = 10 / size;
        
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
                
                const corners = [
                    [x, z],
                    [x + cellSize, z],
                    [x + cellSize, z + cellSize],
                    [x, z + cellSize]
                ];
                
                const values = [
                    sdf[i * size + j],
                    sdf[(i + 1) * size + j],
                    sdf[(i + 1) * size + (j + 1)],
                    sdf[i * size + (j + 1)]
                ];
                
                let config = 0;
                if (values[0] > threshold) config |= 1;
                if (values[1] > threshold) config |= 2;
                if (values[2] > threshold) config |= 4;
                if (values[3] > threshold) config |= 8;
                
                const edges = [
                    [corners[0], corners[1], values[0], values[1]],
                    [corners[1], corners[2], values[1], values[2]],
                    [corners[2], corners[3], values[2], values[3]],
                    [corners[3], corners[0], values[3], values[0]]
                ];
                
                const lines = [];
                switch (config) {
                    case 1:  lines.push([0, 3]); break;
                    case 2:  lines.push([0, 1]); break;
                    case 3:  lines.push([1, 3]); break;
                    case 4:  lines.push([1, 2]); break;
                    case 5:  lines.push([0, 1], [2, 3]); break;
                    case 6:  lines.push([0, 2]); break;
                    case 7:  lines.push([2, 3]); break;
                    case 8:  lines.push([2, 3]); break;
                    case 9:  lines.push([0, 2]); break;
                    case 10: lines.push([0, 3], [1, 2]); break;
                    case 11: lines.push([1, 2]); break;
                    case 12: lines.push([1, 3]); break;
                    case 13: lines.push([0, 1]); break;
                    case 14: lines.push([0, 3]); break;
                }
                
                for (const line of lines) {
                    const p1 = lerp(edges[line[0]][0], edges[line[0]][1], edges[line[0]][2], edges[line[0]][3], threshold);
                    const p2 = lerp(edges[line[1]][0], edges[line[1]][1], edges[line[1]][2], edges[line[1]][3], threshold);
                    contourPoints.push(new THREE.Vector2(p1[0], p1[1]));
                    contourPoints.push(new THREE.Vector2(p2[0], p2[1]));
                }
            }
        }
        
        return contourPoints;
    }

    // Build tower from path
    buildTower(pathPoints, floorCount, floorHeight) {
        if (this.tower) {
            this.scene.remove(this.tower);
        }
        
        const interpolatedPoints = this.interpolatePath(pathPoints, floorCount);
        const floorGeometries = [];
        
        console.log('Building tower with', interpolatedPoints.length, 'floors');
        
        // Generate contours for each floor
        for (let i = 0; i < interpolatedPoints.length; i++) {
            const latentCode = interpolatedPoints[i];
            const sdf = this.autoDecoder.generate(latentCode);
            const contourPoints = this.generateContour(sdf);
            
            if (contourPoints.length > 0) {
                // Center the contour
                const centroid = new THREE.Vector2(0, 0);
                contourPoints.forEach(p => centroid.add(p));
                centroid.divideScalar(contourPoints.length);
                
                const centeredPoints = contourPoints.map(p => 
                    new THREE.Vector3(p.x - centroid.x, i * floorHeight, p.y - centroid.y)
                );
                
                floorGeometries.push(centeredPoints);
            }
        }
        
        // Create tower geometry by connecting floor contours
        this.createTowerMesh(floorGeometries);
    }

    createTowerMesh(floorGeometries) {
        const towerGroup = new THREE.Group();
        
        // Create floor contours
        for (let i = 0; i < floorGeometries.length; i++) {
            const points = floorGeometries[i];
            if (points.length > 0) {
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const material = new THREE.LineBasicMaterial({ 
                    color: new THREE.Color().setHSL(i / floorGeometries.length, 0.7, 0.6)
                });
                const line = new THREE.Line(geometry, material);
                towerGroup.add(line);
            }
        }
        
        // Connect floors with vertical lines
        for (let i = 0; i < floorGeometries.length - 1; i++) {
            const currentFloor = floorGeometries[i];
            const nextFloor = floorGeometries[i + 1];
            
            if (currentFloor.length > 0 && nextFloor.length > 0) {
                // Connect corresponding points between floors
                const connections = Math.min(currentFloor.length, nextFloor.length);
                
                for (let j = 0; j < connections; j += 2) { // Skip every other connection for clarity
                    const p1 = currentFloor[j % currentFloor.length];
                    const p2 = nextFloor[j % nextFloor.length];
                    
                    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
                    const material = new THREE.LineBasicMaterial({ 
                        color: 0x666666,
                        transparent: true,
                        opacity: 0.3
                    });
                    const line = new THREE.Line(geometry, material);
                    towerGroup.add(line);
                }
            }
        }
        
        this.tower = towerGroup;
        this.tower.userData.isTower = true;
        this.scene.add(this.tower);
        
        console.log('Tower created with', floorGeometries.length, 'floors');
    }

    clearTower() {
        if (this.tower) {
            this.scene.remove(this.tower);
            this.tower = null;
        }
    }
}

// UI Controller
class TowerUI {
    constructor(navigator, builder) {
        this.navigator = navigator;
        this.builder = builder;
        this.floorCount = 10;
        this.floorHeight = 0.5;
        
        this.createUI();
    }

    createUI() {
        const ui = document.createElement('div');
        ui.style.position = 'absolute';
        ui.style.top = '10px';
        ui.style.left = '10px';
        ui.style.background = 'rgba(0,0,0,0.8)';
        ui.style.color = 'white';
        ui.style.padding = '15px';
        ui.style.borderRadius = '5px';
        ui.style.fontFamily = 'Arial, sans-serif';
        ui.style.fontSize = '14px';
        ui.style.zIndex = '1000';
        ui.style.minWidth = '250px';
        
        ui.innerHTML = `
            <h3 style="margin-top: 0;">Latent Tower Builder</h3>
            
            <div style="margin-bottom: 15px;">
                <label>Floor Count:</label><br>
                <input type="range" id="floorCount" min="3" max="50" value="${this.floorCount}" style="width: 100%;">
                <span id="floorCountValue">${this.floorCount}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label>Floor Height:</label><br>
                <input type="range" id="floorHeight" min="0.1" max="2.0" step="0.1" value="${this.floorHeight}" style="width: 100%;">
                <span id="floorHeightValue">${this.floorHeight}</span>
            </div>
              <div style="margin-bottom: 15px;">
                <button id="loadModel" style="width: 100%; padding: 8px; margin-bottom: 5px;">Load Model</button>
                <button id="drawPath" style="width: 100%; padding: 8px; margin-bottom: 5px;">Draw Path</button>
                <button id="buildTower" style="width: 100%; padding: 8px; margin-bottom: 5px;">Build Tower</button>
                <button id="clearAll" style="width: 100%; padding: 8px;">Clear All</button>
            </div>
            
            <div id="instructions" style="font-size: 12px; color: #ccc;">
                <p>1. Click "Load Model" to select trained data</p>
                <p>2. Click "Draw Path" and click points in latent space</p>
                <p>3. Press Enter to finish path</p>
                <p>4. Adjust floor count and height</p>
                <p>5. Click "Build Tower"</p>
            </div>
        `;
        
        document.body.appendChild(ui);
          // Event listeners
        const floorCountSlider = ui.querySelector('#floorCount');
        const floorCountValue = ui.querySelector('#floorCountValue');
        floorCountSlider.addEventListener('input', (e) => {
            this.floorCount = parseInt(e.target.value);
            floorCountValue.textContent = this.floorCount;
        });
        
        const floorHeightSlider = ui.querySelector('#floorHeight');
        const floorHeightValue = ui.querySelector('#floorHeightValue');
        floorHeightSlider.addEventListener('input', (e) => {
            this.floorHeight = parseFloat(e.target.value);
            floorHeightValue.textContent = this.floorHeight;
        });
        
        ui.querySelector('#loadModel').addEventListener('click', async () => {
            try {
                const autoDecoder = await AutoDecoder.loadFromFileSystem();
                if (autoDecoder) {
                    // Update the global autoDecoder and recreate visualization
                    this.navigator.autoDecoder = autoDecoder;
                    this.builder.autoDecoder = autoDecoder;
                    
                    // Clear and recreate latent space visualization
                    this.navigator.clearLatentSpaceVisualization();
                    this.navigator.createLatentSpaceVisualization();
                    
                    alert('Model loaded successfully!');
                } else {
                    alert('Failed to load model.');
                }
            } catch (error) {
                console.error('Error loading model:', error);
                alert('Error loading model: ' + error.message);
            }
        });
        
        ui.querySelector('#drawPath').addEventListener('click', () => {
            this.navigator.startDrawingPath();
        });
        
        ui.querySelector('#buildTower').addEventListener('click', () => {
            const pathPoints = this.navigator.getPathPoints();
            if (pathPoints.length < 2) {
                alert('Please draw a path with at least 2 points first!');
                return;
            }
            this.builder.buildTower(pathPoints, this.floorCount, this.floorHeight);
        });
        
        ui.querySelector('#clearAll').addEventListener('click', () => {
            this.navigator.cancelPath();
            this.builder.clearTower();
        });
    }
}

// Main setup function
export async function setup(scene, camera, renderer) {
    // Try to load trained data automatically from fallback sources first
    let autoDecoder = null;
    
    try {
        // Skip File System Access API on initial load to avoid user gesture requirement
        // Try loading from local folder first
        try {
            autoDecoder = await AutoDecoder.loadFromLocalFolder();
            console.log('Loaded trained data from local folder automatically');
        } catch (localError) {
            console.warn('No local folder data found, trying IndexedDB...');
            
            // Try IndexedDB fallback
            try {
                autoDecoder = await AutoDecoder.loadFromIndexedDB();
                console.log('Loaded trained data from IndexedDB automatically');
            } catch (indexedDbError) {
                console.log('No automatically loadable data found. Use "Load Model" button to select files.');
            }
        }
    } catch (error) {
        console.warn('Could not automatically load model:', error);
    }
    
    // Create a dummy autoDecoder if none found (will be replaced when user loads model)
    if (!autoDecoder) {
        autoDecoder = new AutoDecoder(2, 64);
        console.log('Created dummy AutoDecoder - use "Load Model" to load trained data');
    }
    
    // Initialize components
    const navigator = new LatentSpaceNavigator(scene, camera, renderer, autoDecoder);
    const builder = new TowerBuilder(scene, autoDecoder);
    const ui = new TowerUI(navigator, builder);
    
    // Only create latent space visualization if we have a trained model
    if (autoDecoder.decoder && autoDecoder.latentCodes) {
        // We have a trained model, create visualization
        console.log('Creating latent space visualization with loaded model');
    } else {
        // No trained model, show instructions
        console.log('No trained model available - click "Load Model" to get started');
    }
    
    // Add coordinate system
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);
    
    // Add ground plane
    const planeGeometry = new THREE.PlaneGeometry(30, 30);
    const planeMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x333333, 
        transparent: true, 
        opacity: 0.3 
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.1;
    scene.add(plane);
    
    return { autoDecoder, navigator, builder, ui };
}

export function update(objects, renderer) {
    // Animation updates can be added here if needed
}