export class AIRenderUI {
    constructor(onToggle, onTrigger) {
        this.onToggle = onToggle;
        this.onTrigger = onTrigger;
        this.createUI();
    }

    createUI() {
        // Create UI container
        this.container = document.createElement('div');
        this.container.id = 'ai-render-ui';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            z-index: 1000;
            min-width: 250px;
            max-width: 320px;
        `;

        // Title
        const title = document.createElement('h3');
        title.textContent = 'ComfyUI AI Render';
        title.style.margin = '0 0 15px 0';
        this.container.appendChild(title);

        // Setup instructions
        const instructions = document.createElement('div');
        instructions.style.cssText = `
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(255, 193, 7, 0.2);
            border-radius: 4px;
            font-size: 11px;
            border-left: 3px solid #ffc107;
        `;
        instructions.innerHTML = `
            <strong>Setup:</strong><br>
            Start ComfyUI with:<br>
            <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 2px;">python main.py --enable-cors-header</code>
        `;
        this.container.appendChild(instructions);

        // Auto-render toggle
        const toggleContainer = document.createElement('div');
        toggleContainer.style.marginBottom = '15px';

        const toggleLabel = document.createElement('label');
        toggleLabel.style.display = 'block';
        toggleLabel.style.marginBottom = '5px';
        toggleLabel.textContent = 'Auto AI Render (5s interval):';

        this.toggleCheckbox = document.createElement('input');
        this.toggleCheckbox.type = 'checkbox';
        this.toggleCheckbox.addEventListener('change', (e) => {
            this.onToggle(e.target.checked);
        });

        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(this.toggleCheckbox);
        this.container.appendChild(toggleContainer);

        // Manual trigger button
        this.triggerButton = document.createElement('button');
        this.triggerButton.textContent = 'Trigger AI Render Now';
        this.triggerButton.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 10px;
        `;
        this.triggerButton.addEventListener('click', () => {
            this.onTrigger();
        });

        this.container.appendChild(this.triggerButton);

        // View result button
        this.viewResultButton = document.createElement('button');
        this.viewResultButton.textContent = 'View Last Result';
        this.viewResultButton.style.cssText = `
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 15px;
            display: none;
        `;
        this.viewResultButton.addEventListener('click', () => {
            const imageDisplay = document.getElementById('ai-image-display');
            if (imageDisplay) {
                imageDisplay.style.display = 'block';
            }
        });

        this.container.appendChild(this.viewResultButton);

        // Workflow info
        const workflowInfo = document.createElement('div');
        workflowInfo.style.cssText = `
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            font-size: 11px;
        `;
        workflowInfo.innerHTML = `
            <strong>Workflow:</strong> ControlNet + LoRA<br>
            <strong>Output:</strong> 1600x904 upscaled<br>
            <strong>Style:</strong> Zaha Hadid Architecture
        `;
        this.container.appendChild(workflowInfo);

        // Status display
        this.statusDiv = document.createElement('div');
        this.statusDiv.style.cssText = `
            padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            font-size: 12px;
            border-left: 3px solid #007bff;
            word-wrap: break-word;
        `;
        this.statusDiv.textContent = 'Status: Ready';
        this.container.appendChild(this.statusDiv);

        // Debug button for canvas detection
        const debugButton = document.createElement('button');
        debugButton.textContent = 'Debug Canvas';
        debugButton.style.cssText = `
            background: #6c757d;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 10px;
            font-size: 12px;
        `;
        debugButton.addEventListener('click', () => {
            this.debugCanvas();
        });

        this.container.appendChild(debugButton);

        document.body.appendChild(this.container);
    }

    updateStatus(status) {
        if (this.statusDiv) {
            this.statusDiv.textContent = `Status: ${status}`;
            
            // Show/hide view result button
            if (status.includes('complete')) {
                this.viewResultButton.style.display = 'block';
                this.statusDiv.style.borderLeftColor = '#28a745';
            } else if (status.includes('Error')) {
                this.viewResultButton.style.display = 'none';
                this.statusDiv.style.borderLeftColor = '#dc3545';
            } else if (status.includes('Processing') || status.includes('Uploading')) {
                this.statusDiv.style.borderLeftColor = '#ffc107';
            } else {
                this.statusDiv.style.borderLeftColor = '#007bff';
            }
        }
    }

    debugCanvas() {
        const canvases = document.querySelectorAll('canvas');
        console.log('Found canvases:', canvases.length);
        
        canvases.forEach((canvas, index) => {
            console.log(`Canvas ${index}:`, {
                width: canvas.width,
                height: canvas.height,
                clientWidth: canvas.clientWidth,
                clientHeight: canvas.clientHeight,
                id: canvas.id,
                className: canvas.className,
                parent: canvas.parentElement?.id || 'no-parent-id'
            });
        });
        
        const container = document.querySelector('#container');
        if (container) {
            console.log('Container found:', container);
            const containerCanvas = container.querySelector('canvas');
            console.log('Container canvas:', containerCanvas);
        }
        
        this.updateStatus(`Debug: Found ${canvases.length} canvas elements - Check console`);
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
