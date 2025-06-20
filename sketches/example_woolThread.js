import * as THREE from 'three';

// State variables
let isDrawing = false;
let isSimulating = false;
let currentPolyline = [];
let polylines = []; // Store all polyline data
let allPhysicsPoints = []; // Store all physics points
let allPointMeshes = []; // Store all point meshes
let allLineMeshes = []; // Store all line meshes
let previewPoint = null;
let previewGeometry = null;
let previewMesh = null;
let temporaryPointMeshes = [];
let temporaryLineMesh = null;
let temporaryLineGeometry = null;
let temporaryLineMaterial = null;

// Physics parameters
let subdivisions = 5;
let stiffness = 0.1;
let attraction = 0;
let damping = 0.02;

// Raycaster setup
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const planeIntersectPoint = new THREE.Vector3();
const basePlane = new THREE.Plane();

// UI elements
let ui = null;
let scene = null;
let camera = null;
let renderer = null;

// Physics classes
class PhysicsPoint {
    constructor(position, isFixed = false, polylineId = 0, indexInPolyline = 0) {
        this.position = new THREE.Vector3().copy(position);
        this.oldPosition = new THREE.Vector3().copy(position);
        this.velocity = new THREE.Vector3();
        this.isFixed = isFixed;
        this.polylineId = polylineId;
        this.indexInPolyline = indexInPolyline;
    }

    update(deltaTime) {
        if (this.isFixed) return;

        this.velocity.subVectors(this.position, this.oldPosition);
        this.velocity.multiplyScalar(1 - damping);
        const nextPosition = this.position.clone().add(this.velocity);
        this.oldPosition.copy(this.position);
        this.position.copy(nextPosition);

        // Keep points within visible bounds
        this.position.x = THREE.MathUtils.clamp(this.position.x, -50, 50);
        this.position.z = THREE.MathUtils.clamp(this.position.z, -50, 50);
    }

    applyForce(force) {
        if (!this.isFixed) {
            this.position.add(force);
        }
    }
}

// Polyline class to manage individual polylines
class Polyline {
    constructor(points, id) {
        this.id = id;
        this.originalPoints = points.map(p => p.clone());
        this.physicsPoints = [];
        this.pointMeshes = [];
        this.lineMesh = null;
        this.restLengths = [];
        this.subdivide();
    }

    subdivide() {
        const subdividedPoints = [];

        // Subdivide the polyline
        for (let i = 0; i < this.originalPoints.length - 1; i++) {
            const start = this.originalPoints[i];
            const end = this.originalPoints[i + 1];
            subdividedPoints.push(start.clone());

            for (let j = 1; j < subdivisions; j++) {
                const t = j / subdivisions;
                const point = new THREE.Vector3(
                    start.x + (end.x - start.x) * t,
                    start.y + (end.y - start.y) * t,
                    start.z + (end.z - start.z) * t
                );
                subdividedPoints.push(point);
            }
        }
        subdividedPoints.push(this.originalPoints[this.originalPoints.length - 1].clone());

        // Create physics points
        this.physicsPoints = subdividedPoints.map((point, index) => {
            const isFixed = index === 0 || index === subdividedPoints.length - 1;
            return new PhysicsPoint(point, isFixed, this.id, index);
        });

        // Calculate rest lengths
        this.restLengths = [];
        for (let i = 0; i < this.physicsPoints.length - 1; i++) {
            const distance = this.physicsPoints[i].position.distanceTo(this.physicsPoints[i + 1].position);
            this.restLengths.push(distance);
        }

        // Create visual elements
        this.createVisuals();
    }

    createVisuals() {
        // Create point meshes
        this.physicsPoints.forEach((point, index) => {
            const isFixed = point.isFixed;
            const color = isFixed ? 0xff0000 : 0x00ff00; // Red for fixed, green for free
            const pointGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const pointMaterial = new THREE.MeshBasicMaterial({ color: color });
            const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
            pointMesh.position.copy(point.position);
            scene.add(pointMesh);
            this.pointMeshes.push(pointMesh);
            allPointMeshes.push(pointMesh);
        });

        // Create line mesh
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(
            this.physicsPoints.map(p => p.position)
        );
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
        this.lineMesh = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(this.lineMesh);
        allLineMeshes.push(this.lineMesh);

        // Add physics points to global array
        allPhysicsPoints.push(...this.physicsPoints);
    }

