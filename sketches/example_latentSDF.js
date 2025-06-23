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
    }    // Create SDF visualization as colored points (consistent with example_sdf.js)
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

                // Color based on field value (red for positive/outside, blue for negative/inside)
                const color = new THREE.Color();
                if (value > 0) {
                    // Outside shape - red gradient
                    const intensity = Math.min(Math.abs(value) / 2, 1);
                    color.setRGB(intensity, 0, 0);
                } else {
                    // Inside shape - blue gradient
                    const intensity = Math.min(Math.abs(value) / 2, 1);
                    color.setRGB(0, 0, intensity);
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
        this.trainingData = null; // Store training polygons
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
    }// Initialize for training
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
    }    // Save trained model and data using File System Access API
    async saveTrainedData() {
        try {
            console.log('Saving trained data using File System Access API...');
            
            // Check if File System Access API is supported
            if (!window.showDirectoryPicker) {
                console.warn('File System Access API not supported, falling back to IndexedDB');
                return await this.saveToBrowserStorage();
            }
            
            // Ask user to select the data directory
            const dirHandle = await window.showDirectoryPicker();
            
            // Save model files
            await this.saveModelToDirectory(dirHandle);
            
            // Save metadata
            const latentCodes = this.getCurrentLatentCodes();
            const trainedData = {
                latentCodes: latentCodes,
                trainingPolygons: this.trainingData,
                latentDim: this.latentDim,
                sdfSize: this.sdfSize,
                timestamp: new Date().toISOString()
            };
            
            await this.saveMetadataToDirectory(dirHandle, trainedData);
            
            console.log('Trained data saved successfully to selected directory');
            this.showSuccessMessage();
            
            return true;
        } catch (error) {
            if (error.name === 'SecurityError' && error.message.includes('user gesture')) {
                console.warn('File System Access API requires user gesture - this is expected');
                throw error; // Re-throw to let the UI handle it
            }
            
            console.error('Error saving with File System Access API:', error);
            
            // Fallback to browser storage
            try {
                console.log('Attempting browser storage fallback...');
                return await this.saveToBrowserStorage();
            } catch (fallbackError) {
                console.error('All storage methods failed:', fallbackError);
                return false;
            }
        }
    }    // Save model to directory using File System Access API
    async saveModelToDirectory(dirHandle) {
        try {
            // Create a custom save handler that captures the full model artifacts
            let capturedArtifacts = null;
            
            const saveHandler = tf.io.withSaveHandler(async (artifacts) => {
                capturedArtifacts = artifacts;
                return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
            });
            
            // Save to capture artifacts
            await this.decoder.save(saveHandler);
            
            if (!capturedArtifacts) {
                throw new Error('Failed to capture model artifacts');
            }
            
            // Create the model.json with proper TensorFlow.js format
            const modelJson = {
                modelTopology: capturedArtifacts.modelTopology,
                weightsManifest: [{
                    paths: ['weights.bin'],
                    weights: capturedArtifacts.weightSpecs
                }],
                format: 'layers-model',
                generatedBy: 'TensorFlow.js tfjs-layers v' + tf.version.tfjs,
                convertedBy: null
            };
            
            // Save model.json
            const modelJsonFile = await dirHandle.getFileHandle('model.json', { create: true });
            const modelJsonWritable = await modelJsonFile.createWritable();
            await modelJsonWritable.write(JSON.stringify(modelJson, null, 2));
            await modelJsonWritable.close();
            
            // Save weights.bin
            const weightsFile = await dirHandle.getFileHandle('weights.bin', { create: true });
            const weightsWritable = await weightsFile.createWritable();
            await weightsWritable.write(capturedArtifacts.weightData);
            await weightsWritable.close();
            
            console.log('Model files saved successfully');
        } catch (error) {
            throw new Error(`Failed to save model to directory: ${error.message}`);
        }
    }

    // Save metadata to directory
    async saveMetadataToDirectory(dirHandle, data) {
        try {
            const metadataFile = await dirHandle.getFileHandle('latent-sdf-metadata.json', { create: true });
            const metadataWritable = await metadataFile.createWritable();
            await metadataWritable.write(JSON.stringify(data, null, 2));
            await metadataWritable.close();
            
            console.log('Metadata saved successfully');
        } catch (error) {
            throw new Error(`Failed to save metadata: ${error.message}`);
        }
    }

    // Show success message
    showSuccessMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '50%';
        messageDiv.style.left = '50%';
        messageDiv.style.transform = 'translate(-50%, -50%)';
        messageDiv.style.background = 'rgba(0,128,0,0.9)';
        messageDiv.style.color = 'white';
        messageDiv.style.padding = '20px';
        messageDiv.style.borderRadius = '10px';
        messageDiv.style.zIndex = '10000';
        messageDiv.style.fontFamily = 'Arial, sans-serif';
          messageDiv.innerHTML = `
            <h3>Training Data Saved Successfully!</h3>
            <p>Files have been saved to the selected directory:</p>
            <ul>
                <li>latent-sdf-metadata.json</li>
                <li>model.json</li>
                <li>weights.bin</li>
            </ul>
            <p>You can now use the tower example to load your trained model!</p>
            <button id="closeMessage" style="padding: 10px 20px; margin-top: 10px;">Close</button>
        `;
        
        document.body.appendChild(messageDiv);
        
        document.getElementById('closeMessage').onclick = () => {
            document.body.removeChild(messageDiv);
        };
        
        // Auto-close after 10 seconds
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 10000);
    }

    // Fallback to browser storage
    async saveToBrowserStorage() {
        try {
            // Use IndexedDB as fallback
            await this.decoder.save('indexeddb://latent-sdf-model');
            
            const latentCodes = this.getCurrentLatentCodes();
            
            const trainedData = {
                latentCodes: latentCodes,
                trainingPolygons: this.trainingData,
                latentDim: this.latentDim,
                sdfSize: this.sdfSize,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('latent-sdf-metadata', JSON.stringify(trainedData));
            
            console.log('Trained data saved to browser storage as fallback');
            return true;
        } catch (error) {
            throw new Error(`Browser storage fallback failed: ${error.message}`);
        }
    }

    // Fallback method with compressed data
    async saveCompressedData() {
        try {
            // Extract only the most essential model weights (first and last layers)
            const essentialWeights = [];
            const weightShapes = [];
            
            const layers = this.decoder.layers;
            const layersToSave = [0, layers.length - 1]; // First and last layers only
            
            for (const layerIndex of layersToSave) {
                const layer = layers[layerIndex];
                if (layer.getWeights && layer.getWeights().length > 0) {
                    const weights = layer.getWeights();
                    for (let j = 0; j < weights.length; j++) {
                        const weightData = await weights[j].data();
                        // Quantize weights to reduce size (convert to 8-bit)
                        const quantizedWeights = Array.from(weightData).map(w => 
                            Math.round(Math.max(-127, Math.min(127, w * 127)) / 127 * 100) / 100
                        );
                        essentialWeights.push(quantizedWeights);
                        weightShapes.push(weights[j].shape);
                    }
                }
            }
            
            const latentCodes = this.getCurrentLatentCodes();
            
            const compressedData = {
                latentCodes: latentCodes,
                trainingPolygons: this.trainingData,
                latentDim: this.latentDim,
                sdfSize: this.sdfSize,
                essentialWeights: essentialWeights,
                weightShapes: weightShapes,
                layersToSave: layersToSave,
                isCompressed: true,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('latent-sdf-compressed', JSON.stringify(compressedData));
            console.log('Compressed training data saved to localStorage');
            return true;
        } catch (error) {
            console.error('Even compressed storage failed:', error);
            return false;
        }
    }

    // Clear saved data
    clearSavedData() {
        // Clear IndexedDB model
        try {
            tf.io.removeModel('indexeddb://latent-sdf-model');
        } catch (error) {
            console.warn('Could not clear IndexedDB model:', error);
        }
        
        // Clear localStorage data
        localStorage.removeItem('latent-sdf-metadata');
        localStorage.removeItem('latent-sdf-compressed');
        
        // Clear old chunked data
        const chunkCount = localStorage.getItem('latent-sdf-chunks');
        if (chunkCount) {
            const numChunks = parseInt(chunkCount);
            for (let i = 0; i < numChunks; i++) {
                localStorage.removeItem(`latent-sdf-chunk-${i}`);
            }
            localStorage.removeItem('latent-sdf-chunks');
        }
        localStorage.removeItem('latent-sdf-data');
    }    // Load trained model and data using File System Access API or fallbacks
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
    }    // Load from File System Access API
    static async loadFromFileSystem() {
        try {
            const dirHandle = await window.showDirectoryPicker();
            
            // Load metadata
            const metadataFileHandle = await dirHandle.getFileHandle('latent-sdf-metadata.json');
            const metadataFile = await metadataFileHandle.getFile();
            const metadataText = await metadataFile.text();
            const metadata = JSON.parse(metadataText);
            
            // Create new AutoDecoder instance
            const autoDecoder = new AutoDecoder(metadata.latentDim, metadata.sdfSize);
            
            // Create a custom IO handler for loading from the directory
            const loadHandler = tf.io.browserFiles([
                await dirHandle.getFileHandle('model.json').then(h => h.getFile()),
                await dirHandle.getFileHandle('weights.bin').then(h => h.getFile())
            ]);
            
            // Load the model using the standard TensorFlow.js loader
            autoDecoder.decoder = await tf.loadLayersModel(loadHandler);
            
            // Recreate latent codes as TensorFlow variables
            autoDecoder.latentCodes = tf.variable(tf.tensor2d(metadata.latentCodes));
            autoDecoder.trainingData = metadata.trainingPolygons;
            
            console.log('Trained data loaded successfully from File System Access API');
            console.log('Loaded polygons:', metadata.trainingPolygons?.length || 0);
            console.log('Loaded latent codes:', metadata.latentCodes);
            
            return autoDecoder;
        } catch (error) {
            if (error.name === 'SecurityError' && error.message.includes('user gesture')) {
                console.warn('File System Access API requires user gesture for loading');
            }
            throw error;
        }
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
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Model';
        saveBtn.style.display = 'none';
        saveBtn.onclick = () => this.onSaveCallback && this.onSaveCallback();
        
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
        ui.appendChild(saveBtn);
        ui.appendChild(clearBtn);
        ui.appendChild(status);
        
        document.body.appendChild(ui);
        this.statusDiv = status;
        this.saveBtn = saveBtn;
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
    }    setTrainCallback(callback) {
        this.onTrainCallback = callback;
    }
    
    setSaveCallback(callback) {
        this.onSaveCallback = callback;
    }
    
    showSaveButton() {
        if (this.saveBtn) {
            this.saveBtn.style.display = 'block';
        }
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
    }    createSDFContour(sdfArray, threshold) {
        const vertices = [];
        const size = this.autoDecoder.sdfSize;
        const cellSize = 10 / size;
        
        // Improved linear interpolation for edge intersections
        function lerp(p1, p2, v1, v2, threshold) {
            if (Math.abs(v1 - v2) < 1e-10) {
                // Values are essentially equal, return midpoint
                return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
            }
            
            // Linear interpolation: find where threshold crosses the edge
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
                    sdfArray[i * size + j],           // 0: bottom-left
                    sdfArray[(i + 1) * size + j],     // 1: bottom-right
                    sdfArray[(i + 1) * size + (j + 1)], // 2: top-right
                    sdfArray[i * size + (j + 1)]      // 3: top-left
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
                    
                    // Add line segment
                    vertices.push(p1[0], 0, p1[1], p2[0], 0, p2[1]);
                }
            }
        }
        
        // Create geometry from vertices
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        const material = new THREE.LineBasicMaterial({ 
            color: 0x00ff00, 
            linewidth: 2 
        });
        
        return new THREE.LineSegments(geometry, material);
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
    let trainedAutoDecoder = null;
    
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
        
        const epochs = 5000;  //change training epochs as needed
        const displayInterval = 200;  
        
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
        }        console.log('Training completed!');
        
        // Store training data in autoDecoder
        autoDecoder.trainingData = polygonDrawer.polygons;
        trainedAutoDecoder = autoDecoder;
        
        // Show save button for user gesture
        polygonDrawer.showSaveButton();
        
        isTraining = false;
        
        // Final visualization with contours
        await latentVisualizer.createLatentGrid(true);
    }
    
    // Save function that requires user gesture
    async function saveModel() {
        if (!trainedAutoDecoder) {
            alert('No trained model to save! Please train a model first.');
            return;
        }
        
        const saved = await trainedAutoDecoder.saveTrainedData();
        if (saved) {
            console.log('Training data saved successfully');
        }
    }
    
    polygonDrawer.setTrainCallback(trainModel);
    polygonDrawer.setSaveCallback(saveModel);
    
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