# Vibe Three.js Project

A simple Three.js project for students to learn and experiment with 3D graphics.

## Setup

1. Make sure you have [Node.js](https://nodejs.org/) installed on your computer
2. Open a terminal in this project folder
3. Run these commands:
   ```bash
   npm install
   npm start
   ```
4. Open your browser and go to `http://localhost:5173`

## Project Structure

- `index.html` - The main HTML file
- `main.js` - The main JavaScript file where you can edit the Three.js code
- `package.json` - Project configuration and dependencies

## How to Edit

1. Open `main.js` in your code editor
2. Make changes to the code
3. Save the file
4. The browser will automatically refresh with your changes

## Example Modifications

Try these simple changes in `main.js`:
- Change the cube color: Modify the `color` value in `MeshBasicMaterial`
- Change the rotation speed: Modify the values in `cube.rotation.x` and `cube.rotation.y`
- Add more objects: Create new geometries and add them to the scene

## Dependencies

- Three.js - For 3D graphics
- Vite - For development server and live reloading 