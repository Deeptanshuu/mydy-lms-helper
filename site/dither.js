// Hero background: dithered animated noise waves. A dependency-free WebGL2 port of the React Bits
// "Dither" component (wave pass + ordered-dither pass merged into one full-screen shader).
// Draws into <canvas id="hero-dither">; adds the class "ready" once the first frame has rendered,
// and stays completely silent if WebGL2 or the shaders are unavailable.
(() => {
  const canvas = document.getElementById("hero-dither")
  const parent = canvas?.parentElement
  if (!canvas || !parent) return

  // ---------------------------------------------------------------------------
  // Tweakables (same names and defaults as the original component's props)
  // ---------------------------------------------------------------------------
  const WAVE_SPEED = 0.05
  const WAVE_FREQUENCY = 3
  const WAVE_AMPLITUDE = 0.3
  const COLOR_NUM = 4 // brightness levels after dithering
  const WAVE_INTENSITY = 0.5 // how far towards WAVE_COLOR the brightest waves go (the original's grey 0.5)
  const PIXEL_SIZE = 3 // size of one dither cell, in canvas pixels
  const MOUSE_RADIUS = 0.3
  const ENABLE_MOUSE_INTERACTION = true
  const BACKGROUND_COLOR = [14 / 255, 15 / 255, 16 / 255] // #0E0F10
  const WAVE_COLOR = [1.0, 0.396, 0.0] // brand orange #FF6500
  const STILL_TIME = 0 // frame drawn when prefers-reduced-motion is on (seconds)

  // 8x8 Bayer matrix, values 0..63.
  const BAYER = [
    0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31,
    8, 56, 4, 52, 11, 59, 7, 55, 40, 24, 36, 20, 43, 27, 39, 23,
    2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29,
    10, 58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22, 41, 25, 37, 21,
  ]

  // ---------------------------------------------------------------------------
  // Shaders
  // ---------------------------------------------------------------------------
  // One triangle that covers the whole viewport, generated from gl_VertexID (no buffers needed).
  const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

  const FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform float colorNum;
uniform float waveIntensity;
uniform float pixelSize;
uniform float mouseRadius;
uniform vec2 mousePos;
uniform vec3 backgroundColor;
uniform vec3 waveColor;
out vec4 fragColor;

const float bayer8[64] = float[64](${BAYER.map((n) => n.toFixed(1)).join(", ")});

// Classic Perlin noise (Stefan Gustavson / Ashima).
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < 4; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p + fbm(p2));
}

// Wave brightness (0..1) at a pixel position.
float wave(vec2 fragCoord) {
  vec2 uv = fragCoord / resolution - 0.5;
  uv.x *= resolution.x / resolution.y;
  float f = pattern(uv);

  // Push the waves away from the pointer.
  vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
  mouseNDC.x *= resolution.x / resolution.y;
  f -= 0.5 * (1.0 - smoothstep(0.0, mouseRadius, length(uv - mouseNDC)));

  return clamp(f, 0.0, 1.0) * waveIntensity;
}

