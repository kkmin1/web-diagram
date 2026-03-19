const canvas = document.getElementById("phaseCanvas");
const ctx = canvas.getContext("2d");


const padding = 72;
const width = canvas.width;
const height = canvas.height;
let xDomain = { min: -10, max: 30 };
let yDomain = { min: 0, max: 40 };

function toPxX(x) {
    const t = (x - xDomain.min) / (xDomain.max - xDomain.min);
    return padding + t * (width - 2 * padding);
}

function toPxY(y) {
    const t = (y - yDomain.min) / (yDomain.max - yDomain.min);
    return height - padding - t * (height - 2 * padding);
}

function fmt(n) {
    const r = Math.round(n * 1000) / 1000;
    if (Object.is(r, -0)) return "0";
    return String(r);
}

function createEvaluator(expression) {
    try {
        let jsExpr = expression
            .replace(/\bsin\b/g, 'Math.sin')
            .replace(/\bcos\b/g, 'Math.cos')
            .replace(/\btan\b/g, 'Math.tan')
            .replace(/\bexp\b/g, 'Math.exp')
            .replace(/\babs\b/g, 'Math.abs')
            .replace(/\bsqrt\b/g, 'Math.sqrt')
            .replace(/\blog\b/g, 'Math.log')
            .replace(/\bpow\b/g, 'Math.pow')
            .replace(/\bpi\b/gi, 'Math.PI')
            .replace(/\be\b/gi, 'Math.E')
            .replace(/\^/g, '**');

        const f = new Function('x', 'y', `return ${jsExpr};`);
        // 테스트 실행
        f(1, 1);
        return f;
    } catch (e) {
        return null;
    }
}

function buildSystem() {
    const exprX = document.getElementById("exprX").value;
    const exprY = document.getElementById("exprY").value;
    const evalX = createEvaluator(exprX);
    const evalY = createEvaluator(exprY);

    if (!evalX || !evalY) {
        alert("수식 오류가 있습니다.");
        return null;
    }

    return function system(x, y) {
        try {
            return {
                dx: evalX(x, y),
                dy: evalY(x, y)
            };
        } catch (e) {
            return { dx: 0, dy: 0 };
        }
    };
}

function rk4Step(system, x, y, dt) {
    const k1 = system(x, y);
    const k2 = system(x + 0.5 * dt * k1.dx, y + 0.5 * dt * k1.dy);
    const k3 = system(x + 0.5 * dt * k2.dx, y + 0.5 * dt * k2.dy);
    const k4 = system(x + dt * k3.dx, y + dt * k3.dy);

    return {
        x: x + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx),
        y: y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy)
    };
}

function drawArrow(x1, y1, x2, y2, color, size = 6) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function drawAxes() {
    ctx.strokeStyle = "#d8e0ed";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#495e7a";
    ctx.font = "12px sans-serif";

    // X축 눈금 (10분할, 정수 표시)
    const xStep = (xDomain.max - xDomain.min) / 10;
    for (let i = 0; i <= 10; i++) {
        const v = xDomain.min + i * xStep;
        const x = toPxX(v);
        ctx.beginPath();
        ctx.moveTo(x, toPxY(yDomain.min));
        ctx.lineTo(x, toPxY(yDomain.max));
        ctx.stroke();

        // 정수 레이블 표시
        const label = Math.round(v);
        if (Math.abs(v) < 0.001) {
            if (xDomain.min <= 0 && xDomain.max >= 0) ctx.fillText("0", x - 4, toPxY(0) + 16);
        } else {
            ctx.fillText(String(label), x - 8, toPxY(0) + 16);
        }
    }

    // Y축 눈금 (10분할, 정수 표시)
    const yStep = (yDomain.max - yDomain.min) / 10;
    for (let i = 0; i <= 10; i++) {
        const v = yDomain.min + i * yStep;
        const y = toPxY(v);
        ctx.beginPath();
        ctx.moveTo(toPxX(xDomain.min), y);
        ctx.lineTo(toPxX(xDomain.max), y);
        ctx.stroke();

        const label = Math.round(v);
        if (Math.abs(v) < 0.001) {
            if (yDomain.min <= 0 && yDomain.max >= 0) ctx.fillText("0", toPxX(0) + 8, y + 4);
        } else {
            ctx.fillText(String(label), toPxX(0) + 8, y + 4);
        }
    }

    ctx.strokeStyle = "#7489a6";
    ctx.lineWidth = 1.7;

    if (xDomain.min <= 0 && xDomain.max >= 0) {
        ctx.beginPath();
        ctx.moveTo(toPxX(0), toPxY(yDomain.min));
        ctx.lineTo(toPxX(0), toPxY(yDomain.max));
        ctx.stroke();
    }

    if (yDomain.min <= 0 && yDomain.max >= 0) {
        ctx.beginPath();
        ctx.moveTo(toPxX(xDomain.min), toPxY(0));
        ctx.lineTo(toPxX(xDomain.max), toPxY(0));
        ctx.stroke();
    }

    ctx.fillStyle = "#1b2e46";
    ctx.font = "14px sans-serif";
    ctx.fillText("x축", toPxX(xDomain.max) + 10, toPxY(0) + 4);
    ctx.fillText("y축", toPxX(0) - 8, toPxY(yDomain.max) - 12);
    ctx.restore();
}

