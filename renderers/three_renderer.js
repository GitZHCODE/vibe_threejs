import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';

export class ThreeRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.init();
    }

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = null; // Make background transparent

        // Create camera
        this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(10, 10, 10);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true // Enable transparency
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Position the renderer on top of Mapbox
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through to Mapbox
        this.renderer.domElement.style.zIndex = '1'; // Ensure it's above Mapbox
        document.getElementById(this.containerId).appendChild(this.renderer.domElement);

        // Add orbit controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 3;
        this.controls.maxDistance = 20;
        this.controls.maxPolarAngle = Math.PI / 2;
        this.controls.domElement.style.pointerEvents = 'auto'; // Enable controls interaction
        this.controls.domElement.style.zIndex = '2'; // Ensure controls are above everything

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Add stats
        this.stats = new Stats();
        this.stats.showPanel(0);
        this.stats.dom.style.transform = 'scale(0.5)';
        this.stats.dom.style.transformOrigin = 'top left';
        this.stats.dom.style.opacity = '0.8';
        this.stats.dom.style.position = 'absolute';
        this.stats.dom.style.top = '0';
        this.stats.dom.style.left = '0';
        this.stats.dom.style.zIndex = '3'; // Ensure stats are above everything
        document.body.appendChild(this.stats.dom);

        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    syncWithMapbox(mapState) {
        if (!mapState) return;

        const { center, zoom, pitch, bearing } = mapState;
        
        // Convert Mapbox coordinates to Three.js coordinates
        const x = center.lng;
        const y = center.lat;
        const z = zoom * 0.1; // Scale zoom to a reasonable range

        // Update camera position
        this.camera.position.set(x, y, z);

        // Convert Mapbox pitch and bearing to Three.js rotation
        const pitchRad = THREE.MathUtils.degToRad(pitch);
        const bearingRad = THREE.MathUtils.degToRad(bearing);

        // Update camera rotation
        this.camera.rotation.set(
            pitchRad,
            bearingRad,
            0,
            'YXZ' // Use YXZ order to match Mapbox's coordinate system
        );

        // Update controls target
        this.controls.target.set(x, y, 0);
        this.controls.update();
    }

    render() {
        this.stats.begin();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.stats.end();
    }

    destroy() {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.domElement.remove();
        }
        if (this.stats) {
            this.stats.dom.remove();
        }
    }
} 