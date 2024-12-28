# WebGL Terrain Generator

A real-time terrain generator using fault formation algorithm, rendered with WebGL 2.0. Features dynamic terrain generation with adjustable parameters and automatic camera rotation.

## Features

- Real-time terrain generation using fault formation algorithm
- Phong lighting with environment-aware specular highlights
- Automatic orbit camera
- Responsive fullscreen display
- Color variation based on slope (green for shallow slopes, red for steep areas)
- Dynamic terrain resolution control

## Getting Started

### Prerequisites

- A modern web browser with WebGL 2.0 support
- Local web server for development

### Running the Application

1. Clone the repository
2. Serve the directory using a local web server
3. Open `index.html` in your browser

## Controls

The interface provides a control panel at the top with the following options:

- **Grid size**: Controls terrain resolution (default: 50)
- **Faults**: Number of terrain deformations to apply (default: 50)
- **Regenerate Terrain**: Creates new terrain with current parameters

The main window shows the generated terrain with automatic camera rotation.

## Technical Details

### Terrain Generation

Uses fault formation algorithm:
- Creates a flat grid of specified resolution
- Applies random fault lines that raise/lower terrain
- Normalizes heights to maintain consistent scale
- Generates smooth normals for lighting calculations

### Shading

The terrain uses a custom shader that:
- Applies different materials based on slope
- Shallow slopes: Green with sharp specular highlights
- Steep slopes: Red with broader, dimmer specular reflection
- Includes ambient, diffuse, and specular lighting components

### Camera

Features an automatic orbiting camera:
- Maintains fixed height above terrain
- Orbits at constant speed
- Looks at terrain center with slight downward tilt