function drawVectorField(system) {
    const grid = 21;
    const xStep = (xDomain.max - xDomain.min) / (grid - 1);
    const yStep = (yDomain.max - yDomain.min) / (grid - 1);
    const vecLen = 11;

    for (let i = 0; i < grid; i++) {
        for (let j = 0; j < grid; j++) {
            const x = xDomain.min + i * xStep;
            const y = yDomain.min + j * yStep;
            const v = system(x, y);
            const mag = Math.hypot(v.dx, v.dy) || 1;
            const ux = (v.dx / mag) * vecLen;
            const uy = (v.dy / mag) * vecLen;

            const sx = toPxX(x);
            const sy = toPxY(y);

            // 수정: pds와 동일하게 정방향으로 표시
            const ex = sx + ux;
            const ey = sy - uy;
            drawArrow(sx, sy, ex, ey, "#ff0000", 4); // 벡터 색상: 빨간색
        }
    }
}

function integrateTrajectory(system, x0, y0, dt, steps) {
    const pts = [{ x: x0, y: y0 }];
    let x = x0;
    let y = y0;

    for (let i = 0; i < steps; i++) {
        const next = rk4Step(system, x, y, dt);
        x = next.x;
        y = next.y;
        pts.push({ x, y });

        if (x < xDomain.min - 5 || x > xDomain.max + 5 || y < yDomain.min - 5 || y > yDomain.max + 5) {
            break;
        }
    }

    return pts;
}

function drawTrajectory(points) {
    if (points.length < 2) return;

    ctx.strokeStyle = "#1b63d0"; // 궤적 색상: 진한 파란색
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(toPxX(points[0].x), toPxY(points[0].y));
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(toPxX(points[i].x), toPxY(points[i].y));
    }
    ctx.stroke();

    // 누적 거리(Arc length) 계산
    const dists = [0];
    let totalDist = 0;
    for (let i = 1; i < points.length; i++) {
        const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        totalDist += d;
        dists.push(totalDist);
    }

    // 거리를 기준으로 촘촘하게 배치 (0.1 단위로 총 10개 지점)
    const marks = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.98];
    for (const m of marks) {
        const targetDist = totalDist * m;
        // 해당 거리에 가장 가까운 시작 인덱스 찾기
        let idx = 0;
        for (let j = 0; j < dists.length - 1; j++) {
            if (dists[j + 1] >= targetDist) {
                idx = j;
                break;
            }
        }

        const p1 = points[idx];
        const p2 = points[idx + 1];
        if (!p1 || !p2) continue;

        // 실제 이동 거리가 있는 경우에만 화살표를 그림 (중첩 방지)
        if (Math.hypot(toPxX(p2.x) - toPxX(p1.x), toPxY(p2.y) - toPxY(p1.y)) > 0.5) {
            drawArrow(toPxX(p1.x), toPxY(p1.y), toPxX(p2.x), toPxY(p2.y), "#1b63d0", 6);
        }
    }
}

function drawAllTrajectories(system) {
    const dt = 0.03;
    const steps = 800; // 박스를 가로지르기에 충분한 단계
    const seedCount = 15; // 각 변 당 시드 개수 증가

    const seeds = [];
    // 1. 테두리 네 변에만 시드 배치 (사용자 요청: 테두리에서 시작하도록)
    for (let i = 0; i <= seedCount; i++) {
        const t = i / seedCount;
        const xDist = xDomain.max - xDomain.min;
        const yDist = yDomain.max - yDomain.min;

        // 좌측/우측 변
        seeds.push({ x: xDomain.min, y: yDomain.min + t * yDist });
        seeds.push({ x: xDomain.max, y: yDomain.min + t * yDist });
        // 상단/하단 변
        if (i > 0 && i < seedCount) {
            seeds.push({ x: xDomain.min + t * xDist, y: yDomain.min });
            seeds.push({ x: xDomain.min + t * xDist, y: yDomain.max });
        }
    }

    for (const s of seeds) {
        // 정방향 적분: 경계에서 안쪽(또는 바깥쪽)으로 나가는 흐름
        const trajForward = integrateTrajectory(system, s.x, s.y, dt, steps);
        drawTrajectory(trajForward);

        // 역방향 적분: 경계로 들어오는 과거의 흐름을 추적
        // 역방향 결과(trajBackward)를 뒤집어야(reverse) 시간 순서대로 화살표가 그려짐
        const trajBackward = integrateTrajectory(system, s.x, s.y, -dt, steps);
        if (trajBackward.length > 1) {
            drawTrajectory(trajBackward.reverse());
        }
    }
}

function render() {
    xDomain.min = Number(document.getElementById("xMin").value);
    xDomain.max = Number(document.getElementById("xMax").value);
    yDomain.min = Number(document.getElementById("yMin").value);
    yDomain.max = Number(document.getElementById("yMax").value);

    const system = buildSystem();
    if (!system) return;

    ctx.clearRect(0, 0, width, height);
    drawAxes();

    // 박스 내부로만 그려지도록 클리핑 영역 설정
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding, padding, width - 2 * padding, height - 2 * padding);
    ctx.clip();

    drawVectorField(system);
    drawAllTrajectories(system);

    ctx.restore();
}

document.getElementById("renderBtn").addEventListener("click", render);
render();
