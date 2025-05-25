import * as THREE from 'three';

// Example sketch - A rotating cube with shadows
export function setup(scene, camera) {
    // Create a ground plane
    const groundGeometry = new THREE.PlaneGeometry(10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color('#e0e0e0'), // Using THREE.Color
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    ground.position.y = -2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create a cube with better materials
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const material = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color('#FFC0CB'), // Using THREE.Color
        roughness: 0.2,  // Reduced roughness for more shine
        metalness: 0.1,  // Reduced metalness to keep the pink color
        emissive: new THREE.Color('#FFC0CB'), // Add emissive to make it glow slightly
        emissiveIntensity: 0.2 // Subtle glow
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;
    scene.add(cube);
    
    // Return any objects you want to animate
    return { cube };
}

export function update(objects) {
    // Animate the cube
    objects.cube.rotation.x += 0.01;
    objects.cube.rotation.y += 0.01;
    
    // Add a gentle floating motion
    objects.cube.position.y = Math.sin(Date.now() * 0.001) * 0.5;
} 