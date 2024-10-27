const vsSource = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
out vec3 vNormal;
out vec3 vPosition;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

void main() {
    vec4 position = uModelViewMatrix * vec4(aPosition, 1.0);
    gl_Position = uProjectionMatrix * position;
    vNormal = mat3(uModelViewMatrix) * aNormal;
    vPosition = position.xyz;
}`;

const fsSource = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
out vec4 fragColor;
uniform vec3 uLightPosition;

void main() {
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(uLightPosition - vPosition);
    vec3 viewDir = normalize(-vPosition);
    vec3 reflectDir = reflect(-lightDir, normal);
    
    float diff = max(dot(normal, lightDir), 0.0);
    float spec = max(dot(viewDir, reflectDir), 0.0);
    
    vec3 baseColor = normal.y > 0.7 ? 
        vec3(0.2, 0.6, 0.1) :  // green
        vec3(0.6, 0.3, 0.3);   // red
    
    float specular = normal.y > 0.7 ? 
        pow(spec, 128.0) * 1.0 :  // Shallow slopes: Small bright spots
        pow(spec, 32.0) * 0.4;    // Steep slopes: Large dim spots
    
    vec3 ambient = 0.1 * baseColor;
    vec3 diffuse = diff * baseColor;
    vec3 specularColor = vec3(specular);
    
    fragColor = vec4(ambient + diffuse + specularColor, 1.0);
}`;

let gl;
let program;
let terrain;
let lastSeconds = 0;

function generateTerrain(gridSize, faults) {
  if (gridSize < 2 || gridSize > 255) {
    throw new Error("Grid size must be between 2 and 255");
  }

  const vertices = [];
  const indices = [];
  const normals = [];

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const x = (i / (gridSize - 1)) * 2 - 1;
      const z = (j / (gridSize - 1)) * 2 - 1;
      vertices.push(x, 0, z);
    }
  }

  let minHeight = 0, maxHeight = 0;
  for (let f = 0; f < faults; f++) {
    const a = Math.random() * 2 - 1;
    const b = Math.random() * 2 - 1;
    const d = Math.random() * 2 - 1;
    for (let i = 1; i < vertices.length; i += 3) {
      const x = vertices[i-1];
      const z = vertices[i+1];
      if (a * x + b * z + d > 0) {
        vertices[i] += 0.1;
      } else {
        vertices[i] -= 0.1;
      }
      minHeight = Math.min(minHeight, vertices[i]);
      maxHeight = Math.max(maxHeight, vertices[i]);
    }
  }

  const c = 0.5;
  const heightRange = maxHeight - minHeight;
  if (heightRange > 0) {
    for (let i = 1; i < vertices.length; i += 3) {
      vertices[i] = c * (vertices[i] - 0.5 * (maxHeight + minHeight)) / (0.5 * heightRange);
    }
  }

  for (let i = 0; i < gridSize - 1; i++) {
    for (let j = 0; j < gridSize - 1; j++) {
      const a = i * gridSize + j;
      const b = a + 1;
      const c = (i + 1) * gridSize + j;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const idx = i * gridSize + j;
      const s = i > 0 ? idx - gridSize : idx;
      const n = i < gridSize - 1 ? idx + gridSize : idx;
      const w = j > 0 ? idx - 1 : idx;
      const e = j < gridSize - 1 ? idx + 1 : idx;
      
      const vS = vec3.fromValues(vertices[s*3], vertices[s*3+1], vertices[s*3+2]);
      const vN = vec3.fromValues(vertices[n*3], vertices[n*3+1], vertices[n*3+2]);
      const vW = vec3.fromValues(vertices[w*3], vertices[w*3+1], vertices[w*3+2]);
      const vE = vec3.fromValues(vertices[e*3], vertices[e*3+1], vertices[e*3+2]);
      
      const ns = vec3.sub(vec3.create(), vN, vS);
      const we = vec3.sub(vec3.create(), vW, vE);
      const normal = vec3.cross(vec3.create(), ns, we);
      vec3.normalize(normal, normal);
      
      normals.push(normal[0], normal[1], normal[2]);
    }
  }

  return { vertices, indices, normals };
}

