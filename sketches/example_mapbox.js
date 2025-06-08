import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Location helper
// https://labs.mapbox.com/location-helper/#15.71/31.24417/121.497531

// Model georeference parameters
export const MODEL_ORIGIN = [121.49676, 31.24319];
export const MODEL_ALTITUDE = 0;
export const MODEL_ROTATE = [Math.PI / 2, 0, 0];

export function setup(scene, camera) {
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const loader = new GLTFLoader();
    loader.load(
        'https://docs.mapbox.com/mapbox-gl-js/assets/34M_17/34M_17.gltf',
        (gltf) => {
            modelGroup.add(gltf.scene);
        }
    );

    // Rotating cube
    const cubeSize = 20;
    const cubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    // Offset the cube in X (east) by 60 meters (in model units)
    cube.position.set(60, 0, cubeSize / 2);
    scene.add(cube);

    // Return transformation parameters for use in the renderer
    return {
        modelGroup,
        modelOrigin: MODEL_ORIGIN,
        modelAltitude: MODEL_ALTITUDE,
        modelRotate: MODEL_ROTATE,
        cube
    };
}

export function update(objects, map) {
    // Animate the cube rotation
    if (objects && objects.cube) {
        objects.cube.rotation.y += 0.01;
        objects.cube.rotation.x += 0.005;
    }
} 