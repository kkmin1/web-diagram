import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
import matplotlib.lines as mlines
import matplotlib.patches as mpatches
from matplotlib.legend_handler import HandlerPatch
from scipy.integrate import odeint

# ── 한글 폰트 설정 ──────────────────────────────────────────────
import platform

def set_korean_font():
    system = platform.system()
    if system == 'Windows':
        candidates = ['Malgun Gothic', '맑은 고딕']
    elif system == 'Darwin':
        candidates = ['AppleGothic', 'Apple SD Gothic Neo']
    else:  # Linux (SageMath 서버 포함)
        candidates = ['NanumGothic', 'NanumBarunGothic', 'UnDotum', 'DejaVu Sans']

    available = {f.name for f in fm.fontManager.ttflist}
    for name in candidates:
        if name in available:
            plt.rcParams['font.family'] = name
            break
    plt.rcParams['axes.unicode_minus'] = False

set_korean_font()

# ── 화살표를 범례 아이콘으로 그리는 커스텀 핸들러 ──────────────
class HandlerArrow(HandlerPatch):
    def create_artists(self, legend, orig_handle,
                       xdescent, ydescent, width, height,
                       fontsize, trans):
        arrow = mpatches.FancyArrow(
            x=xdescent, y=height / 2,
            dx=width, dy=0,
            length_includes_head=True,
            head_width=height * 0.6,
            head_length=width * 0.3,
            width=height * 0.15,
            color=orig_handle.get_facecolor()
        )
        self.update_prop(arrow, orig_handle, legend)
        arrow.set_transform(trans)
        return [arrow]

# ── ODE 및 화살표 유틸 ─────────────────────────────────────────
def add_arrow_to_line2D(
    axes, line, arrow_locs=[0.2, 0.4, 0.6, 0.8],
    arrowstyle='-|>', arrowsize=1, transform=None):

    if not isinstance(line, mlines.Line2D):
        raise ValueError("expected a matplotlib.lines.Line2D object")
    x, y = line.get_xdata(), line.get_ydata()

    arrow_kw = {
        "arrowstyle": arrowstyle,
        "mutation_scale": 10 * arrowsize,
    }

    color = line.get_color()
    use_multicolor_lines = isinstance(color, np.ndarray)
    if use_multicolor_lines:
        raise NotImplementedError("multicolor lines not supported")
    else:
        arrow_kw['color'] = color

    linewidth = line.get_linewidth()
    if isinstance(linewidth, np.ndarray):
        raise NotImplementedError("multiwidth lines not supported")
    else:
        arrow_kw['linewidth'] = linewidth

    if transform is None:
        transform = axes.transData

    arrows = []
    for loc in arrow_locs:
        s = np.cumsum(np.sqrt(np.diff(x) ** 2 + np.diff(y) ** 2))
        n = np.searchsorted(s, s[-1] * loc)
        arrow_tail = (x[n], y[n])
        arrow_head = (np.mean(x[n:n + 2]), np.mean(y[n:n + 2]))
        p = mpatches.FancyArrowPatch(
            arrow_tail, arrow_head, transform=transform,
            **arrow_kw)
        axes.add_patch(p)
        arrows.append(p)
    return arrows


def f(y, t):
    y1, y2 = y
    dydt = [-2*y1, 2*y1-4*y2+32]
    return dydt

# ── 격자 및 벡터장 ─────────────────────────────────────────────
x = np.linspace(-16, 16, 21)
y = np.linspace(-16, 16, 21)
X, Y = np.meshgrid(x, y)

t = np.linspace(0, 10, 101)
u, v = np.zeros(X.shape), np.zeros(Y.shape)
NI, NJ = X.shape
for i in range(NI):
    for j in range(NJ):
        xdot = f([X[i,j], Y[i,j]], t)
        u[i,j] = xdot[0]
        v[i,j] = xdot[1]

# 벡터를 단위벡터로 정규화 (방향만 표시, 길이는 균일)
magnitude = np.sqrt(u**2 + v**2)
magnitude[magnitude == 0] = 1  # 0으로 나누기 방지
u_norm = u / magnitude
v_norm = v / magnitude

fig, ax = plt.subplots(1, 1, figsize=(8, 5))
ax.quiver(X, Y, u_norm, v_norm, color='r', scale=25, width=0.003)

# ── 궤적 ───────────────────────────────────────────────────────
u1 = np.linspace(-15, 15, 4)
v1 = np.linspace(-15, 15, 4)

initial_conditions = []
for i in range(len(u1)):
    for j in range(len(v1)):
        initial_conditions.append([u1[i], v1[j]])

lines = []
for idx, y in enumerate(initial_conditions):
    sol = odeint(f, y, t)
    lbl = 'Trajectory' if idx == 0 else ""
    line, = ax.plot(sol[:,0], sol[:,1], 'b', label=lbl)
    lines.append(line)

for line in lines:
    add_arrow_to_line2D(ax, line,
                        arrow_locs=[0.2, 0.4, 0.6, 0.8, 1.0],
                        arrowstyle='->')

# ── 범례: 빨간 화살표 + 파란 선 ────────────────────────────────
vector_field_handle = mpatches.FancyArrow(
    0, 0, 1, 0, color='r', label='벡터장'
)
trajectory_handle = mlines.Line2D([], [], color='b', label='Trajectory')

plt.xlabel('x')
plt.ylabel('y')
plt.subplots_adjust(right=0.75)
plt.legend(
    handles=[vector_field_handle, trajectory_handle],
    handler_map={mpatches.FancyArrow: HandlerArrow()},
    bbox_to_anchor=(1.05, 1), loc='upper left',
    borderaxespad=0., shadow=True, fancybox=True
)
plt.grid(True)
plt.show()