function initBuffers(terrain) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(terrain.vertices), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  const normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(terrain.normals), gl.STATIC_DRAW);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(1);

  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(terrain.indices), gl.STATIC_DRAW);

  return indexBuffer;
}

function compileShader(vs_source, fs_source) {
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vs_source);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(vs));
    throw Error("Vertex shader compilation failed");
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, fs_source);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(fs));
    throw Error("Fragment shader compilation failed");
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    throw Error("Linking failed");
  }
    
  const uniforms = {};
  for(let i=0; i<gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i+=1) {
    let info = gl.getActiveUniform(program, i);
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  program.uniforms = uniforms;

  return program;
}

function updateState(dt) {
  program.cameraAngle = (program.cameraAngle || 0) + 0.3 * dt;
  let maxHeight = 0;
  if (terrain) {
    for (let i = 1; i < terrain.vertices.length; i += 3) {
      maxHeight = Math.max(maxHeight, terrain.vertices[i]);
    }
  }
  program.cameraHeight = maxHeight + 0.2;
}

function draw(seconds) {
  if (!terrain) return;

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const projectionMatrix = mat4.perspective(mat4.create(), Math.PI / 2.2, aspect, 0.1, 100.0);
  
  const cameraRadius = 1.4;
  const cameraX = Math.cos(program.cameraAngle) * cameraRadius;
  const cameraZ = Math.sin(program.cameraAngle) * cameraRadius;
  const cameraPosition = vec3.fromValues(cameraX, program.cameraHeight, cameraZ);
  const target = vec3.fromValues(0, -0.15, 0);
  const up = vec3.fromValues(0, 1, 0);
  
  const viewMatrix = mat4.lookAt(mat4.create(), cameraPosition, target, up);
  const modelViewMatrix = viewMatrix;

  gl.uniformMatrix4fv(program.uniforms.uProjectionMatrix, false, projectionMatrix);
  gl.uniformMatrix4fv(program.uniforms.uModelViewMatrix, false, modelViewMatrix);

  const lightPosition = vec3.fromValues(1.0, 2.0, 1.0);
  gl.uniform3fv(program.uniforms.uLightPosition, lightPosition);

  gl.drawElements(gl.TRIANGLES, terrain.indices.length, gl.UNSIGNED_SHORT, 0);
}

function tick(milliseconds) {
  const seconds = milliseconds / 1000;
  const dt = seconds - (window.lastSeconds || seconds);
  window.lastSeconds = seconds;

  updateState(dt);
  draw(seconds);

  requestAnimationFrame(tick);
}

function fillScreen() {
  let canvas = document.querySelector('canvas');
  document.body.style.margin = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  canvas.style.width = '';
  canvas.style.height = '';
  if (gl) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = canvas.width / canvas.height;
    const projectionMatrix = mat4.perspective(mat4.create(), Math.PI / 2.2, aspect, 0.1, 100.0);
    gl.uniformMatrix4fv(program.uniforms.uProjectionMatrix, false, projectionMatrix);
  }
}

window.addEventListener('load', async (event) => {
  const canvas = document.querySelector('canvas');
  window.gl = canvas.getContext('webgl2', {
    antialias: false,
    depth: true,
    preserveDrawingBuffer: true
  });
  gl = window.gl;

  program = compileShader(vsSource, fsSource);
  gl.useProgram(program);

  gl.clearColor(1.0, 1.0, 1.0, 1.0);
  gl.enable(gl.DEPTH_TEST);

  window.addEventListener('resize', fillScreen);
  fillScreen();

  document.querySelector('#submit').addEventListener('click', event => {
    const gridSize = Number(document.querySelector('#gridsize').value) || 2;
    const faults = Number(document.querySelector('#faults').value) || 0;
    
    terrain = generateTerrain(gridSize, faults);
    initBuffers(terrain);
  });

  requestAnimationFrame(tick);
});