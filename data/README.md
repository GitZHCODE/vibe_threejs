# Latent SDF Data Storage

This folder stores the trained neural network models and associated metadata for the latent SDF examples.

## Contents:
- `latent-sdf-model/` - TensorFlow.js model files (model.json + weight files)
- `latent-sdf-metadata.json` - Training metadata including latent codes and polygon data

## How it works:
1. When you train a model in `example_latentSDF.js`, it downloads:
   - The neural network model files to your Downloads folder
   - Metadata file (`latent-sdf-metadata.json`) to your Downloads folder
   
2. You manually move these files to this `data/` folder

3. When you load `example_latentTower.js`, it reads from these files to reconstruct the trained model

## Setup Instructions:
After training completes, you'll see downloaded files in your Downloads folder:
- `latent-sdf-metadata.json`
- `latent-sdf-model.json` 
- `latent-sdf-model.weights.bin`

**Move these files as follows:**
1. Move `latent-sdf-metadata.json` directly to this `data/` folder
2. Create a subfolder called `latent-sdf-model/` in this `data/` folder
3. Rename `latent-sdf-model.json` to `model.json` and move it to `data/latent-sdf-model/`
4. Rename `latent-sdf-model.weights.bin` to `weights.bin` and move it to `data/latent-sdf-model/`

## Final File Structure:
```
data/
├── README.md (this file)
├── latent-sdf-metadata.json
└── latent-sdf-model/
    ├── model.json
    └── weights.bin
```

## Important Notes:
- You need to serve the project via a local web server (not file:// protocol)
- The examples will fall back to browser storage if files aren't found here
- Make sure file names match exactly as shown above