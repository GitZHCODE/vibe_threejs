import * as THREE from 'three';
import { ComfyUIService } from '../services/comfyui_service.js';
import { AIRenderUI } from '../ui/ai_render_ui.js';

// Model georeference parameters
export const MODEL_ORIGIN = [121.5654, 25.0330]; // Taipei coordinates
export const MODEL_ALTITUDE = 0;
export const MODEL_ROTATE = [Math.PI / 2, 0, 0];

let cube, aiService, uiController, imageDisplay, renderer;
let isAIRenderEnabled = false;
let lastProcessTime = 0;
const PROCESS_INTERVAL = 5000; // Process every 5 seconds

export function setup(scene, camera, mapboxRenderer) {
    // Store renderer reference
    renderer = mapboxRenderer;
    
    // Create a rotating cube
    const geometry = new THREE.BoxGeometry(100, 100, 100);
    const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 100, 100);
    scene.add(light);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    // Initialize AI service
    aiService = new ComfyUIService();
    
    // Initialize UI with image display
    uiController = new AIRenderUI(onAIRenderToggle, onAIRenderTrigger);
    createImageDisplay();

    return { cube, aiService, uiController, renderer };
}

export function update(objects, map) {
    // Rotate the cube
    if (objects.cube) {
        objects.cube.rotation.x += 0.01;
        objects.cube.rotation.y += 0.01;
    }

    // Capture and process frame if AI rendering is enabled and enough time has passed
    const now = Date.now();
    if (isAIRenderEnabled && objects.aiService && (now - lastProcessTime) > PROCESS_INTERVAL) {
        lastProcessTime = now;
        captureAndProcessFrame(objects);
    }
}

function createImageDisplay() {
    // Create image overlay container
    imageDisplay = document.createElement('div');
    imageDisplay.id = 'ai-image-display';
    imageDisplay.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 8px;
        padding: 10px;
        z-index: 1000;
        display: none;
        max-width: 400px;
        max-height: 300px;
    `;

    // Create image element
    const img = document.createElement('img');
    img.id = 'ai-output-image';
    img.style.cssText = `
        width: 100%;
        height: auto;
        border-radius: 4px;
        display: block;
    `;

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 5px;
        right: 10px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeBtn.onclick = () => hideImageDisplay();

    imageDisplay.appendChild(img);
    imageDisplay.appendChild(closeBtn);
    document.body.appendChild(imageDisplay);
}

function showImageDisplay(imageBlob) {
    const img = document.getElementById('ai-output-image');
    const imageUrl = URL.createObjectURL(imageBlob);
    
    img.onload = () => {
        // Clean up previous object URL
        const oldSrc = img.getAttribute('data-old-src');
        if (oldSrc) {
            URL.revokeObjectURL(oldSrc);
        }
        img.setAttribute('data-old-src', imageUrl);
    };
    
    img.src = imageUrl;
    imageDisplay.style.display = 'block';
}

function hideImageDisplay() {
    imageDisplay.style.display = 'none';
    
    // Clean up object URL
    const img = document.getElementById('ai-output-image');
    const oldSrc = img.getAttribute('data-old-src');
    if (oldSrc) {
        URL.revokeObjectURL(oldSrc);
        img.removeAttribute('data-old-src');
    }
}

function onAIRenderToggle(enabled) {
    isAIRenderEnabled = enabled;
    uiController.updateStatus(enabled ? 'Auto-render enabled' : 'Auto-render disabled');
    console.log(`AI Render ${enabled ? 'enabled' : 'disabled'}`);
}

function onAIRenderTrigger() {
    if (!aiService) {
        uiController.updateStatus('Error: AI service not initialized');
        return;
    }
    
    console.log('Manual AI render triggered');
    uiController.updateStatus('Processing...');
    captureAndProcessFrame({ cube, aiService });
}

async function captureAndProcessFrame(objects) {
    try {
        uiController.updateStatus('Capturing frame...');
        
        // Force a render before capture
        if (objects.renderer && objects.renderer.render) {
            objects.renderer.render();
        }
        
        // Wait a frame to ensure render is complete
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Get the Mapbox/Three.js canvas - try multiple selectors
        let canvas = document.querySelector('#container canvas');
        if (!canvas) {
            canvas = document.querySelector('canvas[data-engine="three.js"]');
        }
        if (!canvas) {
            // Get all canvases and find the largest one (likely the main render canvas)
            const canvases = Array.from(document.querySelectorAll('canvas'));
            canvas = canvases.reduce((largest, current) => {
                const largestArea = (largest?.width || 0) * (largest?.height || 0);
                const currentArea = (current?.width || 0) * (current?.height || 0);
                return currentArea > largestArea ? current : largest;
            }, null);
        }
        
        if (!canvas) {
            uiController.updateStatus('Error: Canvas not found');
            console.error('Available canvases:', document.querySelectorAll('canvas'));
            return;
        }

        console.log('Found canvas:', {
            width: canvas.width,
            height: canvas.height,
            clientWidth: canvas.clientWidth,
            clientHeight: canvas.clientHeight,
            id: canvas.id,
            className: canvas.className
        });
        
        // Check if canvas has content by getting pixel data
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, 1, 1);
            console.log('Canvas pixel sample:', imageData.data);
        }

        // Use different capture methods based on canvas type
        if (canvas.getContext) {
            // Standard canvas capture
            captureStandardCanvas(canvas, objects);
        } else {
            // WebGL canvas - try different approach
            captureWebGLCanvas(canvas, objects);
        }
        
    } catch (error) {
        console.error('Error capturing frame:', error);
        uiController.updateStatus(`Error: ${error.message}`);
    }
}

function captureStandardCanvas(canvas, objects) {
    canvas.toBlob(async (blob) => {
        if (!blob || blob.size === 0) {
            console.error('Empty blob captured');
            uiController.updateStatus('Error: Captured empty image');
            return;
        }
        
        console.log('Captured blob size:', blob.size, 'bytes');
        await processBlob(blob, objects);
    }, 'image/png'); // Use PNG to avoid compression artifacts
}

function captureWebGLCanvas(canvas, objects) {
    try {
        // For WebGL canvases, create a new canvas and copy the data
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = canvas.width;
        captureCanvas.height = canvas.height;
        
        const ctx = captureCanvas.getContext('2d');
        
        // Try to draw the WebGL canvas
        ctx.drawImage(canvas, 0, 0);
        
        captureCanvas.toBlob(async (blob) => {
            if (!blob || blob.size === 0) {
                console.error('Empty WebGL blob captured');
                uiController.updateStatus('Error: Captured empty WebGL image');
                return;
            }
            
            console.log('Captured WebGL blob size:', blob.size, 'bytes');
            await processBlob(blob, objects);
        }, 'image/png');
        
    } catch (error) {
        console.error('WebGL capture failed:', error);
        uiController.updateStatus('Error: WebGL capture failed');
    }
}

async function processBlob(blob, objects) {
    try {
        uiController.updateStatus('Uploading to ComfyUI...');
        
        // Send to ComfyUI for processing
        const processedImage = await objects.aiService.processImage(blob);
        
        if (processedImage) {
            uiController.updateStatus('AI render complete - Click to view');
            showImageDisplay(processedImage);
        } else {
            uiController.updateStatus('Error: No result from ComfyUI');
        }
        
    } catch (error) {
        console.error('Error processing with AI:', error);
        if (error.message.includes('CORS')) {
            uiController.updateStatus('Error: CORS - Start ComfyUI with --enable-cors-header');
        } else {
            uiController.updateStatus(`Error: ${error.message}`);
        }
    }
}
