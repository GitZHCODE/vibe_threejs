import * as THREE from 'three';

// Simplified SDF Grid class - just one circle, minimal GPU usage
export class WebGPUSDFGrid {
    constructor(device, gridSize = 50) {
        this.device = device;
        this.gridSize = Math.min(gridSize, 1024); // Small grid
        this.cellSize = 0.5 * (20 / this.gridSize);
        this.circle = null; // Just one circle
        this.isDestroyed = false;
        this.deviceLost = false;
        
        // GPU buffers
        this.sdfBuffer = null;
        this.uniformBuffer = null;
        this.computePipeline = null;
        this.bindGroup = null;
        
        // Three.js visualization components
        this.points = null;
        this.material = new THREE.PointsMaterial({
            size: 0.03, // Increased from 0.03 to 0.1
            vertexColors: true
        });
        
        console.log('Simple SDF Grid initialized with size:', this.gridSize);
        
        // Setup GPU resources
        this.setupGPU();
    }
    
    setupGPU() {
        try {
            // Create SDF buffer
            this.sdfBuffer = this.device.createBuffer({
                size: this.gridSize * this.gridSize * 4, // float32 per cell
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'SDF Field Buffer'
            });
            
            // Create uniform buffer for circle parameters
            this.uniformBuffer = this.device.createBuffer({
                size: 16, // vec4f (x, y, radius, gridSize)
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Circle Uniform Buffer'
            });
            
            // Create compute shader
            this.createComputeShader();
            
        } catch (error) {
            console.error('Failed to setup GPU:', error);
            this.deviceLost = true;
        }
    }
    
