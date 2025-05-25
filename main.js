import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { setup as setupExample, update as updateExample } from './sketches/example_minSrfs.js';

// Create scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff); // White background

// Create camera with 35mm equivalent field of view
const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(10, 10, 10); // Adjusted position for better view of the grid
camera.lookAt(0, 0, 0);

// Create renderer with better quality settings
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Add FPS counter
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild(stats.dom);

// Make stats panel smaller and more subtle
stats.dom.style.transform = 'scale(0.5)';
stats.dom.style.transformOrigin = 'top left';
stats.dom.style.opacity = '0.8';
stats.dom.style.position = 'absolute';
stats.dom.style.top = '0';
stats.dom.style.left = '0';
stats.dom.style.zIndex = '100';

// Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Add smooth damping effect
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 3;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI / 2; // Prevent camera from going below ground

// Add default lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Reduced ambient light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Reduced directional light
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Add a subtle point light for more depth
const pointLight = new THREE.PointLight(0xffffff, 0.6); // Reduced point light
pointLight.position.set(-5, 3, -5);
scene.add(pointLight);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize the current sketch
let currentObjects = setupExample(scene, camera);

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Begin measuring frame time
    stats.begin();
    
    // Update controls
    controls.update();
    
    // Update the current sketch
    updateExample(currentObjects);
    
    renderer.render(scene, camera);
    
    // End measuring frame time
    stats.end();
}

animate(); 