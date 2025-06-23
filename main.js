import { MapboxRenderer } from './renderers/mapbox_renderer.js';
import { setup as setupExample, update as updateExample, MODEL_ORIGIN, MODEL_ALTITUDE, MODEL_ROTATE } from './sketches/example_mapboxAIRender.js';

class Application {
    constructor() {
        this.init();
    }

    init() {
        // Create container
        const container = document.createElement('div');
        container.id = 'container';
        container.style.width = '100%';
        container.style.height = '100vh';
        document.body.appendChild(container);

        // Initialize renderer with model georeference parameters
        this.mapboxRenderer = new MapboxRenderer('container', {
            center: MODEL_ORIGIN,
            altitude: MODEL_ALTITUDE,
            rotation: MODEL_ROTATE,
            // Add preserveDrawingBuffer for canvas capture
            preserveDrawingBuffer: true
        });

        // Wait for the scene to be ready before setting up the sketch
        this.mapboxRenderer.onStyleLoad(() => {
            // Initialize the current sketch
            this.currentObjects = setupExample(
                this.mapboxRenderer.getScene(),
                this.mapboxRenderer.getCamera(),
                this.mapboxRenderer // Pass renderer for canvas access
            );
            // Pass transformation parameters to the renderer
            this.mapboxRenderer.setCurrentObjects(this.currentObjects);
        });

        // Start animation loop
        this.animate();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        // Animate the cube
        if (this.currentObjects) {
            updateExample(this.currentObjects, this.mapboxRenderer.getMap());
        }
    }

    // Add method to get renderer for canvas capture
    getRenderer() {
        return this.mapboxRenderer;
    }

    destroy() {
        this.mapboxRenderer.destroy();
    }
}

// Initialize the application
const app = new Application();

// Make app globally accessible for canvas capture
window.app = app;