```html
<div id="cursor"></div>
<div class="container">
	<div class="block">
		<h1>iPad Cursor</h1>
	</div>
	<div class="ease-controls block">
		<label data-hover="button" for="ease_default">
			<input type="radio" name="ease" value="default" checked id="ease_default" />
			<span>Default Ease</span>
		</label>
		<label data-hover="button" for="ease_elastic">
			<input type="radio" name="ease" value="elastic" id="ease_elastic" />
			<span>Elastic ease</span>
		</label>
		<label data-hover="button" for="ease_spring">
			<input type="radio" name="ease" value="spring" id="ease_spring" />
			<span>Spring ease</span>
		</label>
	</div>
	<div class="block">
		<input data-hover="input" type="text" class="input" placeholder="Type text here" />
	</div>
	<div class="buttons block">
		<button data-hover="button" class="button">Button 1</button>
		<button data-hover="button" class="button">Button 2</button>
		<button data-hover="button" class="button">Button 3</button>
		<button data-hover="button" class="button">Button 4</button>
		<button data-hover="button" class="button">Button 5</button>
		<button data-hover="button" class="button">Button 6</button>
		<button data-hover="button" class="button">Button 7</button>
		<button data-hover="button" class="button">Button 8</button>
		<button data-hover="button" class="button">Button 9</button>
	</div>
	<div class="block">
		<textarea data-hover="input" class="textarea">Write something fancy here</textarea>
	</div>
</div>
```

```css
body {
  background-color: #000c23;
  color: white;
  font-family: sans-serif;
  padding: 0;
  margin: 0;
}
* {
   cursor: none;
}
.container {
  display: flex;
  max-width: 600px;
  flex-direction: column;
  margin: 0 auto;
  position: relative;
}

h1 {
  text-align: center;
}

.block {
  margin-top: 30px;
  margin-bottom: 30px;
}

.input,
.button,
.textarea {
  font-size: 1.5rem;
  color: white;
  background: none;
  border: none;
  width: 100%;

  &:focus {
    outline: none;
  }
}

label {
  padding: 10px;
}

.buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-gap: 2rem;
}

.button {
  width: 100%;
  height: 2.5rem;
  // outline: 1px dashed white;
}


#cursor {
  height: 20px;
  width: 20px;
  border-radius: 10px;
  position: fixed;
  background-color: rgba(255, 255, 255, 0.5);
  pointer-events: none;
  z-index: 0;
}
.ease-controls {
  display: flex;
  justify-content: space-around;
  input[type="radio"] {
    font-size: 2rem;
    margin: 0 1rem;
  }
  span {
    font-size: 1.5rem;
  }
  label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}
```

```js
const cursor = document.querySelector('#cursor');
const secondaryCursor = document.querySelector('#secondary-cursor');
let hoverContext = null;
let duration = 400;
let transitioning = null;
let defaultCursorSize = 20;
const defaultEaseMode = 'default';
let easeMode = defaultEaseMode;

const mousePosition = { x: 0, y: 0 };
let cursorPosition = { x: 0, y: 0 };

const easers = {
	default: (t) => 1 - Math.pow(1 - t, 5),
	elastic: (t) =>
		t === 0
			? 0
			: t === 1
				? 1
				: Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
	spring(t) {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	}
};

function ease(t) {
	return easeMode in easers ? easers[easeMode](t) : t;
}

function setPosition(event) {
	mousePosition.x = event.clientX;
	mousePosition.y = event.clientY;
}

function updateCursor(time) {
	if (transitioning && transitioning.time + duration < time) {
		transitioning = null;
	}
	if (hoverContext) {
		switch (hoverContext.type) {
			case 'button':
				return updateCursorForButton(time);
			case 'input':
				return updateCursorForInput(time);
		}
	}
	return updateNormalCursor(time);
}

function tweenCursor({ x, y, width, height, time }) {
	if (transitioning) {
		const timeFraction = ease((time - transitioning.time) / duration);
		x = lerp(transitioning.position.x, x, timeFraction);
		y = lerp(transitioning.position.y, y, timeFraction);
		width = lerp(transitioning.rect.width, width, timeFraction);
		height = lerp(transitioning.rect.height, height, timeFraction);
	}
	return { x, y, width, height };
}

function morphCursor({ x, y, width, height }) {
	const transitionX = x - width / 2;
	const transitionY = y - height / 2;
	cursor.style.transform = `translate(${transitionX}px, ${transitionY}px)`;
	cursor.style.width = `${width}px`;
	cursor.style.height = `${height}px`;
	cursor.style.transformOrigin = `${transitionX}px ${transitionY}px`;
}

function lerp(a, b, n) {
	return (1 - n) * a + n * b;
}

function offset(difference, size, shiftFactor = 0.1) {
	const shift = shiftFactor * 100;
	const rad = difference / size;
	return ((Math.pow(rad, 3) + rad) / 2) * size * shiftFactor;
}

function updateNormalCursor(time) {
	const { x, y, width, height } = tweenCursor({
		x: mousePosition.x,
		y: mousePosition.y,
		width: defaultCursorSize,
		height: defaultCursorSize,
		time
	});

	morphCursor({ x, y, width, height });
	return { x, y };
}

function updateCursorForButton(time) {
	const { rect } = hoverContext;
	const halfWidth = rect.width / 2;
	const halfHeight = rect.height / 2;
	const center = {
		x: rect.left + halfWidth,
		y: rect.top + halfHeight
	};

	const { x, y, width, height } = tweenCursor({
		x: center.x + offset(mousePosition.x - center.x, halfWidth),
		y: center.y + offset(mousePosition.y - center.y, halfHeight),
		width: rect.width,
		height: rect.height,
		time
	});

	morphCursor({ x, y, width, height });
	return { x, y };
}

function updateCursorForInput(time) {
	const { x, y, width, height } = tweenCursor({
		x: mousePosition.x,
		y: mousePosition.y,
		width: 2,
		height: 30,
		time
	});

	morphCursor({ x, y, width, height });
	return { x, y };
}

function setHoverContext(el, type) {
	hoverContext = {
		type,
		rect: el.getBoundingClientRect()
	};
}

function clearHoverContext() {
	hoverContext = null;
}

document.addEventListener('mousemove', setPosition);

requestAnimationFrame(function update(time) {
	requestAnimationFrame(update);
	cursorPosition = updateCursor(time);
});

function startTransitioning() {
	transitioning = {
		position: { ...cursorPosition },
		time: performance.now(),
		rect: cursor.getBoundingClientRect()
	};
}

document.querySelectorAll('[data-hover]').forEach((element) => {
	const type = element.dataset.hover;
	element.addEventListener('mouseenter', () => {
		setHoverContext(element, type);
		startTransitioning();
	});
	element.addEventListener('mouseleave', (event) => {
		clearHoverContext();
		startTransitioning();
	});
});

document.querySelectorAll("[name='ease']").forEach((input) => {
	input.addEventListener('input', (event) => {
		const ease = event.target.value;
		duration = ease === 'elastic' ? 1500 : 400;
		easeMode = ease;
	});
});
```
