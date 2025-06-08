# Vibe Three.js Project (Mapbox + Three.js Branch)

A branch of the main Vibe Three.js project, demonstrating how to integrate **Mapbox GL JS** with **Three.js** for custom 3D models, 3D buildings, and map styling.

![Showcase](/assets/img_mapbox.png)

## Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed on your computer
2. Open a terminal in this project folder
3. Run these commands:
   ```bash
   npm install
   npm start
   ```
4. Open your browser and go to `http://localhost:5173` (or the port shown in your terminal)

## Project Structure

- `index.html` - The main HTML file
- `main.js` - Application entry point, sets up the renderer and animation loop
- `renderers/mapbox_renderer.js` - Handles Mapbox map, custom Three.js layer, 3D buildings, and map styling
- `sketches/` - Directory containing your 3D sketches
  - `example_mapbox.js` - Loads the custom GLTF model and adds a rotating cube
- `assets/img_mapbox.png` - Example screenshot
- `package.json` - Project configuration and dependencies

## Features (Mapbox Branch)
- Mapbox GL JS map as the base
- 3D buildings (white, fully opaque) rendered from Mapbox vector tiles
- Custom 3D model (GLTF) placed at a georeferenced location
- Rotating cube next to the model as an example of custom geometry
- Water and green areas styled for clarity

## How to Create Your Own Sketch

1. Create a new file in the `sketches` folder (e.g., `mySketch.js`)
2. Copy this template:
   ```javascript
   import * as THREE from 'three';

   export function setup(scene, camera) {
       // Create your 3D objects here
       // Return any objects you want to animate
       return { /* your objects */ };
   }

   export function update(objects) {
       // Animate your objects here
   }
   ```
3. To use your sketch, modify the import in `main.js`:
   ```javascript
   import { setup, update } from './sketches/mySketch.js';
   ```

## Customization

### Change the Model Location
Edit the following in `sketches/example_mapbox.js`:
```js
export const MODEL_ORIGIN = [longitude, latitude];
export const MODEL_ALTITUDE = 0; // meters
export const MODEL_ROTATE = [Math.PI / 2, 0, 0]; // [X, Y, Z] radians
```

Find a location:
[Location helper](https://labs.mapbox.com/location-helper/#15.71/31.24417/121.497531)

### Use a Different 3D Model
Replace the GLTF URL in `sketches/example_mapbox.js`:
```js
loader.load('https://your-model-url/model.gltf', ...);
```

### Adjust Map Appearance
- 3D buildings color and opacity: see `add3DBuildingsLayer()` in `renderers/mapbox_renderer.js`
- Water and green area colors: see `setBaseColors()` in `renderers/mapbox_renderer.js`

### Add More Custom Geometry
Add more objects to the Three.js scene in `sketches/example_mapbox.js`.

## Dependencies
- Vite - For development server and live reloading
- Three.js - For 3D graphics
- Mapbox GL JS - For interactive maps and 3D buildings
- npm - For package management

## Notes
- The level of detail for Mapbox 3D buildings is determined by the map's zoom level and Mapbox's vector tile data.
- For best results, use a high-quality GLTF model and adjust lighting as needed.

## License
MIT 