    createComputeShader() {
        try {
            const shaderSource = `
struct Uniforms {
    circleX: f32,
    circleY: f32,
    radius: f32,
    gridSize: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> sdfField: array<f32>;

@compute @workgroup_size(8, 8)
fn computeSDF(@builtin(global_invocation_id) id: vec3<u32>) {
    // Early exit if outside grid bounds
    if (id.x >= u32(uniforms.gridSize) || id.y >= u32(uniforms.gridSize)) {
        return;
    }
    
    let index = id.x + id.y * u32(uniforms.gridSize);
    
    // Calculate world position for this grid cell
    let cellSize = 0.5 * (20.0 / uniforms.gridSize);
    let worldX = f32(id.x - u32(uniforms.gridSize) / 2u) * cellSize;
    let worldZ = f32(id.y - u32(uniforms.gridSize) / 2u) * cellSize;
    
    // Compute distance to circle
    let dx = worldX - uniforms.circleX;
    let dz = worldZ - uniforms.circleY;
    let distance = sqrt(dx * dx + dz * dz) - uniforms.radius;
    
    // Store the computed distance
    sdfField[index] = distance;
}
`;
            
            // Create compute pipeline
            this.computePipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: this.device.createShaderModule({
                        code: shaderSource
                    }),
                    entryPoint: 'computeSDF'
                }
            });
            
            // Create bind group
            this.bindGroup = this.device.createBindGroup({
                layout: this.computePipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: { buffer: this.uniformBuffer }
                    },
                    {
                        binding: 1,
                        resource: { buffer: this.sdfBuffer }
                    }
                ]
            });
            
            console.log('GPU compute shader created successfully');
            
        } catch (error) {
            console.error('Failed to create compute shader:', error);
            this.deviceLost = true;
        }
    }
    
    // Set a single circle
    setCircle(centerX, centerY, radius) {
        this.circle = { x: centerX, y: centerY, radius };
        console.log('Circle set:', this.circle);
        
        // Update GPU if available
        if (!this.deviceLost) {
            this.updateGPU();
        }
    }
    
    // Update circle position (for animation)
    updateCirclePosition(centerX, centerY) {
        if (!this.circle) {
            this.setCircle(centerX, centerY, 2.0); // Default radius
            return;
        }
        
        this.circle.x = centerX;
        this.circle.y = centerY;
        
        // Update GPU if available
        if (!this.deviceLost) {
            this.updateGPU();
        }
    }
    
    // Update circle radius
    updateCircleRadius(radius) {
        if (!this.circle) {
            this.setCircle(0, 0, radius);
            return;
        }
        
        this.circle.radius = radius;
        
        // Update GPU if available
        if (!this.deviceLost) {
            this.updateGPU();
        }
    }
    
    // Update circle completely
    updateCircle(centerX, centerY, radius) {
        this.circle = { x: centerX, y: centerY, radius };
        
        // Update GPU if available
        if (!this.deviceLost) {
            this.updateGPU();
        }
    }
    
    updateGPU() {
        if (this.deviceLost || !this.circle || !this.uniformBuffer) return;
        
        try {
            // Update uniform buffer with circle parameters
            const uniformData = new Float32Array([
                this.circle.x,      // circleX
                this.circle.y,      // circleY
                this.circle.radius, // radius
                this.gridSize       // gridSize
            ]);
            
            this.device.queue.writeBuffer(
                this.uniformBuffer,
                0,
                uniformData.buffer,
                uniformData.byteOffset,
                uniformData.byteLength
            );
            
            // Execute compute shader
            this.computeSDF();
            
        } catch (error) {
            console.error('Failed to update GPU:', error);
            this.deviceLost = true;
        }
    }
    
    computeSDF() {
        if (this.deviceLost || !this.computePipeline || !this.bindGroup) return;
        
        try {
            const commandEncoder = this.device.createCommandEncoder();
            const computePass = commandEncoder.beginComputePass();
            
            computePass.setPipeline(this.computePipeline);
            computePass.setBindGroup(0, this.bindGroup);
            
            // Dispatch workgroups
            const workgroupSize = 8;
            const workgroupsX = Math.ceil(this.gridSize / workgroupSize);
            const workgroupsY = Math.ceil(this.gridSize / workgroupSize);
            
            computePass.dispatchWorkgroups(workgroupsX, workgroupsY);
            computePass.end();
            
            this.device.queue.submit([commandEncoder.finish()]);
            
            console.log('GPU SDF computation completed');
            
        } catch (error) {
            console.error('Failed to compute SDF on GPU:', error);
            this.deviceLost = true;
        }
    }
    
    // Create visualization using GPU data if available, fallback to CPU
    createVisualization() {
        if (this.isDestroyed) return null;
        
        // Create geometry
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const x = (i - this.gridSize/2) * this.cellSize;
                const z = (j - this.gridSize/2) * this.cellSize;
                
                // Position
                positions.push(x, 0, z);
                
                // Compute SDF value - use GPU data if available, otherwise CPU
                let distance = 1000.0;
                if (this.circle) {
                    if (!this.deviceLost) {
                        // For now, use CPU computation since reading GPU data is complex
                        // In a full implementation, we'd read from sdfBuffer
                        distance = Math.sqrt(
                            Math.pow(x - this.circle.x, 2) + 
                            Math.pow(z - this.circle.y, 2)
                        ) - this.circle.radius;
                    } else {
                        // CPU fallback
                        distance = Math.sqrt(
                            Math.pow(x - this.circle.x, 2) + 
                            Math.pow(z - this.circle.y, 2)
                        ) - this.circle.radius;
                    }
                }
                
                // Color based on distance value
                if (distance > 0) {
                    colors.push(distance, 0, 0); // Red for positive (outside)
                } else {
                    colors.push(0, 0, -distance); // Blue for negative (inside)
                }
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        this.points = new THREE.Points(geometry, this.material);
        return this.points;
    }
    
    // Update visualization in real-time
    updateVisualization() {
        if (this.isDestroyed || !this.points || !this.circle) return;
        
        // Update colors based on current circle position
        const colors = this.points.geometry.attributes.color.array;
        
        for (let i = 0; i < this.gridSize; i++) {
            for (let j = 0; j < this.gridSize; j++) {
                const x = (i - this.gridSize/2) * this.cellSize;
                const z = (j - this.gridSize/2) * this.cellSize;
                
                // Compute SDF value
                let distance = 1000.0;
                if (this.circle) {
                    if (!this.deviceLost) {
                        // Use CPU computation for now
                        distance = Math.sqrt(
                            Math.pow(x - this.circle.x, 2) + 
                            Math.pow(z - this.circle.y, 2)
                        ) - this.circle.radius;
                    } else {
                        // CPU fallback
                        distance = Math.sqrt(
                            Math.pow(x - this.circle.x, 2) + 
                            Math.pow(z - this.circle.y, 2)
                        ) - this.circle.radius;
                    }
                }
                
                const colorIndex = (i * this.gridSize + j) * 3;
                
                // Update colors
                if (distance > 0) {
                    colors[colorIndex] = distance;     // Red
                    colors[colorIndex + 1] = 0;       // Green
                    colors[colorIndex + 2] = 0;       // Blue
                } else {
                    colors[colorIndex] = 0;           // Red
                    colors[colorIndex + 1] = 0;       // Green
                    colors[colorIndex + 2] = -distance; // Blue
                }
            }
        }
        
        this.points.geometry.attributes.color.needsUpdate = true;
    }
    
    // Update circle visual representations
    updateCircleVisuals(circleRing, filledCircle) {
        if (this.isDestroyed || !this.circle || !circleRing || !filledCircle) return;
        
        // Update ring geometry
        const ringGeometry = new THREE.RingGeometry(
            this.circle.radius - 0.05,
            this.circle.radius + 0.05,
            64
        );
        ringGeometry.rotateX(-Math.PI / 2);
        ringGeometry.translate(this.circle.x, 0, this.circle.y);
        
        circleRing.geometry.dispose();
        circleRing.geometry = ringGeometry;
        
        // Update filled circle geometry
        const circleGeometry = new THREE.CircleGeometry(
            this.circle.radius,
            64
        );
        circleGeometry.rotateX(-Math.PI / 2);
        circleGeometry.translate(this.circle.x, 0, this.circle.y);
        
        filledCircle.geometry.dispose();
        filledCircle.geometry = circleGeometry;
    }
    
    // Create a simple contour
    createContour(threshold = 0, color = 0x00ff00) {
        if (this.isDestroyed || !this.circle) return null;
        
        const vertices = [];
        
        for (let i = 0; i < this.gridSize - 1; i++) {
            for (let j = 0; j < this.gridSize - 1; j++) {
                const x = (i - this.gridSize/2) * this.cellSize;
                const z = (j - this.gridSize/2) * this.cellSize;
                
                // Compute SDF values for this cell
                const v00 = Math.sqrt(Math.pow(x - this.circle.x, 2) + Math.pow(z - this.circle.y, 2)) - this.circle.radius;
                const v10 = Math.sqrt(Math.pow(x + this.cellSize - this.circle.x, 2) + Math.pow(z - this.circle.y, 2)) - this.circle.radius;
                const v11 = Math.sqrt(Math.pow(x + this.cellSize - this.circle.x, 2) + Math.pow(z + this.cellSize - this.circle.y, 2)) - this.circle.radius;
                const v01 = Math.sqrt(Math.pow(x - this.circle.x, 2) + Math.pow(z + this.cellSize - this.circle.y, 2)) - this.circle.radius;
                
                // Simple edge detection
                if ((v00 > threshold) !== (v10 > threshold)) {
                    const t = (threshold - v00) / (v10 - v00);
                    const px = x + t * this.cellSize;
                    const pz = z;
                    vertices.push(px, 0, pz, px, 0, pz);
                }
                
                if ((v10 > threshold) !== (v11 > threshold)) {
                    const t = (threshold - v10) / (v11 - v10);
                    const px = x + this.cellSize;
                    const pz = z + t * this.cellSize;
                    vertices.push(px, 0, pz, px, 0, pz);
                }
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.LineBasicMaterial({ color: color, linewidth: 2 });
        
        return new THREE.LineSegments(geometry, material);
    }
    
    // Create a visual circle representation
    createCircleVisual(color = 0xffff00) {
        if (this.isDestroyed || !this.circle) return null;
        
        // Create a ring geometry to represent the circle
        const ringGeometry = new THREE.RingGeometry(
            this.circle.radius - 0.05, // Inner radius (slightly smaller)
            this.circle.radius + 0.05, // Outer radius (slightly larger)
            64 // Number of segments
        );
        
        // Rotate to lie flat on the XZ plane
        ringGeometry.rotateX(-Math.PI / 2);
        
        // Position at the circle center
        ringGeometry.translate(this.circle.x, 0, this.circle.y);
        
        const material = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.8
        });
        
        return new THREE.Mesh(ringGeometry, material);
    }
    
    // Create a filled circle representation
    createFilledCircle(color = 0xffff00) {
        if (this.isDestroyed || !this.circle) return null;
        
        // Create a circle geometry
        const circleGeometry = new THREE.CircleGeometry(
            this.circle.radius,
            64 // Number of segments
        );
        
        // Rotate to lie flat on the XZ plane
        circleGeometry.rotateX(-Math.PI / 2);
        
        // Position at the circle center
        circleGeometry.translate(this.circle.x, 0, this.circle.y);
        
        const material = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        return new THREE.Mesh(circleGeometry, material);
    }
    
    // Clean up resources
    destroy() {
        if (this.isDestroyed) return;
        
        this.isDestroyed = true;
        
        console.log('Cleaning up Simple SDF Grid...');
        
        // Clean up Three.js resources
        if (this.points) {
            this.points.geometry.dispose();
            this.material.dispose();
            this.points = null;
        }
        
        // Clean up GPU resources
        if (this.sdfBuffer) {
            try {
                this.sdfBuffer.destroy();
            } catch (error) {
                console.warn('Error destroying SDF buffer:', error);
            }
            this.sdfBuffer = null;
        }
        
        if (this.uniformBuffer) {
            try {
                this.uniformBuffer.destroy();
            } catch (error) {
                console.warn('Error destroying uniform buffer:', error);
            }
            this.uniformBuffer = null;
        }
        
        // Clear references
        this.computePipeline = null;
        this.bindGroup = null;
        this.circle = null;
        
        console.log('Simple SDF Grid cleaned up');
    }
}
