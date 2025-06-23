export class ComfyUIService {
    constructor(baseUrl = 'http://127.0.0.1:8188') {
        this.baseUrl = baseUrl;
        this.clientId = this.generateClientId();
        this.workflow = null;
        this.isConnected = false;
        this.wsRetryCount = 0;
        this.maxRetries = 3;
        this.loadWorkflow();
        this.setupWebSocket();
    }

    async loadWorkflow() {
        try {
            const response = await fetch('./workflows/ComfyUI_01568_ (2).json');
            this.workflow = await response.json();
            console.log('ComfyUI workflow loaded successfully');
        } catch (error) {
            console.error('Failed to load ComfyUI workflow:', error);
        }
    }

    generateClientId() {
        return Math.random().toString(36).substring(2, 15);
    }

    setupWebSocket() {
        try {
            this.ws = new WebSocket(`ws://127.0.0.1:8188/ws?clientId=${this.clientId}`);
            
            this.ws.onopen = () => {
                console.log('Connected to ComfyUI WebSocket');
                this.isConnected = true;
                this.wsRetryCount = 0; // Reset retry count on successful connection
            };

            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            };

            this.ws.onerror = (error) => {
                console.error('ComfyUI WebSocket error:', error);
                this.isConnected = false;
                
                // Try to retry connection
                if (this.wsRetryCount < this.maxRetries) {
                    this.wsRetryCount++;
                    console.log(`Retrying WebSocket connection (${this.wsRetryCount}/${this.maxRetries})...`);
                    setTimeout(() => this.setupWebSocket(), 2000);
                } else {
                    console.warn('WebSocket connection failed. Will continue with HTTP-only mode.');
                    this.isConnected = false; // Allow HTTP requests without WebSocket
                }
            };

            this.ws.onclose = (event) => {
                this.isConnected = false;
                console.log('ComfyUI WebSocket disconnected:', event.code, event.reason);
                
                // Only retry if it wasn't a clean close
                if (event.code !== 1000 && this.wsRetryCount < this.maxRetries) {
                    this.wsRetryCount++;
                    console.log(`Reconnecting WebSocket (${this.wsRetryCount}/${this.maxRetries})...`);
                    setTimeout(() => this.setupWebSocket(), 2000);
                }
            };
        } catch (error) {
            console.error('Failed to setup WebSocket:', error);
            this.isConnected = false;
        }
    }

    handleWebSocketMessage(data) {
        if (data.type === 'executed' && data.data.node) {
            console.log('ComfyUI node executed:', data.data.node);
        }
    }

    async processImage(imageBlob) {
        // Remove WebSocket dependency - we can work with just HTTP
        try {
            // Upload image to ComfyUI
            const uploadResult = await this.uploadImage(imageBlob);
            if (!uploadResult || !uploadResult.name) {
                throw new Error('Failed to upload image to ComfyUI');
            }

            // Queue workflow with uploaded image
            const workflow = this.createWorkflow(uploadResult.name);
            const queueResult = await this.queuePrompt(workflow);
            
            if (!queueResult.prompt_id) {
                throw new Error('Failed to queue workflow');
            }

            // Wait for completion and get result
            return await this.waitForResult(queueResult.prompt_id);
            
        } catch (error) {
            if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
                throw new Error('CORS error: Start ComfyUI with: python main.py --enable-cors-header');
            }
            console.error('Error processing image:', error);
            throw error;
        }
    }

    async uploadImage(imageBlob) {
        const formData = new FormData();
        formData.append('image', imageBlob, 'threejs_capture.jpg');
        formData.append('type', 'input');
        formData.append('overwrite', 'true');

        try {
            const response = await fetch(`${this.baseUrl}/upload/image`, {
                method: 'POST',
                body: formData,
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                throw new Error('CORS error: Start ComfyUI with --enable-cors-header flag');
            }
            throw error;
        }
    }

    createWorkflow(inputImageName) {
        if (!this.workflow) {
            throw new Error('Workflow not loaded');
        }

        // Clone the workflow to avoid modifying the original
        const workflow = JSON.parse(JSON.stringify(this.workflow));
        
        // Update the input image in node 224 (ControlNet IMG)
        workflow["224"].inputs.image = inputImageName;
        
        // Get actual canvas dimensions - try multiple methods
        let canvas = document.querySelector('#container canvas');
        if (!canvas) {
            canvas = document.querySelector('canvas[width]'); // Canvas with actual dimensions
        }
        if (!canvas) {
            canvas = document.querySelector('canvas');
        }
        
        const width = canvas ? (canvas.width || canvas.clientWidth || 1024) : 1024;
        const height = canvas ? (canvas.height || canvas.clientHeight || 768) : 768;
        
        console.log('Canvas found:', canvas);
        console.log('Canvas dimensions:', { 
            width: canvas?.width, 
            height: canvas?.height, 
            clientWidth: canvas?.clientWidth, 
            clientHeight: canvas?.clientHeight 
        });

        // Update all size-related nodes to match captured image
        if (workflow["163"]) { // EmptyLatentImage
            workflow["163"].inputs.width = width;
            workflow["163"].inputs.height = height;
        }
        if (workflow["155"]) { // CLIPTextEncodeSDXL base
            workflow["155"].inputs.width = width;
            workflow["155"].inputs.height = height;
            workflow["155"].inputs.target_width = width;
            workflow["155"].inputs.target_height = height;
        }
        if (workflow["160"]) { // CLIPTextEncodeSDXL negative
            workflow["160"].inputs.width = width;
            workflow["160"].inputs.height = height;
            workflow["160"].inputs.target_width = width;
            workflow["160"].inputs.target_height = height;
        }
        if (workflow["156"]) { // CLIPTextEncodeSDXLRefiner
            workflow["156"].inputs.width = width;
            workflow["156"].inputs.height = height;
        }
        if (workflow["161"]) { // CLIPTextEncodeSDXLRefiner negative
            workflow["161"].inputs.width = width;
            workflow["161"].inputs.height = height;
        }
        
        // Optionally randomize seed for variation
        const randomSeed = Math.floor(Math.random() * 1000000000000000);
        workflow["162"].inputs.noise_seed = randomSeed;
        workflow["164"].inputs.noise_seed = randomSeed;
        
        console.log(`Updated workflow dimensions: ${width}x${height}`);
        return workflow;
    }

    async queuePrompt(workflow) {
        try {
            const response = await fetch(`${this.baseUrl}/prompt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: workflow,
                    client_id: this.clientId
                }),
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error queueing prompt:', error);
            throw error;
        }
    }

    async waitForResult(promptId) {
        // Poll for completion using HTTP instead of WebSocket
        let attempts = 0;
        const maxAttempts = 60; // Increase timeout for complex workflows
        const pollInterval = 2000; // Check every 2 seconds

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            try {
                const history = await this.getHistory(promptId);
                
                // Check if the prompt exists and is completed
                if (history[promptId]) {
                    const status = history[promptId].status;
                    
                    if (status && status.completed) {
                        return await this.getOutputImage(promptId);
                    }
                    
                    // Check for errors
                    if (status && status.status_str === 'error') {
                        throw new Error(`ComfyUI workflow failed: ${JSON.stringify(status.messages)}`);
                    }
                }
                
                attempts++;
                console.log(`Waiting for ComfyUI result... (${attempts}/${maxAttempts})`);
                
            } catch (error) {
                console.error('Error checking workflow status:', error);
                attempts++;
            }
        }

        throw new Error('Timeout waiting for ComfyUI result');
    }

    async getHistory(promptId) {
        try {
            const response = await fetch(`${this.baseUrl}/history/${promptId}`, {
                mode: 'cors'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error fetching history:', error);
            throw error;
        }
    }

    async getOutputImage(promptId) {
        const history = await this.getHistory(promptId);
        const outputs = history[promptId]?.outputs;
        
        if (outputs) {
            // First try to get upscaled image from node 280
            if (outputs["280"] && outputs["280"].images && outputs["280"].images.length > 0) {
                const imageName = outputs["280"].images[0].filename;
                const response = await fetch(`${this.baseUrl}/view?filename=${imageName}`);
                return await response.blob();
            }
            
            // Fallback to regular output from node 172
            if (outputs["172"] && outputs["172"].images && outputs["172"].images.length > 0) {
                const imageName = outputs["172"].images[0].filename;
                const response = await fetch(`${this.baseUrl}/view?filename=${imageName}`);
                return await response.blob();
            }
        }
        
        return null;
    }

    destroy() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
