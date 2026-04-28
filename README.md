# web-diagram

위상도, phase plane, 경제수학/동역학 그래프를 웹에서 실험하기 위한 저장소입니다.

## 개요

브라우저에서 미분방정식이나 동적 시스템을 시각화하는 HTML/JavaScript 실험 파일들을 모아 둔 프로젝트입니다.

주요 파일:
- `phase_diagram.js`: 위상도 렌더링 핵심 로직
- `phase_diagram.py`: 보조 계산/실험 스크립트
- `phase_diagram_demo.html`: 대표 데모 페이지
- `phase-plane-claude.html`, `web-chart.html`: 관련 시각화 실험

## 기능

- 1차원/2차원 위상도 실험
- 수식 입력 기반 그래프 생성
- MathJax를 이용한 수식 표시
- 정적 HTML 파일만으로 빠르게 프로토타이핑 가능

## 실행 방법

정적 서버로 여는 것을 권장합니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000/phase_diagram_demo.html`을 열면 됩니다.

## 용도

- 경제학/수학 강의용 그림 실험
- 동적 시스템 직관화
- 위상도 UI와 렌더링 로직 테스트