void main() {
  // Pixelate: every pixel in a cell shares one wave value and one Bayer threshold.
  vec2 block = floor(gl_FragCoord.xy / pixelSize);
  float v = wave(block * pixelSize);

  ivec2 cell = ivec2(mod(block, 8.0));
  float threshold = bayer8[cell.y * 8 + cell.x] / 64.0 - 0.25;
  float levelStep = 1.0 / (colorNum - 1.0);
  v += threshold * levelStep;

  // Pull darker tones down a little so the shadows stay clean.
  float bias = mix(0.2, 0.0, smoothstep(0.45, 0.8, v));
  v = clamp(v - bias, 0.0, 1.0);

  // Dither the brightness, not each channel, so a coloured wave stays one hue (the original only
  // looks clean because its default wave colour is grey).
  v = floor(v * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
  fragColor = vec4(mix(backgroundColor, waveColor, v), 1.0);
}`

  // ---------------------------------------------------------------------------
  // GL setup
  // ---------------------------------------------------------------------------
  const reduced = matchMedia("(prefers-reduced-motion: reduce)")
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" })
  if (!gl) return

  let uResolution, uTime, uMouse
  let time = 0
  let raf = 0
  let last = 0
  let visible = true
  let drawn = false
  const mouse = [-1e5, -1e5] // canvas pixels, origin top-left; far away = no effect

  function compile(type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
  }

  // Builds the program and its constant uniforms. Returns false if anything fails.
  function init() {
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const program = vs && fs && gl.createProgram()
    if (!program) return false
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false
    gl.useProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    const loc = (name) => gl.getUniformLocation(program, name)
    gl.uniform1f(loc("waveSpeed"), WAVE_SPEED)
    gl.uniform1f(loc("waveFrequency"), WAVE_FREQUENCY)
    gl.uniform1f(loc("waveAmplitude"), WAVE_AMPLITUDE)
    gl.uniform1f(loc("colorNum"), COLOR_NUM)
    gl.uniform1f(loc("waveIntensity"), WAVE_INTENSITY)
    gl.uniform1f(loc("pixelSize"), PIXEL_SIZE)
    gl.uniform1f(loc("mouseRadius"), MOUSE_RADIUS)
    gl.uniform3fv(loc("backgroundColor"), BACKGROUND_COLOR)
    gl.uniform3fv(loc("waveColor"), WAVE_COLOR)
    uResolution = loc("resolution")
    uTime = loc("time")
    uMouse = loc("mousePos")
    return true
  }

  function draw(t) {
    if (!canvas.width || !canvas.height) return
    gl.uniform1f(uTime, t)
    gl.uniform2f(uMouse, mouse[0], mouse[1])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // Fade the canvas in only once a frame has actually rendered.
    if (!drawn && !gl.isContextLost() && gl.getError() === gl.NO_ERROR) {
      drawn = true
      canvas.classList.add("ready")
    }
  }

  // ---------------------------------------------------------------------------
  // Sizing: render at 1x the parent's CSS size (like dpr={1} in the original)
  // ---------------------------------------------------------------------------
  function resize() {
    const w = parent.clientWidth
    const h = parent.clientHeight
    if (!w || !h) return
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    gl.viewport(0, 0, w, h)
    gl.uniform2f(uResolution, w, h)
    draw(reduced.matches ? STILL_TIME : time) // resizing clears the buffer, so repaint right away
  }

  // ---------------------------------------------------------------------------
  // Animation loop: runs only while visible, and never with reduced motion
  // ---------------------------------------------------------------------------
  function frame(now) {
    time += Math.min(now - last, 100) / 1000
    last = now
    draw(time)
    raf = requestAnimationFrame(frame)
  }

  function sync() {
    const run = visible && !document.hidden && !reduced.matches && !gl.isContextLost()
    if (run && !raf) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!run && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  // ---------------------------------------------------------------------------
  // Pointer: the canvas is behind the hero text (pointer-events: none), so listen on its parent
  // ---------------------------------------------------------------------------
  function onPointerMove(e) {
    if (reduced.matches) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    mouse[0] = ((e.clientX - rect.left) * canvas.width) / rect.width
    mouse[1] = ((e.clientY - rect.top) * canvas.height) / rect.height
  }

  function onPointerLeave() {
    mouse[0] = mouse[1] = -1e5
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  if (!init()) return

  if (ENABLE_MOUSE_INTERACTION) {
    parent.addEventListener("pointermove", onPointerMove)
    parent.addEventListener("pointerleave", onPointerLeave)
    parent.addEventListener("pointercancel", onPointerLeave)
  }

  new ResizeObserver(resize).observe(parent)
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    sync()
  }).observe(canvas)
  document.addEventListener("visibilitychange", sync)
  reduced.addEventListener("change", () => {
    onPointerLeave()
    resize() // repaint: still frame when reduced, live frame otherwise
    sync()
  })

  // If the GPU context is lost, stop quietly; rebuild everything if it comes back.
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault()
    drawn = false
    canvas.classList.remove("ready")
    sync()
  })
  canvas.addEventListener("webglcontextrestored", () => {
    if (init()) {
      resize()
      sync()
    }
  })

  resize()
  sync()
})()
