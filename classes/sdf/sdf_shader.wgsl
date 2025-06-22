// WebGPU Compute Shader for SDF Field Computation
// This shader computes signed distance field values and colors for a grid of circles

struct Uniforms {
    gridSize: f32,
    cellSize: f32,
    numCircles: u32,
    padding: u32,
}

struct Circle {
    center: vec2<f32>,
    radius: f32,
    padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> field: array<f32>;
@group(0) @binding(2) var<storage, read_write> colors: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> circles: array<Circle>;

@compute @workgroup_size(16, 16)
fn computeSDF(@builtin(global_invocation_id) id: vec3<u32>) {
    // Early exit if outside grid bounds
    if (id.x >= u32(uniforms.gridSize) || id.y >= u32(uniforms.gridSize)) {
        return;
    }
    
    let index = id.x + id.y * u32(uniforms.gridSize);
    
    // Calculate world position for this grid cell
    let worldPos = vec2<f32>(
        f32(id.x - u32(uniforms.gridSize) / 2u) * uniforms.cellSize,
        f32(id.y - u32(uniforms.gridSize) / 2u) * uniforms.cellSize
    );
    
    // Initialize with large distance
    var minDist = f32(1000.0);
    
    // Compute minimum distance to all circles
    for (var i = 0u; i < uniforms.numCircles; i++) {
        let circle = circles[i];
        let dist = length(worldPos - circle.center) - circle.radius;
        minDist = min(minDist, dist);
    }
    
    // Store the computed distance
    field[index] = minDist;
    
    // Compute color based on distance value
    // Red for positive distances (outside), Blue for negative distances (inside)
    let color = vec4<f32>(
        select(0.0, minDist, minDist > 0.0),  // Red channel for positive
        0.0,                                  // Green channel (unused)
        select(0.0, -minDist, minDist < 0.0), // Blue channel for negative
        1.0                                   // Alpha channel
    );
    
    colors[index] = color;
}

// Optional: Shader for clearing the field
@compute @workgroup_size(256)
fn clearField(@builtin(global_invocation_id) id: vec3<u32>) {
    let index = id.x;
    if (index < arrayLength(&field)) {
        field[index] = f32(1000.0);
        colors[index] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
}
