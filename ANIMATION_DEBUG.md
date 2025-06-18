# Animation Debugging Setup

## Overview

We've implemented a comprehensive animation tracing system to debug the slow zoom-to-box animations (currently taking 60+ seconds instead of ~250ms).

## Features

### 🔍 Automatic Tracing

- **Auto-start on click**: Every time you click a node, tracing automatically begins
- **Visual indicator**: A green pulsing indicator appears in the top-right corner showing:
  - Trace name ("zoom_to_box")
  - Elapsed time in real-time
  - Stop button to manually end tracing

### 📊 Detailed Reports

The tracer captures comprehensive metrics:

- **Duration**: Total animation time
- **Distance**: How far the camera needs to travel (likely the issue!)
- **Performance**: Frame rates, dropped frames, timing
- **Progress**: Animation velocity at different stages
- **Issues**: Automatic problem detection with suggestions

### 🛠️ Manual Controls

Available in browser console:

```javascript
// Stop current trace and get report
stopTrace();

// Export trace data as JSON file
exportTrace();

// See all trace summaries
getAllTraces();

// Access full tracer object
animationTracer;
```

## Expected Findings

Based on the 60+ second animation time, we expect to find:

1. **🔴 Large Distance Issue**: Camera traveling >10,000px due to coordinate calculation errors
2. **🔴 Slow Animation**: Duration >60,000ms instead of expected ~250ms
3. **🟡 Poor Progress**: Animation moving very slowly in early frames

## Usage

1. Open the app: `http://localhost:5175`
2. Open browser console (F12)
3. Click any node
4. Watch the green tracing indicator
5. Check console for detailed report when animation completes

## Files Modified

- `src/lib/debug/animationTracer.js` - Main tracing system
- `src/lib/components/TracingIndicator.svelte` - Visual indicator
- `src/lib/components/NodeContainer.svelte` - Auto-start on click
- `src/lib/components/CanvasViewport.svelte` - Added indicator
- `src/routes/+page.svelte` - Load debug tools
- `src/app.d.ts` - Type definitions

## Next Steps

Once we have the trace report, we can:

1. Identify the exact cause of the slow animation
2. Fix the coordinate calculation issues
3. Optimize the animation performance
4. Remove or disable the tracing system in production
