// WebGPU Buffer Management for SDF Field Computation
// Handles buffer creation, binding, and data management

export class SDFBufferManager {
    constructor(device, gridSize = 200, maxCircles = 100) {
        this.device = device;
        this.gridSize = gridSize;
        this.maxCircles = maxCircles;
        this.cellSize = 0.5 * (20 / gridSize); // Match the original scaling
        
        // Buffer sizes
        this.fieldSize = gridSize * gridSize * 4; // float32 per cell
        this.colorSize = gridSize * gridSize * 16; // vec4f per cell
        this.circleSize = maxCircles * 16; // vec4f per circle
        this.uniformSize = 16; // vec4f for uniforms
        
        this.buffers = {};
        this.bindGroup = null;
        this.computePipeline = null;
        
        this.createBuffers();
    }
    
    createBuffers() {
        // Field buffer - stores SDF values
        this.buffers.field = this.device.createBuffer({
            size: this.fieldSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'SDF Field Buffer'
        });
        
        // Color buffer - stores computed colors
        this.buffers.colors = this.device.createBuffer({
            size: this.colorSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'SDF Color Buffer'
        });
        
        // Circle buffer - stores circle parameters
        this.buffers.circles = this.device.createBuffer({
            size: this.circleSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'SDF Circle Buffer'
        });
        
        // Uniform buffer - stores grid parameters
        this.buffers.uniforms = this.device.createBuffer({
            size: this.uniformSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'SDF Uniform Buffer'
        });
        
        // Staging buffer for reading back data
        this.buffers.staging = this.device.createBuffer({
            size: Math.max(this.fieldSize, this.colorSize),
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label: 'SDF Staging Buffer'
        });
    }
    
    updateUniforms(numCircles) {
        const uniformData = new Float32Array([
            this.gridSize,           // gridSize
            this.cellSize,           // cellSize
            numCircles,              // numCircles
            0.0                      // padding
        ]);
        
        this.device.queue.writeBuffer(
            this.buffers.uniforms,
            0,
            uniformData.buffer,
            uniformData.byteOffset,
            uniformData.byteLength
        );
    }
    
    updateCircles(circles) {
        if (circles.length > this.maxCircles) {
            console.warn(`Too many circles: ${circles.length} > ${this.maxCircles}`);
            circles = circles.slice(0, this.maxCircles);
        }
        
        const circleData = new Float32Array(this.maxCircles * 4);
        
        for (let i = 0; i < circles.length; i++) {
            const circle = circles[i];
            const offset = i * 4;
            circleData[offset] = circle.x;     // center.x
            circleData[offset + 1] = circle.y; // center.y
            circleData[offset + 2] = circle.radius; // radius
            circleData[offset + 3] = 0.0;      // padding
        }
        
        this.device.queue.writeBuffer(
            this.buffers.circles,
            0,
            circleData.buffer,
            circleData.byteOffset,
            circleData.byteLength
        );
        
        this.updateUniforms(circles.length);
    }
    
    clearField() {
        const clearData = new Float32Array(this.gridSize * this.gridSize);
        clearData.fill(1000.0); // Initialize with large distance
        
        this.device.queue.writeBuffer(
            this.buffers.field,
            0,
            clearData.buffer,
            clearData.byteOffset,
            clearData.byteLength
        );
    }
    
    createBindGroup() {
        this.bindGroup = this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.buffers.uniforms }
                },
                {
                    binding: 1,
                    resource: { buffer: this.buffers.field }
                },
                {
                    binding: 2,
                    resource: { buffer: this.buffers.colors }
                },
                {
                    binding: 3,
                    resource: { buffer: this.buffers.circles }
                }
            ]
        });
    }
    
    async readFieldData() {
        try {
            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                this.buffers.field,
                0,
                this.buffers.staging,
                0,
                this.fieldSize
            );
            
            this.device.queue.submit([commandEncoder.finish()]);
            
            // Wait for the device to be ready
            await this.device.queue.onSubmittedWorkDone();
            
            await this.buffers.staging.mapAsync(GPUMapMode.READ);
            const data = new Float32Array(this.buffers.staging.getMappedRange());
            this.buffers.staging.unmap();
            
            return data;
        } catch (error) {
            console.error('Failed to read field data:', error);
            // Return a default array if reading fails
            return new Float32Array(this.gridSize * this.gridSize).fill(1000.0);
        }
    }
    
    async readColorData() {
        try {
            const commandEncoder = this.device.createCommandEncoder();
            commandEncoder.copyBufferToBuffer(
                this.buffers.colors,
                0,
                this.buffers.staging,
                0,
                this.colorSize
            );
            
            this.device.queue.submit([commandEncoder.finish()]);
            
            // Wait for the device to be ready
            await this.device.queue.onSubmittedWorkDone();
            
            await this.buffers.staging.mapAsync(GPUMapMode.READ);
            const data = new Float32Array(this.buffers.staging.getMappedRange());
            this.buffers.staging.unmap();
            
            return data;
        } catch (error) {
            console.error('Failed to read color data:', error);
            // Return a default array if reading fails
            return new Float32Array(this.gridSize * this.gridSize * 4).fill(0.0);
        }
    }
    
    destroy() {
        console.log('Destroying SDF buffer manager...');
        
        // Clean up buffers
        Object.values(this.buffers).forEach(buffer => {
            if (buffer && buffer.destroy) {
                try {
                    buffer.destroy();
                } catch (error) {
                    console.warn('Error destroying buffer:', error);
                }
            }
        });
        
        // Clear references
        this.buffers = {};
        this.bindGroup = null;
        this.computePipeline = null;
        
        console.log('SDF buffer manager destroyed');
    }
}
