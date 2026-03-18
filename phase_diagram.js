(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function createNode(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        node.setAttribute(key, String(value));
      }
    });
    return node;
  }

  function nearlyEqual(a, b, eps = 1e-9) {
    return Math.abs(a - b) <= eps;
  }

  function compileExpression(expression) {
    if (typeof expression === "function") {
      return expression;
    }
    if (typeof expression !== "string") {
      throw new Error("Expression must be a string or function.");
    }
    const normalized = expression
      .replace(/\u2212/g, "-")
      .replace(/\s+/g, "")
      .replace(/(\d)([xy(])/g, "$1*$2")
      .replace(/([xy\)])(\d)/g, "$1*$2")
      .replace(/([xy\)])([xy(])/g, "$1*$2")
      .replace(/\^/g, "**");
    return new Function("x", "y", "params", `with (Math) { with (params || {}) { return ${normalized}; } }`);
  }

  function dedupePoints(points, tolerance) {
    const result = [];
    points.forEach((point) => {
      const exists = result.some((saved) => Math.hypot(saved.x - point.x, saved.y - point.y) <= tolerance);
      if (!exists) {
        result.push(point);
      }
    });
    return result;
  }

  class PhaseDiagramRenderer {
    constructor(options) {
      this.options = this.normalizeOptions(options);
      this.dx = compileExpression(this.options.system.dx);
      this.dy = compileExpression(this.options.system.dy);
    }

    normalizeOptions(options) {
      if (!options || !options.target) {
        throw new Error("target is required.");
      }
      const target = typeof options.target === "string" ? document.querySelector(options.target) : options.target;
      if (!target) {
        throw new Error("target element was not found.");
      }
      return {
        target,
        width: options.width || 760,
        height: options.height || 470,
        margin: { top: 34, right: 48, bottom: 48, left: 48, ...(options.margin || {}) },
        xRange: options.xRange || [-28, 28],
        yRange: options.yRange || [-12, 24],
        params: options.params || {},
        system: options.system,
        style: {
          axisColor: "#111111",
          nullclineColor: "#4b5cff",
          componentColor: "#ff3131",
          resultantColor: "#31c84e",
          labelColor: "#111111",
          background: "#ffffff",
          ...(options.style || {})
        },
        vectorField: {
          enabled: false,
          xCount: 18,
          yCount: 12,
          color: "#64748b",
          opacity: 0.3,
          strokeWidth: 1,
          arrowSize: 4,
          scale: 16,
          minLength: 7,
          maxLength: 13,
          ...(options.vectorField || {})
        },
        trajectories: {
          enabled: false,
          color: "#d8a11d",
          opacity: 0.8,
          strokeWidth: 1.1,
          dt: 0.035,
          steps: 900,
          arrows: true,
          arrowSize: 5,
          arrowSpacing: 90,
          perRegion: 3,
          seeds: [],
          ...(options.trajectories || {})
        }
      };
    }

    evaluate(x, y) {
      return {
        dx: Number(this.dx(x, y, this.options.params)),
        dy: Number(this.dy(x, y, this.options.params))
      };
    }

    toScreenX(x) {
      const { xRange, width, margin } = this.options;
      return margin.left + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (width - margin.left - margin.right);
    }

    toScreenY(y) {
      const { yRange, height, margin } = this.options;
      return height - margin.bottom - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (height - margin.top - margin.bottom);
    }

    inBounds(x, y) {
      const { xRange, yRange } = this.options;
      return x >= xRange[0] && x <= xRange[1] && y >= yRange[0] && y <= yRange[1];
    }

    numericalJacobian(x, y) {
      const h = 1e-5;
      const fx1 = this.evaluate(x + h, y);
      const fx0 = this.evaluate(x - h, y);
      const fy1 = this.evaluate(x, y + h);
      const fy0 = this.evaluate(x, y - h);
      return {
        a: (fx1.dx - fx0.dx) / (2 * h),
        b: (fy1.dx - fy0.dx) / (2 * h),
        c: (fx1.dy - fx0.dy) / (2 * h),
        d: (fy1.dy - fy0.dy) / (2 * h)
      };
    }

    findEquilibria() {
      const starts = [];
      const { xRange, yRange } = this.options;
      for (let i = 0; i <= 4; i += 1) {
        for (let j = 0; j <= 4; j += 1) {
          starts.push({
            x: xRange[0] + ((xRange[1] - xRange[0]) * i) / 4,
            y: yRange[0] + ((yRange[1] - yRange[0]) * j) / 4
          });
        }
      }

      const roots = [];
      starts.forEach((start) => {
        let x = start.x;
        let y = start.y;
        for (let iter = 0; iter < 20; iter += 1) {
          const value = this.evaluate(x, y);
          const jac = this.numericalJacobian(x, y);
          const det = jac.a * jac.d - jac.b * jac.c;
          if (!Number.isFinite(det) || Math.abs(det) < 1e-10) {
            break;
          }
          const deltaX = (jac.d * value.dx - jac.b * value.dy) / det;
          const deltaY = (-jac.c * value.dx + jac.a * value.dy) / det;
          x -= deltaX;
          y -= deltaY;
          if (Math.hypot(deltaX, deltaY) < 1e-8) {
            break;
          }
        }
        const residual = this.evaluate(x, y);
        if (Math.hypot(residual.dx, residual.dy) < 1e-5 && this.inBounds(x, y)) {
          roots.push({ x, y });
        }
      });
      return dedupePoints(roots, 1e-3);
    }

    contourSegments(valueAt, nx = 160, ny = 160) {
      const { xRange, yRange } = this.options;
      const segments = [];
      const dx = (xRange[1] - xRange[0]) / nx;
      const dy = (yRange[1] - yRange[0]) / ny;
      for (let i = 0; i < nx; i += 1) {
        for (let j = 0; j < ny; j += 1) {
          const x0 = xRange[0] + i * dx;
          const x1 = x0 + dx;
          const y0 = yRange[0] + j * dy;
          const y1 = y0 + dy;
          const corners = [
            { x: x0, y: y0, v: valueAt(x0, y0) },
            { x: x1, y: y0, v: valueAt(x1, y0) },
            { x: x1, y: y1, v: valueAt(x1, y1) },
            { x: x0, y: y1, v: valueAt(x0, y1) }
          ];
          const hits = [];
          for (let e = 0; e < 4; e += 1) {
            const a = corners[e];
            const b = corners[(e + 1) % 4];
            if ((a.v <= 0 && b.v >= 0) || (a.v >= 0 && b.v <= 0)) {
              const denom = b.v - a.v;
              const t = Math.abs(denom) < 1e-12 ? 0.5 : -a.v / denom;
              if (t >= 0 && t <= 1) {
                hits.push({
                  x: a.x + (b.x - a.x) * t,
                  y: a.y + (b.y - a.y) * t
                });
              }
            }
          }
          if (hits.length >= 2) {
            segments.push([hits[0], hits[1]]);
          }
        }
      }
      return segments;
    }

    rk4(x, y, dt) {
      const k1 = this.evaluate(x, y);
      const k2 = this.evaluate(x + 0.5 * dt * k1.dx, y + 0.5 * dt * k1.dy);
      const k3 = this.evaluate(x + 0.5 * dt * k2.dx, y + 0.5 * dt * k2.dy);
      const k4 = this.evaluate(x + dt * k3.dx, y + dt * k3.dy);
      return {
        x: x + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
        y: y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy)
      };
    }

    integrate(seed, dt, steps) {
      const points = [{ x: seed.x, y: seed.y }];
      let x = seed.x;
      let y = seed.y;
      for (let i = 0; i < steps; i += 1) {
        const next = this.rk4(x, y, dt);
        if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || !this.inBounds(next.x, next.y)) {
          break;
        }
        points.push(next);
        x = next.x;
        y = next.y;
        if (this.equilibrium && Math.hypot(x - this.equilibrium.x, y - this.equilibrium.y) < 0.08) {
          break;
        }
      }
      return points;
    }

    interceptOnXAxis(valueAt) {
      const { xRange } = this.options;
      const y = 0;
      let prevX = xRange[0];
      let prevV = valueAt(prevX, y);
      for (let i = 1; i <= 400; i += 1) {
        const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / 400;
        const v = valueAt(x, y);
        if ((prevV <= 0 && v >= 0) || (prevV >= 0 && v <= 0)) {
          const t = Math.abs(v - prevV) < 1e-12 ? 0.5 : -prevV / (v - prevV);
          return prevX + (x - prevX) * t;
        }
        prevX = x;
        prevV = v;
      }
      return null;
    }

    interceptOnYAxis(valueAt) {
      const { yRange } = this.options;
      const x = 0;
      let prevY = yRange[0];
      let prevV = valueAt(x, prevY);
      for (let i = 1; i <= 400; i += 1) {
        const y = yRange[0] + ((yRange[1] - yRange[0]) * i) / 400;
        const v = valueAt(x, y);
        if ((prevV <= 0 && v >= 0) || (prevV >= 0 && v <= 0)) {
          const t = Math.abs(v - prevV) < 1e-12 ? 0.5 : -prevV / (v - prevV);
          return prevY + (y - prevY) * t;
        }
        prevY = y;
        prevV = v;
      }
      return null;
    }

    findRootsAlongX(y, valueAt, steps = 500, maxIter = 60) {
      const { xRange } = this.options;
      const roots = [];
      let prevX = xRange[0];
      let prevV = valueAt(prevX, y);
      for (let i = 1; i <= steps; i += 1) {
        const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / steps;
        const v = valueAt(x, y);
        if ((prevV <= 0 && v >= 0) || (prevV >= 0 && v <= 0)) {
          let loX = prevX;
          let hiX = x;
          let loV = prevV;
          let hiV = v;
          for (let iter = 0; iter < maxIter; iter += 1) {
            const midX = 0.5 * (loX + hiX);
            const midV = valueAt(midX, y);
            if (Math.abs(midV) < 1e-9) {
              loX = midX;
              hiX = midX;
              break;
            }
            if ((loV <= 0 && midV >= 0) || (loV >= 0 && midV <= 0)) {
              hiX = midX;
              hiV = midV;
            } else {
              loX = midX;
              loV = midV;
            }
          }
          roots.push(0.5 * (loX + hiX));
        }
        prevX = x;
        prevV = v;
      }
      return dedupePoints(roots.map((x) => ({ x, y })), 1e-6).map((point) => point.x);
    }

    findRootsAlongY(x, valueAt, steps = 500, maxIter = 60) {
      const { yRange } = this.options;
      const roots = [];
      let prevY = yRange[0];
      let prevV = valueAt(x, prevY);
      for (let i = 1; i <= steps; i += 1) {
        const y = yRange[0] + ((yRange[1] - yRange[0]) * i) / steps;
        const v = valueAt(x, y);
        if ((prevV <= 0 && v >= 0) || (prevV >= 0 && v <= 0)) {
          let loY = prevY;
          let hiY = y;
          let loV = prevV;
          let hiV = v;
          for (let iter = 0; iter < maxIter; iter += 1) {
            const midY = 0.5 * (loY + hiY);
            const midV = valueAt(x, midY);
            if (Math.abs(midV) < 1e-9) {
              loY = midY;
              hiY = midY;
              break;
            }
            if ((loV <= 0 && midV >= 0) || (loV >= 0 && midV <= 0)) {
              hiY = midY;
              hiV = midV;
            } else {
              loY = midY;
              loV = midV;
            }
          }
          roots.push(0.5 * (loY + hiY));
        }
        prevY = y;
        prevV = v;
      }
      return dedupePoints(roots.map((yy) => ({ x, y: yy })), 1e-6).map((point) => point.y);
    }

    findRootAlongY(x, valueAt, maxIter = 60) {
      const { yRange } = this.options;
      let prevY = yRange[0];
      let prevV = valueAt(x, prevY);
      for (let i = 1; i <= 500; i += 1) {
        const y = yRange[0] + ((yRange[1] - yRange[0]) * i) / 500;
        const v = valueAt(x, y);
        if ((prevV <= 0 && v >= 0) || (prevV >= 0 && v <= 0)) {
          let loY = prevY;
          let hiY = y;
          let loV = prevV;
          let hiV = v;
          for (let iter = 0; iter < maxIter; iter += 1) {
            const midY = 0.5 * (loY + hiY);
            const midV = valueAt(x, midY);
            if (Math.abs(midV) < 1e-8) {
              return midY;
            }
            if ((loV <= 0 && midV >= 0) || (loV >= 0 && midV <= 0)) {
              hiY = midY;
              hiV = midV;
            } else {
              loY = midY;
              loV = midV;
            }
          }
          return 0.5 * (loY + hiY);
        }
        prevY = y;
        prevV = v;
      }
      return null;
    }

    findRootAlongX(y, valueAt, maxIter = 60) {
      const { xRange } = this.options;
      let prevX = xRange[0];
      let prevV = valueAt(prevX, y);
      for (let i = 1; i <= 500; i += 1) {
        const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / 500;
        const v = valueAt(x, y);
        if ((prevV <= 0 && v >= 0) || (prevV >= 0 && v <= 0)) {
          let loX = prevX;
          let hiX = x;
          let loV = prevV;
          let hiV = v;
          for (let iter = 0; iter < maxIter; iter += 1) {
            const midX = 0.5 * (loX + hiX);
            const midV = valueAt(midX, y);
            if (Math.abs(midV) < 1e-8) {
              return midX;
            }
            if ((loV <= 0 && midV >= 0) || (loV >= 0 && midV <= 0)) {
              hiX = midX;
              hiV = midV;
            } else {
              loX = midX;
              loV = midV;
            }
          }
          return 0.5 * (loX + hiX);
        }
        prevX = x;
        prevV = v;
      }
      return null;
    }

    representativeAnchors() {
      const { xRange, yRange } = this.options;
      const buckets = new Map([
        ['++', []],
        ['+-', []],
        ['-+', []],
        ['--', []]
      ]);
      const nx = 64;
      const ny = 44;
      const padX = 0.08 * (xRange[1] - xRange[0]);
      const padY = 0.08 * (yRange[1] - yRange[0]);

      for (let ix = 0; ix < nx; ix += 1) {
        for (let iy = 0; iy < ny; iy += 1) {
          const x = xRange[0] + padX + ((ix + 0.5) / nx) * (xRange[1] - xRange[0] - 2 * padX);
          const y = yRange[0] + padY + ((iy + 0.5) / ny) * (yRange[1] - yRange[0] - 2 * padY);
          const value = this.evaluate(x, y);
          if (!Number.isFinite(value.dx) || !Number.isFinite(value.dy)) {
            continue;
          }
          const key = `${value.dx >= 0 ? '+' : '-'}${value.dy >= 0 ? '+' : '-'}`;
          buckets.get(key).push({ x, y });
        }
      }

      const anchors = [];
      buckets.forEach((points) => {
        if (!points.length) {
          return;
        }
        const mean = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
        mean.x /= points.length;
        mean.y /= points.length;
        let best = points[0];
        let bestDist = Infinity;
        for (const point of points) {
          const dist = Math.hypot(point.x - mean.x, point.y - mean.y);
          if (dist < bestDist) {
            bestDist = dist;
            best = point;
          }
        }
        anchors.push(best);
      });

      return anchors;
    }

    traceNullclineByX(valueAt, samples = 320) {
      const { xRange } = this.options;
      const parts = [];
      let current = [];
      let pending = [];
      for (let i = 0; i <= samples; i += 1) {
        const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / samples;
        const y = this.findRootAlongY(x, valueAt, 50);
        if (y === null || !Number.isFinite(y)) {
          if (current.length) {
            pending.push({ x, y: null });
            if (pending.length > 2) {
              if (current.length > 1) {
                parts.push(current);
              }
              current = [];
              pending = [];
            }
          }
        } else {
          if (pending.length) {
            pending.forEach((miss, index) => {
              const t = (index + 1) / (pending.length + 1);
              const prev = current[current.length - 1];
              current.push({
                x: miss.x,
                y: prev.y + (y - prev.y) * t
              });
            });
            pending = [];
          }
          current.push({ x, y });
        }
      }
      if (current.length > 1) {
        parts.push(current);
      }
      return parts;
    }

    traceNullclineByY(valueAt, samples = 320) {
      const { yRange } = this.options;
      const parts = [];
      let current = [];
      let pending = [];
      for (let i = 0; i <= samples; i += 1) {
        const y = yRange[0] + ((yRange[1] - yRange[0]) * i) / samples;
        const x = this.findRootAlongX(y, valueAt, 50);
        if (x === null || !Number.isFinite(x)) {
          if (current.length) {
            pending.push({ x: null, y });
            if (pending.length > 2) {
              if (current.length > 1) {
                parts.push(current);
              }
              current = [];
              pending = [];
            }
          }
        } else {
          if (pending.length) {
            pending.forEach((miss, index) => {
              const t = (index + 1) / (pending.length + 1);
              const prev = current[current.length - 1];
              current.push({
                x: prev.x + (x - prev.x) * t,
                y: miss.y
              });
            });
            pending = [];
          }
          current.push({ x, y });
        }
      }
      if (current.length > 1) {
        parts.push(current);
      }
      return parts;
    }

    pathFromPoints(points, color, width) {
      const d = points.map((point, index) => {
        const sx = this.toScreenX(point.x);
        const sy = this.toScreenY(point.y);
        return `${index === 0 ? "M" : "L"} ${sx} ${sy}`;
      }).join(" ");
      return createNode("path", {
        d,
        fill: "none",
        stroke: color,
        "stroke-width": width,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      });
    }

    buildSvg() {
      const { width, height, style, vectorField, trajectories } = this.options;
      const svg = createNode("svg", {
        viewBox: `0 0 ${width} ${height}`,
        width,
        height,
        role: "img",
        "aria-label": "Phase diagram"
      });
      svg.appendChild(createNode("rect", { x: 0, y: 0, width, height, fill: style.background }));
      const defs = createNode("defs");
      [
        ["red-arrow", style.componentColor],
        ["green-arrow", style.resultantColor]
      ].forEach(([id, color]) => defs.appendChild(this.marker(id, color)));
      if (vectorField.enabled) {
        defs.appendChild(this.customMarker("vf-arrow", vectorField.color, vectorField.arrowSize));
      }
      if (trajectories.enabled && trajectories.arrows) {
        defs.appendChild(this.customMarker("traj-arrow", trajectories.color, trajectories.arrowSize));
      }
      svg.appendChild(defs);
      return svg;
    }

    marker(id, color) {
      const size = 6;
      const refX = 5.25;
      const refY = 3;
      const marker = createNode("marker", {
        id,
        markerWidth: size,
        markerHeight: size,
        refX,
        refY,
        orient: "auto",
        markerUnits: "userSpaceOnUse"
      });
      marker.appendChild(createNode("path", {
        d: "M 0 0 L 6 3 L 0 6 z",
        fill: color
      }));
      return marker;
    }

    customMarker(id, color, size) {
      const marker = createNode("marker", {
        id,
        markerWidth: size,
        markerHeight: size,
        refX: size * 0.875,
        refY: size * 0.5,
        orient: "auto",
        markerUnits: "userSpaceOnUse"
      });
      marker.appendChild(createNode("path", {
        d: `M 0 0 L ${size} ${size * 0.5} L 0 ${size} z`,
        fill: color
      }));
      return marker;
    }

    drawAxes(svg) {
      const { axisColor, labelColor } = this.options.style;
      const xAxisY = this.toScreenY(0);
      const yAxisX = this.toScreenX(0);
      svg.appendChild(createNode("line", {
        x1: yAxisX,
        y1: xAxisY,
        x2: this.options.margin.left,
        y2: xAxisY,
        stroke: axisColor,
        "stroke-width": 4,
        "stroke-linecap": "butt"
      }));
      svg.appendChild(createNode("line", {
        x1: yAxisX,
        y1: xAxisY,
        x2: this.options.width - this.options.margin.right,
        y2: xAxisY,
        stroke: axisColor,
        "stroke-width": 4,
        "stroke-linecap": "butt"
      }));
      svg.appendChild(createNode("line", {
        x1: yAxisX,
        y1: xAxisY,
        x2: yAxisX,
        y2: this.options.margin.top,
        stroke: this.options.style.nullclineColor,
        "stroke-width": 4,
        "stroke-linecap": "butt"
      }));
      svg.appendChild(createNode("line", {
        x1: yAxisX,
        y1: xAxisY,
        x2: yAxisX,
        y2: this.options.height - this.options.margin.bottom,
        stroke: this.options.style.nullclineColor,
        "stroke-width": 4,
        "stroke-linecap": "butt"
      }));

      svg.appendChild(this.label(this.options.width - this.options.margin.right + 12, xAxisY + 6, "x", 26, labelColor));
      svg.appendChild(this.label(yAxisX + 4, this.options.margin.top - 10, "y", 26, labelColor));
      svg.appendChild(this.label(yAxisX - 12, xAxisY + 26, "0", 22, labelColor));
    }

    drawVectorField(svg) {
      const { vectorField, xRange, yRange } = this.options;
      if (!vectorField.enabled) {
        return;
      }

      for (let ix = 0; ix < vectorField.xCount; ix += 1) {
        for (let iy = 0; iy < vectorField.yCount; iy += 1) {
          const x = xRange[0] + ((ix + 0.5) / vectorField.xCount) * (xRange[1] - xRange[0]);
          const y = yRange[0] + ((iy + 0.5) / vectorField.yCount) * (yRange[1] - yRange[0]);
          const { dx, dy } = this.evaluate(x, y);
          const mag = Math.hypot(dx, dy);
          if (!Number.isFinite(mag) || mag < 1e-9) {
            continue;
          }

          const sx = this.toScreenX(x);
          const sy = this.toScreenY(y);
          const ux = dx / mag;
          const uy = -dy / mag;
          const len = Math.max(vectorField.minLength, Math.min(vectorField.maxLength, mag * vectorField.scale));
          const ex = sx + ux * len;
          const ey = sy + uy * len;

          svg.appendChild(createNode("line", {
            x1: sx,
            y1: sy,
            x2: ex,
            y2: ey,
            stroke: vectorField.color,
            "stroke-width": vectorField.strokeWidth,
            opacity: vectorField.opacity,
            "stroke-linecap": "round",
            "marker-end": "url(#vf-arrow)"
          }));
        }
      }
    }

    classifyRegion(point) {
      const value = this.evaluate(point.x, point.y);
      return `${value.dx >= 0 ? "+" : "-"}${value.dy >= 0 ? "+" : "-"}`;
    }

    boundarySamples(samplesPerEdge = 120) {
      const { xRange, yRange } = this.options;
      const points = [];
      for (let i = 0; i <= samplesPerEdge; i += 1) {
        const tx = i / samplesPerEdge;
        const x = xRange[0] + tx * (xRange[1] - xRange[0]);
        points.push({ x, y: yRange[0], edge: "bottom", t: tx });
        points.push({ x, y: yRange[1], edge: "top", t: tx });
      }
      for (let i = 1; i < samplesPerEdge; i += 1) {
        const ty = i / samplesPerEdge;
        const y = yRange[0] + ty * (yRange[1] - yRange[0]);
        points.push({ x: xRange[0], y, edge: "left", t: ty });
        points.push({ x: xRange[1], y, edge: "right", t: ty });
      }
      return points;
    }

    defaultTrajectorySeeds() {
      const { trajectories } = this.options;
      const targetPerRegion = trajectories.perRegion || 3;
      const regions = new Map([
        ["++", []],
        ["+-", []],
        ["-+", []],
        ["--", []]
      ]);
      const candidates = this.boundarySamples(180)
        .map((point) => ({ ...point, region: this.classifyRegion(point) }))
        .filter((point) => regions.has(point.region));

      for (const [region, bucket] of regions.entries()) {
        const regionPoints = candidates.filter((point) => point.region === region);
        if (!regionPoints.length) {
          continue;
        }
        const stride = regionPoints.length / targetPerRegion;
        for (let i = 0; i < targetPerRegion; i += 1) {
          const idx = Math.min(regionPoints.length - 1, Math.floor((i + 0.5) * stride));
          const chosen = regionPoints[idx];
          bucket.push({ x: chosen.x, y: chosen.y });
        }
      }

      return Array.from(regions.values()).flat();
    }

    polylineLength(points) {
      let total = 0;
      for (let i = 1; i < points.length; i += 1) {
        total += Math.hypot(
          this.toScreenX(points[i].x) - this.toScreenX(points[i - 1].x),
          this.toScreenY(points[i].y) - this.toScreenY(points[i - 1].y)
        );
      }
      return total;
    }

    addTrajectoryArrows(svg, points, trajectories) {
      if (points.length < 3 || !trajectories.arrows) {
        return;
      }
      let accumulated = 0;
      let nextMark = trajectories.arrowSpacing;
      for (let i = 1; i < points.length; i += 1) {
        const x1 = this.toScreenX(points[i - 1].x);
        const y1 = this.toScreenY(points[i - 1].y);
        const x2 = this.toScreenX(points[i].x);
        const y2 = this.toScreenY(points[i].y);
        const segLen = Math.hypot(x2 - x1, y2 - y1);
        if (segLen < 1e-6) {
          continue;
        }
        while (accumulated + segLen >= nextMark) {
          const t = (nextMark - accumulated) / segLen;
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          const ux = (x2 - x1) / segLen;
          const uy = (y2 - y1) / segLen;
          const back = 10;
          svg.appendChild(createNode("line", {
            x1: px - ux * back,
            y1: py - uy * back,
            x2: px,
            y2: py,
            stroke: trajectories.color,
            "stroke-width": trajectories.strokeWidth,
            opacity: trajectories.opacity,
            "stroke-linecap": "round",
            "marker-end": "url(#traj-arrow)"
          }));
          nextMark += trajectories.arrowSpacing;
        }
        accumulated += segLen;
      }
    }

    drawTrajectories(svg) {
      const { trajectories } = this.options;
      if (!trajectories.enabled) {
        return;
      }
      const seeds = trajectories.seeds.length ? trajectories.seeds : this.defaultTrajectorySeeds();
      seeds.forEach((seed) => {
        const start = Array.isArray(seed) ? { x: seed[0], y: seed[1] } : seed;
        const points = this.integrate(start, trajectories.dt, trajectories.steps);
        if (points.length < 2) {
          return;
        }
        if (this.polylineLength(points) < 28) {
          return;
        }
        const d = points.map((point, index) => {
          const sx = this.toScreenX(point.x);
          const sy = this.toScreenY(point.y);
          return `${index === 0 ? "M" : "L"} ${sx} ${sy}`;
        }).join(" ");
        svg.appendChild(createNode("path", {
          d,
          fill: "none",
          stroke: trajectories.color,
          "stroke-width": trajectories.strokeWidth,
          opacity: trajectories.opacity,
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        }));
        this.addTrajectoryArrows(svg, points, trajectories);
      });
    }

    label(x, y, text, size, color, anchor = "start") {
      const node = createNode("text", {
        x,
        y,
        "font-size": size,
        "font-family": "Times New Roman, serif",
        "text-anchor": anchor,
        fill: color
      });
      node.textContent = text;
      return node;
    }

    drawNullclines(svg) {
      const { nullclineColor } = this.options.style;
      const dxSegments = this.contourSegments((x, y) => this.evaluate(x, y).dx, 120, 120);
      dxSegments.forEach((segment) => svg.appendChild(this.segment(segment, nullclineColor, 4)));
      const dyParts = this.traceNullclineByX((x, y) => this.evaluate(x, y).dy, 360);
      if (dyParts.length) {
        dyParts.forEach((part) => svg.appendChild(this.pathFromPoints(part, nullclineColor, 4)));
      } else {
        const dySegments = this.contourSegments((x, y) => this.evaluate(x, y).dy, 120, 120);
        dySegments.forEach((segment) => svg.appendChild(this.segment(segment, nullclineColor, 4)));
      }

      const xIntercept = this.interceptOnXAxis((x, y) => this.evaluate(x, y).dy);
      const yIntercept = this.interceptOnYAxis((x, y) => this.evaluate(x, y).dy);
      if (xIntercept !== null && !nearlyEqual(xIntercept, 0, 1e-3)) {
        svg.appendChild(this.label(this.toScreenX(xIntercept), this.toScreenY(0) + 26, this.formatNumber(xIntercept), 22, "#111111", "middle"));
      }
      if (yIntercept !== null && !nearlyEqual(yIntercept, 0, 1e-3)) {
        svg.appendChild(this.label(this.toScreenX(0) - 8, this.toScreenY(yIntercept) + 8, this.formatNumber(yIntercept), 22, "#111111", "end"));
      }
    }

    segment([a, b], color, width) {
      return createNode("line", {
        x1: this.toScreenX(a.x),
        y1: this.toScreenY(a.y),
        x2: this.toScreenX(b.x),
        y2: this.toScreenY(b.y),
        stroke: color,
        "stroke-width": width,
        "stroke-linecap": "round"
      });
    }

    formatNumber(value) {
      const rounded = Math.abs(value) < 1e-9 ? 0 : value;
      return Number.isInteger(Math.round(rounded)) && Math.abs(rounded - Math.round(rounded)) < 1e-6
        ? String(Math.round(rounded))
        : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }

    drawComponentArrows(svg) {
      const { componentColor, resultantColor } = this.options.style;
      const anchors = this.representativeAnchors();
      const marginPx = 18;
      anchors.forEach((anchor) => {
        const evalAt = this.evaluate(anchor.x, anchor.y);
        const sx = this.toScreenX(anchor.x);
        const sy = this.toScreenY(anchor.y);

        const dxRoots = [
          ...this.findRootsAlongX(anchor.y, (x, y) => this.evaluate(x, y).dx),
          ...this.findRootsAlongX(anchor.y, (x, y) => this.evaluate(x, y).dy)
        ];
        const dyRoots = [
          ...this.findRootsAlongY(anchor.x, (x, y) => this.evaluate(x, y).dx),
          ...this.findRootsAlongY(anchor.x, (x, y) => this.evaluate(x, y).dy)
        ];

        const horizontalCandidates = dxRoots
          .map((rootX) => this.toScreenX(rootX) - sx)
          .filter((delta) => evalAt.dx >= 0 ? delta > 0 : delta < 0);
        const verticalCandidates = dyRoots
          .map((rootY) => this.toScreenY(rootY) - sy)
          .filter((delta) => evalAt.dy >= 0 ? delta < 0 : delta > 0);

        const horizontalLimit = horizontalCandidates.length
          ? Math.min(...horizontalCandidates.map((delta) => Math.abs(delta))) - marginPx
          : 52;
        const verticalLimit = verticalCandidates.length
          ? Math.min(...verticalCandidates.map((delta) => Math.abs(delta))) - marginPx
          : 52;

        let px = Math.max(15, Math.min(60, horizontalLimit * 1.5));
        let py = Math.max(15, Math.min(60, verticalLimit * 1.5));

        const boundaryGap = (testX, testY) => {
          const dxRootsAtY = [
            ...this.findRootsAlongX(testY, (x, y) => this.evaluate(x, y).dx),
            ...this.findRootsAlongX(testY, (x, y) => this.evaluate(x, y).dy)
          ];
          const dyRootsAtX = [
            ...this.findRootsAlongY(testX, (x, y) => this.evaluate(x, y).dx),
            ...this.findRootsAlongY(testX, (x, y) => this.evaluate(x, y).dy)
          ];
          const horizontalGap = dxRootsAtY.length
            ? Math.min(...dxRootsAtY.map((rootX) => Math.abs(this.toScreenX(rootX) - testX)))
            : Infinity;
          const verticalGap = dyRootsAtX.length
            ? Math.min(...dyRootsAtX.map((rootY) => Math.abs(this.toScreenY(rootY) - testY)))
            : Infinity;
          return Math.min(horizontalGap, verticalGap);
        };

        let hx = sx + (evalAt.dx >= 0 ? px : -px);
        let vy = sy + (evalAt.dy >= 0 ? -py : py);

        let diagonalGap = boundaryGap(hx, vy);
        let attempts = 0;
        while (diagonalGap < marginPx && attempts < 8) {
          px *= 0.82;
          py *= 0.82;
          hx = sx + (evalAt.dx >= 0 ? px : -px);
          vy = sy + (evalAt.dy >= 0 ? -py : py);
          diagonalGap = boundaryGap(hx, vy);
          attempts += 1;
        }

        px = Math.max(12, px);
        py = Math.max(12, py);
        hx = sx + (evalAt.dx >= 0 ? px : -px);
        vy = sy + (evalAt.dy >= 0 ? -py : py);

        svg.appendChild(createNode("line", {
          x1: sx,
          y1: sy,
          x2: hx,
          y2: sy,
          stroke: componentColor,
          "stroke-width": 2,
          "stroke-linecap": "butt",
          "marker-end": "url(#red-arrow)"
        }));
        svg.appendChild(createNode("line", {
          x1: sx,
          y1: sy,
          x2: sx,
          y2: vy,
          stroke: componentColor,
          "stroke-width": 2,
          "stroke-linecap": "butt",
          "marker-end": "url(#red-arrow)"
        }));
        svg.appendChild(createNode("line", {
          x1: sx,
          y1: sy,
          x2: hx,
          y2: vy,
          stroke: resultantColor,
          "stroke-width": 2,
          "stroke-linecap": "butt",
          "marker-end": "url(#green-arrow)"
        }));
      });
    }

    drawEquilibrium(svg) {
      if (!this.equilibrium) {
        return;
      }
      svg.appendChild(createNode("circle", {
        cx: this.toScreenX(this.equilibrium.x),
        cy: this.toScreenY(this.equilibrium.y),
        r: 4.2,
        fill: this.options.style.nullclineColor
      }));
    }

    render() {
      const equilibria = this.findEquilibria();
      this.equilibrium = equilibria[0] || { x: 0, y: 0 };
      const svg = this.buildSvg();
      this.drawVectorField(svg);
      this.drawAxes(svg);
      this.drawNullclines(svg);
      this.drawTrajectories(svg);
      this.drawComponentArrows(svg);
      this.drawEquilibrium(svg);
      this.options.target.innerHTML = "";
      this.options.target.appendChild(svg);
      return svg;
    }
  }

  window.PhaseDiagramRenderer = PhaseDiagramRenderer;
})();
