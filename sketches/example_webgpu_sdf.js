import * as THREE from 'three';
import { WebGPUSDFGrid } from '../classes/sdf/sdf.js';

// Simple WebGPU SDF Example - Single Circle Field
export async function setup(scene, camera) {
    // Check for WebGPU support
    if (!navigator.gpu) {
        console.error('WebGPU not supported - navigator.gpu is undefined');
        throw new Error('WebGPU not supported - navigator.gpu is undefined');
    }

    console.log('WebGPU available:', !!navigator.gpu);
    console.log('GPU adapter request available:', !!navigator.gpu.requestAdapter);

    try {
        // Initialize WebGPU with specific options
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance',
            forceFallbackAdapter: false
        });
        
        if (!adapter) {
            console.error('No WebGPU adapter found. This could be due to:');
            console.error('1. WebGPU not enabled in Chrome flags');
            console.error('2. Graphics driver issues');
            console.error('3. Hardware not supporting WebGPU');
            throw new Error('No WebGPU adapter found');
        }

        console.log('WebGPU adapter found:', adapter.name);
        console.log('Adapter features:', adapter.features);

        const device = await adapter.requestDevice({
            requiredFeatures: [],
            requiredLimits: {
                maxStorageBufferBindingSize: 1024 * 1024 * 1024, // 1GB
                maxBufferSize: 1024 * 1024 * 1024 // 1GB
            }
        });
        
        console.log('WebGPU device initialized successfully');

        // Create simple SDF grid
        const sdfGrid = new WebGPUSDFGrid(device, 1024); // 50x50 grid
        console.log('SDF Grid initialized');

        // Set a single circle at the center
        sdfGrid.setCircle(0, 0, 2.0);
        console.log('Circle set');

        // Create visualization
        const points = sdfGrid.createVisualization();
        scene.add(points);
        console.log('Visualization created');

        // Add a simple contour at zero threshold
        const contour = sdfGrid.createContour(0.5, 0x00ff00);
        scene.add(contour);
        console.log('Contour created');

        // Add visual circle representations
        const circleRing = sdfGrid.createCircleVisual(0xffff00); // Yellow ring
        //scene.add(circleRing);
        console.log('Circle ring created');

        const filledCircle = sdfGrid.createFilledCircle(0xffff00); // Semi-transparent filled circle
        //scene.add(filledCircle);
        console.log('Filled circle created');

        // Return objects for potential future animation
        return { 
            sdfGrid, 
            points, 
            contour,
            circleRing,
            filledCircle,
            device 
        };

    } catch (error) {
        console.error('Failed to initialize WebGPU SDF:', error);
        throw error; // Re-throw the error instead of creating fallback
    }
}

export function update(objects) {
    // Animate the circle position
    if (objects && objects.sdfGrid) {
        const time = Date.now() * 0.001; // Time in seconds
        
        // Create a circular motion
        const radius = 3.0;
        const speed = 0.5;
        const x = Math.cos(time * speed) * radius;
        const y = Math.sin(time * speed) * radius;
        
        // Update circle position
        objects.sdfGrid.updateCirclePosition(x, y);
        
        // Update visualization
        objects.sdfGrid.updateVisualization();
        
        // Update circle visuals
        if (objects.circleRing && objects.filledCircle) {
            objects.sdfGrid.updateCircleVisuals(objects.circleRing, objects.filledCircle);
        }
    }
}

// Cleanup function for when the sketch is destroyed
export function cleanup(objects) {
    if (objects && objects.sdfGrid) {
        objects.sdfGrid.destroy();
    }
} 