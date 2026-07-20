import { prefersReducedMotion } from "../config.js";

// Compact GPU fluid simulation (Stable Fluids / Pavel Dobryakov approach,
// MIT-style reimplementation) rendered transparently as glowing dye wisps.

const SIM_RES = 128;
const DYE_RES = 512;
const PRESSURE_ITERATIONS = 20;
const DENSITY_DISSIPATION = 0.975;
const VELOCITY_DISSIPATION = 0.985;
const CURL = 28;
const PRESSURE = 0.8;
const SPLAT_RADIUS = 0.25 / 100;
const SPLAT_FORCE = 6000;
const DYE_INTENSITY = 0.28;
const IDLE_TIMEOUT = 900; // ms without movement before we let dye settle

// Warm fire palette (coral / amber / rose) matching the site.
const FIRE_COLORS = Object.freeze([
  Object.freeze({ r: 1.0, g: 0.45, b: 0.25 }),
  Object.freeze({ r: 1.0, g: 0.65, b: 0.3 }),
  Object.freeze({ r: 1.0, g: 0.5, b: 0.55 }),
]);

const BASE_VERTEX = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform vec2 texelSize;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const COPY_SHADER = `
  precision mediump float;
  precision mediump sampler2D;
  varying highp vec2 vUv;
  uniform sampler2D uTexture;
  void main () {
    gl_FragColor = texture2D(uTexture, vUv);
  }
`;

const CLEAR_SHADER = `
  precision mediump float;
  precision mediump sampler2D;
  varying highp vec2 vUv;
  uniform sampler2D uTexture;
  uniform float value;
  void main () {
    gl_FragColor = value * texture2D(uTexture, vUv);
  }
`;

// Premultiplied-alpha display: alpha follows luminance so dark areas stay
// transparent and only glowing dye composites over the page.
const DISPLAY_SHADER = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  void main () {
    vec3 c = texture2D(uTexture, vUv).rgb;
    float a = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c, a);
  }
`;

const SPLAT_SHADER = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uTarget;
  uniform float aspectRatio;
  uniform vec3 color;
  uniform vec2 point;
  uniform float radius;
  void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }
`;

const ADVECTION_SHADER = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 texelSize;
  uniform float dt;
  uniform float dissipation;
  void main () {
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    gl_FragColor = dissipation * texture2D(uSource, coord);
  }
`;

const DIVERGENCE_SHADER = `
  precision mediump float;
  precision mediump sampler2D;
  varying highp vec2 vUv;
  varying highp vec2 vL;
  varying highp vec2 vR;
  varying highp vec2 vT;
  varying highp vec2 vB;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;
    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }
    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }
`;

const CURL_SHADER = `
  precision mediump float;
  precision mediump sampler2D;
  varying highp vec2 vUv;
  varying highp vec2 vL;
  varying highp vec2 vR;
  varying highp vec2 vT;
  varying highp vec2 vB;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
  }
`;

const VORTICITY_SHADER = `
  precision highp float;
  precision highp sampler2D;
  varying vec2 vUv;
  varying vec2 vL;
  varying vec2 vR;
  varying vec2 vT;
  varying vec2 vB;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float curl;
  uniform float dt;
  void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity += force * dt;
    velocity = min(max(velocity, -1000.0), 1000.0);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const PRESSURE_SHADER = `
  precision mediump float;
  precision mediump sampler2D;
  varying highp vec2 vUv;
  varying highp vec2 vL;
  varying highp vec2 vR;
  varying highp vec2 vT;
  varying highp vec2 vB;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }
`;

