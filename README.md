# HELIX Studio

参数化 G-code 生成与实时预览工具。在浏览器中通过数学函数描述 3D 打印路径，实时以 Three.js 三维预览打印结果，并直接导出可交给切片器或打印机使用的 G-code 与 STL 文件。纯前端实现，无需后端服务。

## 功能

- **内置生成器**：螺旋花瓶、多边花瓶、波纹珊瑚、层叠花瓣，均提供可实时调节的造型参数。
- **自定义脚本**：使用 FullControl 风格的 JavaScript API 直接控制每一条打印路径。
- **实时预览**：Three.js 渲染挤出墙面与空走路径，支持轨道控制、视角重置、旅行路径开关。
- **逐层回放**：拖动层滑块或点击播放，查看模型逐层生成过程。
- **打印参数**：层高、线宽、打印速度、空走速度、喷头/热床温度、打印床尺寸、耗材直径。
- **统计信息**：层数、路径长度、预计打印时间、耗材质量与尺寸。
- **导出**：一键下载 `.gcode`（含加热、回零、风扇与收尾指令）与二进制 `.stl`（由挤出路径扫掠成实体）。

## 技术栈

| 类别 | 选型 |
| --- | --- |
| 构建 | Vite 5 |
| 框架 | React 18 + TypeScript 5 |
| 3D 渲染 | Three.js（`OrbitControls`） |
| 路径生成 | Web Worker（独立线程，避免阻塞界面） |

## 快速开始

需要 Node.js 18 及以上版本。

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 类型检查并构建生产版本到 dist/
npm run build

# 预览构建产物（默认 http://localhost:4173）
npm run preview
```

## 使用说明

1. 在左侧「模型库」中选择一个生成器。
2. 调整「造型参数」，模型与路径会实时重新生成；高级参数可展开查看。
3. 在「打印机与材料」中设置层高、线宽、温度与打印床尺寸，这些参数会写入 G-code，也影响 STL 厚度。
4. 在视口中旋转缩放查看模型，使用底部滑块或播放按钮进行逐层预览。
5. 点击右上角导出 G-code 或 STL；「G-code」按钮可打开代码抽屉查看完整内容。

## 自定义脚本 API

选择「自定义脚本」后可在浏览器内执行 JavaScript（通过 `new Function` 构造，运行在 Web Worker 中）。坐标系以打印床中心为原点，单位为毫米。

| API | 说明 |
| --- | --- |
| `fc.moveTo(x, y, z)` | 空走移动到目标点 |
| `fc.extrudeTo(x, y, z, width?)` | 挤出到目标点，首次调用会自动设为起点 |
| `fc.circle(cx, cy, r, z, segs?, width?)` | 在给定高度挤出整圆 |
| `fc.print` | 当前打印参数（层高、线宽、速度等） |
| `fc.bedCenter` | 打印床中心坐标 |

示例（每转上升一个层高的螺旋）：

```js
const { sin, cos, PI } = Math;
const H = 96;
const lh = fc.print.layerHeight;
const TURNS = Math.round(H / lh);
const STEPS = TURNS * 90;

for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  const a = t * TURNS * 2 * PI;
  const z = lh + t * (H - lh);
  const r = 26 + 8 * sin(t * PI * 1.6) + 2.6 * sin(a * 5) * sin(t * PI);
  fc.extrudeTo(r * cos(a), r * sin(a), z);
}
```

脚本死循环或路径点数过多会触发 9 秒超时保护，此时 Worker 会被终止并提示错误。脚本为本地执行，请勿运行不受信任的代码。

## 目录结构

```
├─ index.html                 # 页面入口
├─ vite.config.ts             # Vite 配置（相对路径 base，ES2020 构建目标）
├─ src/
│  ├─ main.tsx                # React 挂载入口
│  ├─ App.tsx                 # 主界面、状态管理与生成调度
│  ├─ styles.css              # 全局样式
│  ├─ components/
│  │  ├─ Sidebar.tsx          # 模型库、造型参数、打印设置、脚本编辑器
│  │  ├─ Viewport.tsx         # Three.js 场景、打印床与路径网格
│  │  └─ GcodeDrawer.tsx      # G-code 查看抽屉
│  ├─ core/
│  │  ├─ types.ts             # 共享类型定义
│  │  ├─ catalog.ts           # 生成器定义与参数元数据
│  │  ├─ generators.ts        # 各生成器的路径算法与自定义脚本执行
│  │  ├─ path.ts              # PathBuilder：累积挤出/空走操作
│  │  ├─ gcode.ts             # G-code 序列化与统计计算
│  │  ├─ stl.ts               # 由路径扫掠生成二进制 STL
│  │  ├─ pack.ts              # 打包为渲染用 TypedArray
│  │  └─ download.ts          # 文件下载
│  ├─ render/
│  │  └─ buildGeometry.ts     # 由打包数据构建 Three.js 几何体
│  └─ worker/
│     └─ generate.worker.ts   # 路径生成、G-code 与打包的后台线程
```

## 数据流

```
参数/脚本变更
   └─> Web Worker（generatePaths → PathBuilder.ops）
        ├─> writeGcode → gcode + stats
        └─> packResult → GenResult（TypedArray + 包围盒 + 统计）
             └─> 主线程 Viewport 构建几何体并渲染，逐层预览只调整 drawRange
```

## 说明与限制

- 生成器面向单壁/装饰性几何，不包含填充、支撑与多周墙，请按花瓶模式使用。
- 预计打印时间为粗略估算（按路径长度 / 速度 + 固定开销），与切片器结果可能存在差异。
- 导出 STL 时会将相邻路径合并为墙带并做抽稀（最多约 4 万个采样点），大尺寸模型细节会被简化。
- 生成的 G-code 使用绝对定位（`G90`）+ 相对挤出（`M83`），请确认与目标打印机固件兼容。