    updatePhysics(deltaTime) {
        const timeScale = deltaTime * 60;

        // Apply spring forces within this polyline
        for (let i = 1; i < this.physicsPoints.length - 1; i++) {
            const current = this.physicsPoints[i];
            if (current.isFixed) continue;

            const prev = this.physicsPoints[i - 1];
            const next = this.physicsPoints[i + 1];
            const restPrev = this.restLengths[i - 1];
            const restNext = this.restLengths[i];

            // Force from previous point
            const distancePrev = current.position.distanceTo(prev.position);
            const differencePrev = distancePrev - restPrev;
            const forcePrev = new THREE.Vector3()
                .subVectors(prev.position, current.position)
                .normalize()
                .multiplyScalar(differencePrev * stiffness);

            // Force from next point
            const distanceNext = current.position.distanceTo(next.position);
            const differenceNext = distanceNext - restNext;
            const forceNext = new THREE.Vector3()
                .subVectors(next.position, current.position)
                .normalize()
                .multiplyScalar(differenceNext * stiffness);

            const totalForce = new THREE.Vector3().add(forcePrev).add(forceNext);
            current.applyForce(totalForce.multiplyScalar(timeScale));
        }
    }

    updateVisuals() {
        // Update point meshes
        this.pointMeshes.forEach((mesh, index) => {
            if (this.physicsPoints[index]) {
                mesh.position.copy(this.physicsPoints[index].position);
            }
        });

        // Update line mesh
        if (this.lineMesh) {
            const positions = this.physicsPoints.map(p => p.position);
            this.lineMesh.geometry.setFromPoints(positions);
            this.lineMesh.geometry.attributes.position.needsUpdate = true;
        }
    }

    dispose() {
        // Remove point meshes
        this.pointMeshes.forEach(mesh => {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });

        // Remove line mesh
        if (this.lineMesh) {
            scene.remove(this.lineMesh);
            this.lineMesh.geometry.dispose();
            this.lineMesh.material.dispose();
        }

        // Remove from global arrays
        this.physicsPoints.forEach(point => {
            const index = allPhysicsPoints.indexOf(point);
            if (index > -1) allPhysicsPoints.splice(index, 1);
        });

        this.pointMeshes.forEach(mesh => {
            const index = allPointMeshes.indexOf(mesh);
            if (index > -1) allPointMeshes.splice(index, 1);
        });

        const lineIndex = allLineMeshes.indexOf(this.lineMesh);
        if (lineIndex > -1) allLineMeshes.splice(lineIndex, 1);
    }
}