const GRADIENT_SHADER = `
  precision mediump float;
  precision mediump sampler2D;
  varying highp vec2 vUv;
  varying highp vec2 vL;
  varying highp vec2 vR;
  varying highp vec2 vT;
  varying highp vec2 vB;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || "shader compile failed");
  }
  return shader;
};

const createProgram = (gl, vertexSource, fragmentSource) => {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(
    program,
    compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource),
  );
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "program link failed");
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const name = gl.getActiveUniform(program, i).name;
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
};

export const initFluid = () => {
  // No fluid for reduced-motion or touch-only (no hover) devices.
  if (prefersReducedMotion()) return;
  if (window.matchMedia("(hover: none)").matches) return;

  try {
    const canvas = document.createElement("canvas");
    canvas.className = "fluid-canvas";
    document.body.appendChild(canvas);

    const params = {
      alpha: true,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    };
    const gl =
      canvas.getContext("webgl", params) ||
      canvas.getContext("experimental-webgl", params);
    if (!gl) {
      canvas.remove();
      return;
    }

    // Require half-float (or float) render targets; bail out silently otherwise.
    const halfFloat = gl.getExtension("OES_texture_half_float");
    const supportLinear = gl.getExtension("OES_texture_half_float_linear");
    let textureType;
    if (halfFloat) {
      textureType = halfFloat.HALF_FLOAT_OES;
    } else if (gl.getExtension("OES_texture_float")) {
      textureType = gl.FLOAT;
    } else {
      canvas.remove();
      return;
    }
    const filtering = supportLinear ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // Fullscreen triangle-pair geometry.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
      gl.STATIC_DRAW,
    );
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([0, 1, 2, 0, 2, 3]),
      gl.STATIC_DRAW,
    );
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    const blit = (target) => {
      if (target === null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };

    const createFBO = (w, h, internalFormat, format, type, filter) => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        internalFormat,
        w,
        h,
        0,
        format,
        type,
        null,
      );
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return {
        texture,
        fbo,
        width: w,
        height: h,
        texelX: 1 / w,
        texelY: 1 / h,
        attach(id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        },
      };
    };

    const createDoubleFBO = (w, h, internalFormat, format, type, filter) => {
      let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
      let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
      return {
        width: w,
        height: h,
        texelX: 1 / w,
        texelY: 1 / h,
        get read() {
          return fbo1;
        },
        set read(value) {
          fbo1 = value;
        },
        get write() {
          return fbo2;
        },
        set write(value) {
          fbo2 = value;
        },
        swap() {
          const temp = fbo1;
          fbo1 = fbo2;
          fbo2 = temp;
        },
      };
    };

    const rgba = gl.RGBA;
    const programs = {
      copy: createProgram(gl, BASE_VERTEX, COPY_SHADER),
      clear: createProgram(gl, BASE_VERTEX, CLEAR_SHADER),
      display: createProgram(gl, BASE_VERTEX, DISPLAY_SHADER),
      splat: createProgram(gl, BASE_VERTEX, SPLAT_SHADER),
      advection: createProgram(gl, BASE_VERTEX, ADVECTION_SHADER),
      divergence: createProgram(gl, BASE_VERTEX, DIVERGENCE_SHADER),
      curl: createProgram(gl, BASE_VERTEX, CURL_SHADER),
      vorticity: createProgram(gl, BASE_VERTEX, VORTICITY_SHADER),
      pressure: createProgram(gl, BASE_VERTEX, PRESSURE_SHADER),
      gradient: createProgram(gl, BASE_VERTEX, GRADIENT_SHADER),
    };

    let dye;
    let velocity;
    let divergence;
    let curl;
    let pressure;

    const initFramebuffers = () => {
      dye = createDoubleFBO(DYE_RES, DYE_RES, rgba, rgba, textureType, filtering);
      velocity = createDoubleFBO(
        SIM_RES,
        SIM_RES,
        rgba,
        rgba,
        textureType,
        filtering,
      );
      divergence = createFBO(
        SIM_RES,
        SIM_RES,
        rgba,
        rgba,
        textureType,
        gl.NEAREST,
      );
      curl = createFBO(SIM_RES, SIM_RES, rgba, rgba, textureType, gl.NEAREST);
      pressure = createFBO(
        SIM_RES,
        SIM_RES,
        rgba,
        rgba,
        textureType,
        gl.NEAREST,
      );
    };
    initFramebuffers();

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();

    // Pointer state.
    const pointer = {
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      moved: false,
      down: false,
    };
    let lastMove = 0;
    let hasActivity = false;
    let running = true;

    const splat = (x, y, dx, dy, color) => {
      const p = programs.splat;
      gl.useProgram(p.program);
      gl.uniform1i(p.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(p.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(p.uniforms.point, x, y);
      gl.uniform3f(p.uniforms.color, dx, dy, 0);
      gl.uniform1f(p.uniforms.radius, SPLAT_RADIUS);
      blit(velocity.write);
      velocity.swap();

      gl.uniform1i(p.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(p.uniforms.color, color.r, color.g, color.b);
      blit(dye.write);
      dye.swap();
    };

    const step = (dt) => {
      gl.disable(gl.BLEND);

      // Curl.
      let p = programs.curl;
      gl.useProgram(p.program);
      gl.uniform2f(p.uniforms.texelSize, velocity.texelX, velocity.texelY);
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      blit(curl);

      // Vorticity confinement.
      p = programs.vorticity;
      gl.useProgram(p.program);
      gl.uniform2f(p.uniforms.texelSize, velocity.texelX, velocity.texelY);
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(p.uniforms.uCurl, curl.attach(1));
      gl.uniform1f(p.uniforms.curl, CURL);
      gl.uniform1f(p.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();

      // Divergence.
      p = programs.divergence;
      gl.useProgram(p.program);
      gl.uniform2f(p.uniforms.texelSize, velocity.texelX, velocity.texelY);
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergence);

      // Clear pressure with decay.
      p = programs.clear;
      gl.useProgram(p.program);
      gl.uniform1i(p.uniforms.uTexture, pressure.attach(0));
      gl.uniform1f(p.uniforms.value, PRESSURE);
      blit(pressure);

      // Pressure Jacobi iterations.
      p = programs.pressure;
      gl.useProgram(p.program);
      gl.uniform2f(p.uniforms.texelSize, velocity.texelX, velocity.texelY);
      gl.uniform1i(p.uniforms.uDivergence, divergence.attach(0));
      for (let i = 0; i < PRESSURE_ITERATIONS; i += 1) {
        gl.uniform1i(p.uniforms.uPressure, pressure.attach(1));
        blit(pressure);
      }

      // Gradient subtract.
      p = programs.gradient;
      gl.useProgram(p.program);
      gl.uniform2f(p.uniforms.texelSize, velocity.texelX, velocity.texelY);
      gl.uniform1i(p.uniforms.uPressure, pressure.attach(0));
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      // Advect velocity.
      p = programs.advection;
      gl.useProgram(p.program);
      gl.uniform2f(p.uniforms.texelSize, velocity.texelX, velocity.texelY);
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(p.uniforms.uSource, velocity.read.attach(0));
      gl.uniform1f(p.uniforms.dt, dt);
      gl.uniform1f(p.uniforms.dissipation, VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();

      // Advect dye.
      gl.uniform1i(p.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(p.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(p.uniforms.dissipation, DENSITY_DISSIPATION);
      blit(dye.write);
      dye.swap();
    };

    const render = () => {
      // Transparent premultiplied composite: clear to 0, draw dye with alpha.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const p = programs.display;
      gl.useProgram(p.program);
      gl.uniform1i(p.uniforms.uTexture, dye.read.attach(0));
      blit(null);
      gl.disable(gl.BLEND);
    };

    let lastTime = performance.now();
    const frame = () => {
      if (!running) return;
      const now = performance.now();
      let dt = (now - lastTime) / 1000;
      dt = Math.min(dt, 0.016666);
      lastTime = now;

      if (pointer.moved) {
        pointer.moved = false;
        const color = FIRE_COLORS[(Math.random() * FIRE_COLORS.length) | 0];
        const c = {
          r: color.r * DYE_INTENSITY,
          g: color.g * DYE_INTENSITY,
          b: color.b * DYE_INTENSITY,
        };
        splat(pointer.x, pointer.y, pointer.dx, pointer.dy, c);
        pointer.dx = 0;
        pointer.dy = 0;
        hasActivity = true;
        lastMove = now;
      }

      // Keep simulating while there is activity; let dye fade then idle.
      if (hasActivity) {
        step(dt);
        render();
        if (now - lastMove > IDLE_TIMEOUT + 3000) {
          hasActivity = false;
        }
      }

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    // Pointer input: convert to UV + velocity delta.
    window.addEventListener(
      "pointermove",
      (e) => {
        const x = e.clientX / window.innerWidth;
        const y = 1 - e.clientY / window.innerHeight;
        const dx = (x - pointer.x) * SPLAT_FORCE;
        const dy = (y - pointer.y) * SPLAT_FORCE;
        pointer.x = x;
        pointer.y = y;
        // Clamp huge deltas from the first event / teleports.
        pointer.dx = Math.max(-3000, Math.min(3000, dx));
        pointer.dy = Math.max(-3000, Math.min(3000, dy));
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) pointer.moved = true;
      },
      { passive: true },
    );

    window.addEventListener("resize", resize, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        running = false;
      } else if (!running) {
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(frame);
      }
    });
  } catch (err) {
    console.error("[solenne] fluid simulation failed:", err);
  }
};
