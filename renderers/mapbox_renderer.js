import * as THREE from 'three';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class MapboxRenderer {
    constructor(containerId, { center, altitude, rotation }) {
        this.containerId = containerId;
        this.center = center;
        this.altitude = altitude;
        this.rotation = rotation;
        this.map = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.customLayer = null;
        this.onStyleLoadCallbacks = [];
        this.currentObjects = null;
        
        this.init();
    }

    setCurrentObjects(objects) {
        this.currentObjects = objects;
    }

    init() {
        // Set Mapbox access token
        mapboxgl.accessToken = 'pk.eyJ1IjoidGFpY2hvbmciLCJhIjoiY2tuY2xpaThsMTgzODJ2bWx1aWF0dWwxdCJ9.lUkqwq7VdNb9gvm-8Iz_EQ';

        // Initialize Mapbox map
        this.map = new mapboxgl.Map({
            container: this.containerId,
            style: 'mapbox://styles/mapbox/light-v11',
            zoom: 18,
            center: this.center,
            pitch: 60,
            antialias: true
        });

        // Create custom layer for Three.js
        this.customLayer = {
            id: 'threejs-layer',
            type: 'custom',
            renderingMode: '3d',
            onAdd: (map, gl) => {
                this.camera = new THREE.Camera();
                this.scene = new THREE.Scene();

                // Add lights
                const directionalLight = new THREE.DirectionalLight(0xffffff);
                directionalLight.position.set(0, -70, 100).normalize();
                this.scene.add(directionalLight);

                const directionalLight2 = new THREE.DirectionalLight(0xffffff);
                directionalLight2.position.set(0, 70, 100).normalize();
                this.scene.add(directionalLight2);

                // Setup renderer
                this.renderer = new THREE.WebGLRenderer({
                    canvas: map.getCanvas(),
                    context: gl,
                    antialias: true
                });
                this.renderer.autoClear = false;

                // Notify that the scene is ready
                this.onStyleLoadCallbacks.forEach(callback => callback());
            },
            render: (gl, matrix) => {
                if (!this.scene || !this.camera) return;

                // Use transformation parameters from the sketch if available, otherwise use constructor values
                const modelOrigin = (this.currentObjects && this.currentObjects.modelOrigin) || this.center;
                const modelAltitude = (this.currentObjects && this.currentObjects.modelAltitude) || this.altitude;
                const modelRotate = (this.currentObjects && this.currentObjects.modelRotate) || this.rotation;

                const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
                    modelOrigin,
                    modelAltitude
                );

                const modelTransform = {
                    translateX: modelAsMercatorCoordinate.x,
                    translateY: modelAsMercatorCoordinate.y,
                    translateZ: modelAsMercatorCoordinate.z,
                    rotateX: modelRotate[0],
                    rotateY: modelRotate[1],
                    rotateZ: modelRotate[2],
                    scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()
                };

                const rotationX = new THREE.Matrix4().makeRotationAxis(
                    new THREE.Vector3(1, 0, 0), modelTransform.rotateX
                );
                const rotationY = new THREE.Matrix4().makeRotationAxis(
                    new THREE.Vector3(0, 1, 0), modelTransform.rotateY
                );
                const rotationZ = new THREE.Matrix4().makeRotationAxis(
                    new THREE.Vector3(0, 0, 1), modelTransform.rotateZ
                );

                const m = new THREE.Matrix4().fromArray(matrix);
                const l = new THREE.Matrix4()
                    .makeTranslation(
                        modelTransform.translateX,
                        modelTransform.translateY,
                        modelTransform.translateZ
                    )
                    .scale(
                        new THREE.Vector3(
                            modelTransform.scale,
                            -modelTransform.scale,
                            modelTransform.scale
                        )
                    )
                    .multiply(rotationX)
                    .multiply(rotationY)
                    .multiply(rotationZ);

                this.camera.projectionMatrix = m.multiply(l);
                this.renderer.resetState();
                this.renderer.render(this.scene, this.camera);
                this.map.triggerRepaint();
            }
        };

        // Add the custom layer and 3D buildings when the style is loaded
        this.map.on('style.load', () => {
            // Style green areas and water
            this.setBaseColors();
            // Add custom Three.js layer
            this.map.addLayer(this.customLayer, 'waterway-label');
            // Add 3D buildings layer (white)
            this.add3DBuildingsLayer();
        });
    }

    setBaseColors() {
        // Set water to blue and green areas to green
        const style = this.map.getStyle();
        if (!style) return;
        // Water
        this.map.setPaintProperty('water', 'fill-color', '#a0c8f0');
        // Parks/green
        const greenLayers = ['landcover', 'landuse', 'park', 'landcover-grass', 'landcover-wood', 'landcover-grassland'];
        greenLayers.forEach(layerId => {
            try {
                this.map.setPaintProperty(layerId, 'fill-color', '#b6e3a1');
            } catch (e) {}
        });
    }

    add3DBuildingsLayer() {
        // Add 3D buildings layer (white)
        this.map.addLayer({
            'id': '3d-buildings',
            'source': 'composite',
            'source-layer': 'building',
            'filter': ['==', 'extrude', 'true'],
            'type': 'fill-extrusion',
            'minzoom': 15,
            'paint': {
                'fill-extrusion-color': '#fff',
                'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.05,
                    ['get', 'height']
                ],
                'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    15,
                    0,
                    15.05,
                    ['get', 'min_height']
                ],
                'fill-extrusion-opacity': 1
            }
        }, 'threejs-layer');
    }

    onStyleLoad(callback) {
        if (this.scene) {
            callback();
        } else {
            this.onStyleLoadCallbacks.push(callback);
        }
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    getMap() {
        return this.map;
    }

    destroy() {
        if (this.map) {
            this.map.remove();
        }
    }
} 