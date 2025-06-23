# Vibe Three.js - Latent SDF Training

An interactive auto-decoder training system for SDF (Signed Distance Field) shapes using Three.js and TensorFlow.js.

## Features

- **Interactive Polygon Drawing**: Click on the ground plane to draw custom polygons
- **SDF Generation**: Converts drawn polygons into signed distance fields
- **Auto-Decoder Training**: Trains a neural network to encode shapes into a 2D latent space
- **Latent Space Visualization**: Shows how the latent space maps to different SDF shapes
- **Real-time Training**: All training happens in the browser using TensorFlow.js

## How to Use

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```

3. **Draw Polygons**:
   - Click "Draw Polygon" button
   - Click on the ground plane to add points
   - Press Enter to finish the polygon
   - Press Escape to cancel current drawing
   - Draw multiple different shapes

4. **Train the Model**:
   - Click "Train Model" after drawing several polygons
   - Wait for training to complete (1000 epochs)
   - Watch the latent space visualization update

5. **Explore Results**:
   - The grid shows how different points in the 2D latent space map to different SDF shapes
   - Each grid cell represents a point in latent space and its corresponding generated shape

## Controls

- **Mouse**: Orbit around the scene
- **Scroll**: Zoom in/out
- **Click**: Add polygon points when drawing
- **Enter**: Finish current polygon
- **Escape**: Cancel current drawing

## Technical Details

- **SDF Resolution**: 64x64 grid
- **Latent Dimensions**: 2D (for easy visualization)
- **Network Architecture**: 
  - Input: 2D latent code
  - Hidden: 128 → 256 → 512 neurons (ReLU)
  - Output: 4096 values (64×64 SDF, sigmoid activation)
- **Training**: Auto-decoder with learnable latent codes per shape
- **Visualization**: 10×10 grid showing latent space interpolation

## Files

- `main.js`: Main application setup with Three.js scene
- `sketches/example_latentSDF.js`: Core implementation of the auto-decoder system
- `train/train.py`: Original Python reference implementation
- `sketches/example_sdf.js`: Original SDF visualization example

## Architecture

The system implements an auto-decoder architecture similar to DeepSDF:
1. Each input shape gets a unique learnable latent code
2. The decoder network maps latent codes to SDF values
3. Both the decoder weights and latent codes are optimized during training
4. After training, we can interpolate in latent space to generate new shapes