// Create UI
function createUI() {
    const ui = document.createElement('div');
    ui.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        padding: 15px;
        border-radius: 8px;
        color: white;
        font-family: Arial, sans-serif;
        z-index: 100;
        min-width: 250px;
    `;

    ui.innerHTML = `
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px;">Subdivisions: <span id="subdivisions-value">5</span></label>
            <input type="range" id="subdivisions" min="2" max="20" value="5" style="width: 100%; margin-bottom: 5px;">
        </div>
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px;">Stiffness: <span id="stiffness-value">0.1</span></label>
            <input type="range" id="stiffness" min="0.01" max="1" step="0.01" value="0.1" style="width: 100%; margin-bottom: 5px;">
        </div>
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px;">Attraction: <span id="attraction-value">0</span></label>
            <input type="range" id="attraction" min="0" max="1" step="0.01" value="0" style="width: 100%; margin-bottom: 5px;">
        </div>
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px; font-size: 14px;">Damping: <span id="damping-value">0.02</span></label>
            <input type="range" id="damping" min="0" max="0.1" step="0.001" value="0.02" style="width: 100%; margin-bottom: 5px;">
        </div>
    `;

    document.body.appendChild(ui);

    // Status element
    const status = document.createElement('div');
    status.id = 'status';
    status.style.cssText = `
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.8);
        padding: 10px;
        border-radius: 5px;
        color: white;
        font-family: Arial, sans-serif;
        z-index: 100;
        max-width: 80%;
    `;
    status.textContent = 'Status: Press "p" to start drawing, "x" to reset';
    document.body.appendChild(status);

    // Add event listeners
    const subdivisionsSlider = document.getElementById('subdivisions');
    const stiffnessSlider = document.getElementById('stiffness');
    const attractionSlider = document.getElementById('attraction');
    const dampingSlider = document.getElementById('damping');
    const subdivisionsValue = document.getElementById('subdivisions-value');
    const stiffnessValue = document.getElementById('stiffness-value');
    const attractionValue = document.getElementById('attraction-value');
    const dampingValue = document.getElementById('damping-value');

    subdivisionsSlider.addEventListener('input', () => {
        subdivisions = parseInt(subdivisionsSlider.value);
        subdivisionsValue.textContent = subdivisions;
    });
    stiffnessSlider.addEventListener('input', () => {
        stiffness = parseFloat(stiffnessSlider.value);
        stiffnessValue.textContent = stiffness;
    });
    attractionSlider.addEventListener('input', () => {
        attraction = parseFloat(attractionSlider.value);
        attractionValue.textContent = attraction;
    });
    dampingSlider.addEventListener('input', () => {
        damping = parseFloat(dampingSlider.value);
        dampingValue.textContent = damping;
    });

    return { ui, status };
}

// Create preview point
function createPreviewPoint(position) {
    if (!previewGeometry) {
        previewGeometry = new THREE.SphereGeometry(0.2, 16, 16);
        previewMesh = new THREE.Mesh(previewGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        scene.add(previewMesh);
    }
    previewMesh.position.copy(position);
    return previewMesh;
}

// Add point to current polyline
function addPointToPolyline(position) {
    const pointGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
    pointMesh.position.copy(position);
    scene.add(pointMesh);
    temporaryPointMeshes.push(pointMesh);

    currentPolyline.push(position.clone());
    updatePolylineVisualization();
}

// Update polyline visualization
function updatePolylineVisualization() {
    // Remove temporary line if exists
    if (temporaryLineMesh) {
        scene.remove(temporaryLineMesh);
        temporaryLineGeometry?.dispose();
        temporaryLineMaterial?.dispose();
    }

    // Create new temporary visualization
    if (currentPolyline.length > 1) {
        temporaryLineGeometry = new THREE.BufferGeometry().setFromPoints(currentPolyline);
        temporaryLineMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
        temporaryLineMesh = new THREE.Line(temporaryLineGeometry, temporaryLineMaterial);
        scene.add(temporaryLineMesh);
    }
}

// Finalize polyline and create physics
function finalizePolyline() {
    if (currentPolyline.length < 2) return;

    const status = document.getElementById('status');
    status.textContent = 'Status: Polyline finalized - Press "r" to start simulation';

    // Remove temporary drawing elements
    temporaryPointMeshes.forEach(mesh => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    temporaryPointMeshes = [];

    if (temporaryLineMesh) {
        scene.remove(temporaryLineMesh);
        temporaryLineGeometry.dispose();
        temporaryLineMaterial.dispose();
        temporaryLineMesh = null;
        temporaryLineGeometry = null;
        temporaryLineMaterial = null;
    }

    // Create new polyline
    const polylineId = polylines.length;
    const newPolyline = new Polyline(currentPolyline, polylineId);
    polylines.push(newPolyline);

    // Reset current polyline
    currentPolyline = [];
    isDrawing = false;

    if (previewMesh) {
        scene.remove(previewMesh);
        previewMesh = null;
        previewGeometry = null;
    }
}

// Reset function
function resetSimulation() {
    // Stop simulation
    isSimulating = false;
    isDrawing = false;
    currentPolyline = [];

    // Dispose all polylines
    polylines.forEach(polyline => polyline.dispose());
    polylines = [];
    allPhysicsPoints = [];
    allPointMeshes = [];
    allLineMeshes = [];

    // Remove preview point
    if (previewMesh) {
        scene.remove(previewMesh);
        previewMesh = null;
        previewGeometry = null;
    }

    // Clear temporary points
    temporaryPointMeshes.forEach(mesh => {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    });
    temporaryPointMeshes = [];

    // Clear temporary line
    if (temporaryLineMesh) {
        scene.remove(temporaryLineMesh);
        temporaryLineGeometry?.dispose();
        temporaryLineMaterial?.dispose();
        temporaryLineMesh = null;
    }

    const status = document.getElementById('status');
    status.textContent = 'Status: Simulation reset - Press "p" to start drawing, "x" to reset';
}

// Update physics simulation
function updatePhysics(deltaTime) {
    // Update each polyline's physics
    polylines.forEach(polyline => {
        polyline.updatePhysics(deltaTime);
    });

    // Apply attraction between points of different polylines
    if (attraction > 0) {
        const timeScale = deltaTime * 60;
        for (let i = 0; i < allPhysicsPoints.length; i++) {
            for (let j = i + 1; j < allPhysicsPoints.length; j++) {
                const pointA = allPhysicsPoints[i];
                const pointB = allPhysicsPoints[j];

                // Only apply attraction between different polylines
                if (pointA.polylineId !== pointB.polylineId) {
                    const distance = pointA.position.distanceTo(pointB.position);
                    if (distance > 0 && distance < 50) {
                        const force = new THREE.Vector3()
                            .subVectors(pointB.position, pointA.position)
                            .normalize()
                            .multiplyScalar(attraction * (1 - distance / 50) / allPhysicsPoints.length);

                        pointA.applyForce(force.clone().multiplyScalar(0.5 * timeScale));
                        pointB.applyForce(force.clone().multiplyScalar(-0.5 * timeScale));
                    }
                }
            }
        }
    }

    // Update all physics points
    allPhysicsPoints.forEach(point => point.update(deltaTime));

    // Update all visuals
    polylines.forEach(polyline => polyline.updateVisuals());
}

// Mouse move handler for raycasting
function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    raycaster.ray.intersectPlane(basePlane, planeIntersectPoint);

    if (isDrawing && planeIntersectPoint) {
        previewPoint = createPreviewPoint(planeIntersectPoint);
    }
}

// Mouse click handler for placing points
function onPointerClick(event) {
    if (isDrawing && planeIntersectPoint) {
        addPointToPolyline(planeIntersectPoint);
    }
}

// Keyboard handler
function onKeyDown(event) {
    const status = document.getElementById('status');
    
    // 'p' key to start drawing
    if (event.key === 'p' && !isDrawing && !isSimulating) {
        isDrawing = true;
        status.textContent = 'Status: Drawing - Click to add points, "q" to finalize';
    }

    // 'q' key to finalize polyline
    if (event.key === 'q' && isDrawing) {
        finalizePolyline();
    }

    // 'r' key to toggle simulation
    if (event.key === 'r') {
        isSimulating = !isSimulating;
        status.textContent = isSimulating ? 
            'Status: Simulating - Press "r" to pause' : 
            'Status: Paused - Press "r" to resume simulation';
    }

    // 'x' key to reset simulation
    if (event.key === 'x') {
        resetSimulation();
    }
}

// Setup function
export function setup(sceneRef, cameraRef, rendererRef) {
    scene = sceneRef;
    camera = cameraRef;
    renderer = rendererRef;

    // Set up base plane for raycasting
    basePlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0));

    // Add grid helper
    const gridHelper = new THREE.GridHelper(100, 50, 0xcccccc, 0xcccccc);
    scene.add(gridHelper);

    // Create UI
    ui = createUI();

    // Add event listeners
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerClick);
    window.addEventListener('keydown', onKeyDown);

    // Return objects that might need to be cleaned up
    return {
        gridHelper,
        ui: ui.ui,
        status: ui.status
    };
}

// Update function
let lastTime = 0;
export function update(objects) {
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;

    if (isSimulating && deltaTime > 0) {
        updatePhysics(deltaTime);
    }
}